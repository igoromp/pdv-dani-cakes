import { FinanceBasis, FINANCE_BASIS_HINTS, FINANCE_BASIS_LABELS } from '../types'

const OPTIONS: FinanceBasis[] = ['cash', 'accrual']

// Alterna entre caixa e competência. Fica junto do filtro de período porque muda
// o significado do mesmo recorte de datas.
export function BasisToggle({
  value,
  onChange
}: {
  value: FinanceBasis
  onChange: (basis: FinanceBasis) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-gray-100 p-0.5" role="group" aria-label="Regime de apuração">
      {OPTIONS.map(option => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          title={FINANCE_BASIS_HINTS[option]}
          className={`px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-semibold transition-colors cursor-pointer
            ${value === option ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {FINANCE_BASIS_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
