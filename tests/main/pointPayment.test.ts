import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../../src/main/database'
import * as point from '../../src/main/pointPayment'

beforeAll(() => {
  db.initDb()
})

afterAll(() => {
  db.closeDb()
})

const VALID = {
  enabled: true,
  webhookUrl: 'https://webhook.exemplo.com.br',
  deviceId: 'PAX_A910__SMARTPOS123',
  apiToken: 'token-secreto'
}

beforeEach(() => {
  // Volta ao estado desligado entre os testes para um caso não herdar config do outro.
  point.savePointConfig({ enabled: false, webhookUrl: '', deviceId: '' })
  db.setSetting('mp_point_api_token', '')
})

describe('feature toggle', () => {
  it('vem desligado por padrão', () => {
    expect(point.getPointConfig().enabled).toBe(false)
  })

  it('salva e reflete o estado ligado', () => {
    point.savePointConfig(VALID)
    expect(point.getPointConfig().enabled).toBe(true)
  })

  it('desligar não exige nenhum campo preenchido', () => {
    expect(() =>
      point.savePointConfig({ enabled: false, webhookUrl: '', deviceId: '' })
    ).not.toThrow()
  })

  it('desligar preserva os dados já configurados, para religar sem redigitar', () => {
    point.savePointConfig(VALID)
    point.savePointConfig({ enabled: false, webhookUrl: VALID.webhookUrl, deviceId: VALID.deviceId })

    const config = point.getPointConfig()
    expect(config.enabled).toBe(false)
    expect(config.deviceId).toBe(VALID.deviceId)
    expect(config.apiToken).toBe(VALID.apiToken)
  })
})

describe('validação ao ativar', () => {
  it('exige https na URL', () => {
    expect(() => point.savePointConfig({ ...VALID, webhookUrl: 'http://sem-tls.com' })).toThrow(/https/)
  })

  it('exige o device_id', () => {
    expect(() => point.savePointConfig({ ...VALID, deviceId: '  ' })).toThrow(/maquininha/i)
  })

  it('exige token quando ainda não há um gravado', () => {
    expect(() => point.savePointConfig({ ...VALID, apiToken: '' })).toThrow(/token/i)
  })

  it('aceita token vazio quando já existe um gravado (mantém o atual)', () => {
    point.savePointConfig(VALID)
    expect(() => point.savePointConfig({ ...VALID, apiToken: '' })).not.toThrow()
    expect(point.getPointConfig().apiToken).toBe(VALID.apiToken)
  })

  it('normaliza a URL removendo a barra final', () => {
    point.savePointConfig({ ...VALID, webhookUrl: 'https://webhook.exemplo.com.br/' })
    expect(point.getPointConfig().webhookUrl).toBe('https://webhook.exemplo.com.br')
  })
})

describe('configuração exposta ao renderer', () => {
  it('nunca inclui o token, só se ele existe', () => {
    point.savePointConfig(VALID)
    const publicConfig = point.getPublicPointConfig() as Record<string, unknown>

    expect(publicConfig.hasToken).toBe(true)
    expect(publicConfig.apiToken).toBeUndefined()
    expect(JSON.stringify(publicConfig)).not.toContain(VALID.apiToken)
  })

  it('hasToken é false quando nenhum token foi gravado', () => {
    expect(point.getPublicPointConfig().hasToken).toBe(false)
  })
})

describe('proteção do fluxo de cobrança', () => {
  it('não cobra com o recurso desligado', async () => {
    await expect(point.charge({ amount: 10 })).rejects.toThrow(/desativada/i)
  })

  it('não cobra se estiver ligado porém sem configuração completa', async () => {
    // Estado que só é alcançável por edição direta do banco, não pela tela.
    db.setSetting('mp_point_enabled', '1')
    db.setSetting('mp_point_webhook_url', '')
    await expect(point.charge({ amount: 10 })).rejects.toThrow(/não está configurada/i)
  })
})
