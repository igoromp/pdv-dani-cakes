// Presets de período compartilhados pelo Dashboard e pelo Financeiro — as duas
// telas precisam recortar exatamente o mesmo intervalo para os números baterem.

export const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => toISO(new Date())

export const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

export const startOfMonth = () => {
  const d = new Date()
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

export type PresetId = 'today' | '7' | '30' | '90' | 'month'

export const PRESETS: Array<{ id: PresetId; label: string; range: () => { from: string; to: string } }> = [
  { id: 'today', label: 'Hoje', range: () => ({ from: today(), to: today() }) },
  { id: '7', label: '7 dias', range: () => ({ from: daysAgo(6), to: today() }) },
  { id: '30', label: '30 dias', range: () => ({ from: daysAgo(29), to: today() }) },
  { id: '90', label: '90 dias', range: () => ({ from: daysAgo(89), to: today() }) },
  { id: 'month', label: 'Este mês', range: () => ({ from: startOfMonth(), to: today() }) }
]

export const DEFAULT_PRESET = PRESETS[2]

/** 'YYYY-MM-DD' -> 'DD/MM' */
export const fmtDay = (iso: string) => {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' */
export const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}
