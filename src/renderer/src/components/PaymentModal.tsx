import { useState } from 'react'
import { PaymentMethod, PAYMENT_LABELS } from '../types'
import { BanknoteIcon, CloseIcon, CreditCardIcon, SmartphoneIcon } from './icons'

const PAYMENT_ICONS: Record<PaymentMethod, typeof BanknoteIcon> = {
  cash: BanknoteIcon,
  card: CreditCardIcon,
  pix: SmartphoneIcon
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const QUICK_AMOUNTS = (total: number) => {
  const rounds = [total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100]
  return [...new Set(rounds)].slice(0, 4)
}

export interface PaymentLine {
  method: PaymentMethod
  amount: number
  received?: number
}

interface Props {
  total: number
  error?: string
  onConfirm: (payments: PaymentLine[]) => void
  onCancel: () => void
}

export default function PaymentModal({ total, error, onConfirm, onCancel }: Props) {
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amountInput, setAmountInput] = useState('')
  const [receivedInput, setReceivedInput] = useState('')

  const paid = lines.reduce((sum, l) => sum + l.amount, 0)
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100)

  const parsedAmount = amountInput ? parseFloat(amountInput.replace(',', '.')) || 0 : remaining
  const parsedReceived = parseFloat(receivedInput.replace(',', '.')) || 0

  const addLine = () => {
    const amount = Math.min(parsedAmount, remaining)
    if (amount <= 0) return
    const line: PaymentLine = { method, amount }
    if (method === 'cash' && parsedReceived > amount) {
      line.received = parsedReceived
    }
    setLines(prev => [...prev, line])
    setAmountInput('')
    setReceivedInput('')
  }

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index))
  }

  const totalChange = lines.reduce((sum, l) => sum + Math.max(0, (l.received ?? l.amount) - l.amount), 0)
  const canConfirm = remaining === 0 && lines.length > 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-96 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-rose-600 px-6 py-4 shrink-0">
          <h2 className="text-white font-bold text-lg">Finalizar Venda</h2>
          <p className="text-rose-100 text-sm">Total: {fmt(total)}</p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg pl-3 pr-1.5 py-1.5">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{PAYMENT_LABELS[line.method]}</span>
                    {line.received != null && (
                      <span className="text-xs text-gray-500 ml-2">troco {fmt(line.received - line.amount)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-800">{fmt(line.amount)}</span>
                    <button
                      onClick={() => removeLine(i)}
                      aria-label={`Remover pagamento ${PAYMENT_LABELS[line.method]}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-1 pt-1 border-t border-gray-100">
                <span className="text-sm text-gray-500">Restante</span>
                <span className="text-sm font-bold text-rose-600">{fmt(remaining)}</span>
              </div>
            </div>
          )}

          {remaining > 0 && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'card', 'pix'] as PaymentMethod[]).map(m => {
                    const Icon = PAYMENT_ICONS[m]
                    return (
                      <button
                        key={m}
                        onClick={() => setMethod(m)}
                        aria-pressed={method === m}
                        className={`py-3 min-h-[64px] rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-1 cursor-pointer
                          ${method === m ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        <Icon className="w-5 h-5" />
                        {PAYMENT_LABELS[m]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Valor {lines.length > 0 ? 'neste método' : ''}
                </label>
                <input
                  type="number"
                  placeholder={remaining.toFixed(2)}
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg font-semibold focus:outline-none focus:border-rose-500"
                  autoFocus
                  step="0.01"
                  min={0}
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {QUICK_AMOUNTS(remaining).map(amount => (
                    <button
                      key={amount}
                      onClick={() => setAmountInput(amount.toFixed(2))}
                      className="px-3.5 py-2 min-h-[40px] bg-gray-100 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer"
                    >
                      {fmt(amount)}
                    </button>
                  ))}
                </div>
              </div>

              {method === 'cash' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Valor recebido (opcional, p/ troco)</label>
                  <input
                    type="number"
                    placeholder="0,00"
                    value={receivedInput}
                    onChange={e => setReceivedInput(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg font-semibold focus:outline-none focus:border-rose-500"
                    step="0.01"
                    min={0}
                  />
                </div>
              )}

              <button
                onClick={addLine}
                className="w-full py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm cursor-pointer"
              >
                + Adicionar {PAYMENT_LABELS[method]}
              </button>
            </>
          )}

          {totalChange > 0 && remaining === 0 && (
            <div className="p-3 bg-green-50 rounded-lg flex justify-between">
              <span className="text-sm text-green-700 font-medium">Troco total:</span>
              <span className="text-sm font-bold text-green-700">{fmt(totalChange)}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(lines)}
              disabled={!canConfirm}
              className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
