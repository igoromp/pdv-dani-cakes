import * as db from './database'

// Estados finais devolvidos pelo servidor de webhook (espelham a Orders API do
// Mercado Pago). Qualquer outro valor é tratado como "ainda em andamento".
const SUCCESS_STATUSES = new Set(['processed', 'accredited', 'approved'])
const FAILURE_STATUSES = new Set(['canceled', 'cancelled', 'rejected', 'expired', 'refunded'])

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000
const POLL_INTERVAL_MS = 2500

export interface PointConfig {
  enabled: boolean
  webhookUrl: string
  deviceId: string
  apiToken: string
}

/** O que o renderer pode ver: nunca inclui o token, só se ele está preenchido. */
export interface PublicPointConfig {
  enabled: boolean
  webhookUrl: string
  deviceId: string
  hasToken: boolean
}

export function getPointConfig(): PointConfig {
  return {
    enabled: db.getSetting('mp_point_enabled') === '1',
    webhookUrl: (db.getSetting('mp_point_webhook_url') ?? '').replace(/\/+$/, ''),
    deviceId: db.getSetting('mp_point_device_id') ?? '',
    apiToken: db.getSetting('mp_point_api_token') ?? ''
  }
}

export function getPublicPointConfig(): PublicPointConfig {
  const config = getPointConfig()
  return {
    enabled: config.enabled,
    webhookUrl: config.webhookUrl,
    deviceId: config.deviceId,
    hasToken: config.apiToken.length > 0
  }
}

export interface SavePointConfigInput {
  enabled: boolean
  webhookUrl: string
  deviceId: string
  /** Ausente/vazio mantém o token já gravado — a tela nunca o recebe de volta. */
  apiToken?: string
}

export function savePointConfig(input: SavePointConfigInput): PublicPointConfig {
  const webhookUrl = String(input.webhookUrl ?? '').trim().replace(/\/+$/, '')
  const deviceId = String(input.deviceId ?? '').trim()

  if (input.enabled) {
    if (!/^https:\/\//i.test(webhookUrl)) {
      throw new Error('A URL do servidor precisa começar com https:// para ativar a maquininha.')
    }
    if (!deviceId) {
      throw new Error('Informe o ID da maquininha (device_id).')
    }
    const token = input.apiToken?.trim() || db.getSetting('mp_point_api_token') || ''
    if (!token) {
      throw new Error('Informe o token de acesso ao servidor.')
    }
  }

  db.setSetting('mp_point_enabled', input.enabled ? '1' : '0')
  db.setSetting('mp_point_webhook_url', webhookUrl)
  db.setSetting('mp_point_device_id', deviceId)
  if (input.apiToken?.trim()) {
    db.setSetting('mp_point_api_token', input.apiToken.trim())
  }

  return getPublicPointConfig()
}

function requireConfigured(): PointConfig {
  const config = getPointConfig()
  if (!config.enabled) throw new Error('A cobrança pela maquininha está desativada.')
  if (!config.webhookUrl || !config.deviceId || !config.apiToken) {
    throw new Error('A maquininha não está configurada. Verifique em Usuários → Maquininha.')
  }
  return config
}

async function apiFetch(
  config: PointConfig,
  pathname: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${config.webhookUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...init.headers
    }
  })
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    /* corpo não-JSON: cai no genérico abaixo */
  }
  return `O servidor respondeu ${response.status}.`
}

export async function testConnection(): Promise<{ ok: true }> {
  const config = getPointConfig()
  if (!config.webhookUrl) throw new Error('Informe a URL do servidor antes de testar.')

  // /health é público: confirma que a URL responde. Em seguida uma rota
  // autenticada confirma que o token confere — um 401 aqui é erro de token,
  // não de endereço.
  const health = await apiFetch(config, '/health')
  if (!health.ok) throw new Error(`O servidor respondeu ${health.status} em /health.`)

  const authCheck = await apiFetch(config, '/orders/teste-de-conexao')
  if (authCheck.status === 401) {
    throw new Error('O servidor respondeu, mas recusou o token de acesso.')
  }
  return { ok: true }
}

export interface ChargeResult {
  orderId: string
}

export async function charge(input: {
  amount: number
  externalReference?: string
}): Promise<ChargeResult> {
  const config = requireConfigured()

  const response = await apiFetch(config, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      device_id: config.deviceId,
      amount: input.amount,
      external_reference: input.externalReference,
      description: 'Venda PDV Dani Cakes'
    })
  })

  if (!response.ok) throw new Error(await readError(response))

  const order = (await response.json()) as { id?: string }
  if (!order?.id) throw new Error('O servidor não devolveu o identificador da cobrança.')
  return { orderId: order.id }
}

export type PointOutcome =
  | { result: 'approved'; status: string }
  | { result: 'refused'; status: string }
  | { result: 'timeout' }

function classify(status: string): PointOutcome | null {
  const normalized = status.toLowerCase()
  if (SUCCESS_STATUSES.has(normalized)) return { result: 'approved', status }
  if (FAILURE_STATUSES.has(normalized)) return { result: 'refused', status }
  return null
}

async function pollOnce(config: PointConfig, orderId: string): Promise<PointOutcome | null> {
  const response = await apiFetch(config, `/orders/${encodeURIComponent(orderId)}`)
  if (!response.ok) return null
  const body = (await response.json()) as { status?: string }
  return body?.status ? classify(body.status) : null
}

/**
 * Escuta o resultado por SSE — só o processo main consegue, porque EventSource
 * no renderer não permite mandar o header Authorization. Se o stream falhar ou
 * cair, o polling assume; por isso o SSE não precisa de lógica de reconexão.
 */
async function waitViaSse(
  config: PointConfig,
  orderId: string,
  signal: AbortSignal
): Promise<PointOutcome | null> {
  const response = await apiFetch(config, `/orders/${encodeURIComponent(orderId)}/events`, {
    headers: { Accept: 'text/event-stream' },
    signal
  })
  if (!response.ok || !response.body) return null

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return null

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''

      for (const chunk of chunks) {
        const dataLine = chunk.split('\n').find(line => line.startsWith('data:'))
        if (!dataLine) continue
        try {
          const data = JSON.parse(dataLine.slice(5).trim()) as { status?: string }
          const outcome = data.status ? classify(data.status) : null
          if (outcome) return outcome
        } catch {
          /* evento sem JSON válido (ex.: keepalive): ignora */
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined)
  }
}

export async function awaitResult(
  orderId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PointOutcome> {
  const config = requireConfigured()
  const deadline = Date.now() + timeoutMs
  const controller = new AbortController()

  // SSE e polling correm juntos de propósito: o SSE entrega o resultado na
  // hora quando a conexão está boa, e o polling cobre queda de rede sem que a
  // venda fique travada esperando um evento que não vem mais.
  const sse = waitViaSse(config, orderId, controller.signal).catch(() => null)

  try {
    while (Date.now() < deadline) {
      const settled = await Promise.race([
        sse,
        new Promise<null>(resolve => setTimeout(() => resolve(null), POLL_INTERVAL_MS))
      ])
      if (settled) return settled

      const polled = await pollOnce(config, orderId).catch(() => null)
      if (polled) return polled
    }
    return { result: 'timeout' }
  } finally {
    controller.abort()
  }
}
