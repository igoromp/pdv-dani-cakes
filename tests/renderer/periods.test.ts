import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  daysAgo,
  DEFAULT_PRESET,
  fmtDate,
  fmtDay,
  PRESETS,
  startOfMonth,
  toISO,
  today
} from '../../src/renderer/src/periods'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)) // 2026-03-15, mês com dias suficientes p/ testar
})

afterAll(() => {
  vi.useRealTimers()
})

describe('toISO / today', () => {
  it('formata como YYYY-MM-DD com zero à esquerda', () => {
    expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(today()).toBe('2026-03-15')
  })
})

describe('daysAgo', () => {
  it('volta N dias a partir de hoje', () => {
    expect(daysAgo(0)).toBe('2026-03-15')
    expect(daysAgo(6)).toBe('2026-03-09')
  })

  it('atravessa a virada de mês corretamente', () => {
    expect(daysAgo(20)).toBe('2026-02-23')
  })
})

describe('startOfMonth', () => {
  it('retorna o dia 1 do mês corrente', () => {
    expect(startOfMonth()).toBe('2026-03-01')
  })
})

describe('PRESETS', () => {
  it('"Hoje" cobre um único dia', () => {
    const preset = PRESETS.find(p => p.id === 'today')!
    expect(preset.range()).toEqual({ from: '2026-03-15', to: '2026-03-15' })
  })

  it('"7 dias" inclui hoje e mais 6 dias anteriores', () => {
    const preset = PRESETS.find(p => p.id === '7')!
    expect(preset.range()).toEqual({ from: '2026-03-09', to: '2026-03-15' })
  })

  it('DEFAULT_PRESET é o de 30 dias', () => {
    expect(DEFAULT_PRESET.id).toBe('30')
  })
})

describe('formatação para exibição', () => {
  it('fmtDay converte YYYY-MM-DD em DD/MM', () => {
    expect(fmtDay('2026-03-05')).toBe('05/03')
  })

  it('fmtDate converte YYYY-MM-DD em DD/MM/YYYY e trata nulo', () => {
    expect(fmtDate('2026-03-05')).toBe('05/03/2026')
    expect(fmtDate(null)).toBe('—')
  })
})
