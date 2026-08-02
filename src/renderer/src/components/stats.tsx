// Blocos de indicador compartilhados pelo Dashboard e pelo Financeiro.
import type { ReactNode } from 'react'

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return <span className="text-xs text-gray-400">sem base anterior</span>
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up = pct >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-700' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs. período anterior
    </span>
  )
}

export type TileTone = 'default' | 'positive' | 'negative'

const TONE_CLASSES: Record<TileTone, string> = {
  default: 'text-gray-800',
  positive: 'text-green-700',
  negative: 'text-red-600'
}

interface TileProps {
  label: string
  value: string
  hint?: ReactNode
  hero?: boolean
  tone?: TileTone
}

export function Tile({ label, value, hint, hero, tone = 'default' }: TileProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`${hero ? 'text-3xl' : 'text-2xl'} font-bold ${TONE_CLASSES[tone]} mt-1 leading-tight`}>
        {value}
      </div>
      {hint && <div className="mt-1">{hint}</div>}
    </div>
  )
}

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {aside && <span className="text-xs text-gray-500">{aside}</span>}
      </div>
      {children}
    </section>
  )
}
