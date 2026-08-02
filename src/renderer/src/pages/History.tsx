import { useEffect, useState } from 'react'
import { Sale, SaleItem, SalePayment, PAYMENT_LABELS, PaymentMethod, formatUnitLabel } from '../types'
import { CloseIcon } from '../components/icons'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtDate = (s: string) => new Date(s).toLocaleString('pt-BR')
const today = () => new Date().toISOString().split('T')[0]

const formatItemQuantity = (item: SaleItem) => {
  if (item.unit_type === 'kg') {
    return `${item.quantity.toFixed(3)} kg x ${fmt(item.unit_price)}/kg`
  }
  if (item.unit_type === 'pack') {
    const totalUnits = item.quantity * (item.pack_size ?? 0)
    return `${item.quantity}x (${formatUnitLabel('pack', item.pack_size)}) = ${totalUnits} un.`
  }
  return `${item.quantity}x ${fmt(item.unit_price)}`
}

const methodLabel = (methods: string | null) => {
  if (!methods) return '—'
  const list = methods.split(',') as PaymentMethod[]
  if (list.length === 1) return PAYMENT_LABELS[list[0]]
  return `Múltiplo (${list.map(m => PAYMENT_LABELS[m]).join(' + ')})`
}

export default function History() {
  const [sales, setSales] = useState<Sale[]>([])
  const [breakdown, setBreakdown] = useState<Array<{ method: PaymentMethod; count: number }>>([])
  const [selected, setSelected] = useState<Sale | null>(null)
  const [items, setItems] = useState<SaleItem[]>([])
  const [payments, setPayments] = useState<SalePayment[]>([])
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [showAll, setShowAll] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<'item' | 'sale' | null>(null)
  const [cancelItemId, setCancelItemId] = useState<number | null>(null)
  const [cancelQty, setCancelQty] = useState('')
  const [cancelMethod, setCancelMethod] = useState<PaymentMethod>('cash')
  const [cancelError, setCancelError] = useState('')

  const filters = showAll ? undefined : { from, to }

  const load = async () => {
    const [salesData, breakdownData] = await Promise.all([
      window.api.sales.list(filters),
      window.api.sales.paymentBreakdown(filters)
    ])
    setSales(salesData)
    setBreakdown(breakdownData)
  }

  useEffect(() => { load() }, [from, to, showAll])

  const selectSale = async (sale: Sale) => {
    setSelected(sale)
    resetCancelForm()
    const [itemsData, paymentsData] = await Promise.all([
      window.api.sales.items(sale.id),
      window.api.sales.payments(sale.id)
    ])
    setItems(itemsData)
    setPayments(paymentsData)
  }

  const refreshSelected = async () => {
    if (!selected) return
    const [itemsData, paymentsData, salesData] = await Promise.all([
      window.api.sales.items(selected.id),
      window.api.sales.payments(selected.id),
      window.api.sales.list(filters)
    ])
    setItems(itemsData)
    setPayments(paymentsData)
    setSales(salesData)
    const breakdownData = await window.api.sales.paymentBreakdown(filters)
    setBreakdown(breakdownData)
  }

  const resetCancelForm = () => {
    setCancelTarget(null)
    setCancelItemId(null)
    setCancelQty('')
    setCancelMethod('cash')
    setCancelError('')
  }

  const openCancelItem = (item: SaleItem) => {
    setCancelTarget('item')
    setCancelItemId(item.id)
    setCancelQty(String(item.remaining_quantity ?? 0))
    setCancelError('')
  }

  const openCancelSale = () => {
    setCancelTarget('sale')
    setCancelItemId(null)
    setCancelError('')
  }

  const confirmCancelItem = async () => {
    if (!selected || cancelItemId == null) return
    const target = items.find(i => i.id === cancelItemId)
    const qty = target?.unit_type === 'kg' ? parseFloat(cancelQty.replace(',', '.')) : parseInt(cancelQty, 10)
    if (!qty || qty <= 0) return
    try {
      await window.api.sales.cancel(selected.id, {
        items: [{ sale_item_id: cancelItemId, quantity: qty }],
        method: cancelMethod
      })
      resetCancelForm()
      refreshSelected()
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Erro ao cancelar. Tente novamente.')
    }
  }

  const confirmCancelSale = async () => {
    if (!selected) return
    const lines = items
      .filter(i => (i.remaining_quantity ?? 0) > 0)
      .map(i => ({ sale_item_id: i.id, quantity: i.remaining_quantity as number }))
    if (lines.length === 0) return
    try {
      await window.api.sales.cancel(selected.id, { items: lines, method: cancelMethod })
      resetCancelForm()
      refreshSelected()
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Erro ao cancelar. Tente novamente.')
    }
  }

  const totalFiltered = sales.reduce((sum, s) => sum + s.total, 0)
  const saleCount = sales.filter(s => s.type === 'sale').length
  const cancellationCount = sales.filter(s => s.type === 'cancellation').length
  const hasRemaining = items.some(i => (i.remaining_quantity ?? 0) > 0)

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-800">Histórico</h1>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">De</label>
              <input
                type="date"
                value={from}
                onChange={e => { setFrom(e.target.value); setShowAll(false) }}
                disabled={showAll}
                className="px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
              />
              <label className="text-xs text-gray-500">Até</label>
              <input
                type="date"
                value={to}
                onChange={e => { setTo(e.target.value); setShowAll(false) }}
                disabled={showAll}
                className="px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer min-h-[44px] px-2 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Todo o período
            </label>
          </div>

          <div className="flex gap-6 mt-3 flex-wrap">
            <div>
              <div className="text-xs text-gray-500">Total do período (líquido)</div>
              <div className="text-xl font-bold text-rose-600">{fmt(totalFiltered)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Vendas</div>
              <div className="text-xl font-bold text-green-700">{saleCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Cancelamentos</div>
              <div className="text-xl font-bold text-red-600">{cancellationCount}</div>
            </div>
            {breakdown.map(({ method, count }) => (
              <div key={method}>
                <div className="text-xs text-gray-500">{PAYMENT_LABELS[method]}</div>
                <div className="text-xl font-bold text-gray-800">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sales.length === 0 ? (
            <div className="text-center text-gray-400 py-20">Nenhuma venda encontrada</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data/Hora</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Pagamento</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Itens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sales.map(sale => {
                  const isCancellation = sale.type === 'cancellation'
                  return (
                    <tr
                      key={sale.id}
                      onClick={() => selectSale(sale)}
                      className={`cursor-pointer transition-colors
                        ${isCancellation ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-green-50'}
                        ${selected?.id === sale.id ? (isCancellation ? 'bg-red-100' : 'bg-green-50') : ''}`}
                    >
                      <td className="px-6 py-3 text-sm text-gray-800">
                        {fmtDate(sale.created_at)}
                        {isCancellation && (
                          <span className="block text-xs text-red-500">Cancelamento — Venda #{sale.reversal_of_sale_id}</span>
                        )}
                        {sale.backdated === 1 && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase">
                            Retroativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${isCancellation ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {methodLabel(sale.payment_methods)}
                        </span>
                      </td>
                      <td className={`px-6 py-3 text-sm font-bold text-right
                        ${isCancellation ? 'text-red-600' : 'text-gray-800'}`}>
                        {fmt(sale.total)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-center">{sale.item_count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              {selected.type === 'cancellation' ? 'Cancelamento' : 'Venda'} #{selected.id}
            </h2>
            <button
              onClick={() => setSelected(null)}
              aria-label="Fechar detalhes"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3 text-sm text-gray-500 space-y-1 border-b border-gray-100">
            <div>{fmtDate(selected.created_at)}</div>
            {selected.type === 'cancellation' && (
              <div>Referente à venda <span className="font-medium text-gray-800">#{selected.reversal_of_sale_id}</span></div>
            )}
            {payments.map(p => (
              <div key={p.id}>
                {PAYMENT_LABELS[p.method]}: <span className="font-medium text-gray-800">{fmt(p.amount)}</span>
                {p.received != null && p.received > p.amount && (
                  <span className="text-xs text-gray-400"> (recebido {fmt(p.received)}, troco {fmt(p.received - p.amount)})</span>
                )}
              </div>
            ))}
            {selected.change_amount > 0 && (
              <div>Troco: <span className="font-medium text-gray-800">{fmt(selected.change_amount)}</span></div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {items.map(item => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-800">{item.product_name}</span>
                  <span className="text-sm font-semibold text-gray-800">{fmt(item.subtotal)}</span>
                </div>
                <div className="text-xs text-gray-500">{formatItemQuantity(item)}</div>
                {selected.type === 'sale' && (item.remaining_quantity ?? 0) > 0 && (
                  <button
                    onClick={() => openCancelItem(item)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 mt-1 -ml-2 px-2 py-1.5 rounded-lg cursor-pointer"
                  >
                    Cancelar {item.remaining_quantity !== item.quantity && `(${item.remaining_quantity} restante)`}
                  </button>
                )}
                {selected.type === 'sale' && item.remaining_quantity === 0 && (
                  <span className="text-xs text-gray-500 mt-1 block">Totalmente cancelado</span>
                )}

                {cancelTarget === 'item' && cancelItemId === item.id && (
                  <div className="mt-2 p-2 bg-red-50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={item.unit_type === 'kg' ? 0.01 : 1}
                        step={item.unit_type === 'kg' ? 0.01 : 1}
                        max={item.remaining_quantity ?? undefined}
                        aria-label="Quantidade a cancelar"
                        value={cancelQty}
                        onChange={e => setCancelQty(e.target.value)}
                        className="w-20 px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                      />
                      <select
                        value={cancelMethod}
                        onChange={e => setCancelMethod(e.target.value as PaymentMethod)}
                        aria-label="Método do estorno"
                        className="flex-1 px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                      >
                        {(['cash', 'card', 'pix'] as PaymentMethod[]).map(m => (
                          <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                    {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
                    <div className="flex gap-2">
                      <button onClick={resetCancelForm} className="flex-1 py-2 min-h-[40px] text-xs border border-gray-300 rounded-lg text-gray-600 cursor-pointer">
                        Voltar
                      </button>
                      <button onClick={confirmCancelItem} className="flex-1 py-2 min-h-[40px] text-xs bg-red-600 text-white rounded-lg font-medium cursor-pointer">
                        Confirmar estorno
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="flex justify-between">
              <span className="font-semibold text-gray-800">Total</span>
              <span className={`font-bold ${selected.type === 'cancellation' ? 'text-red-600' : 'text-rose-600'}`}>
                {fmt(selected.total)}
              </span>
            </div>

            {selected.type === 'sale' && hasRemaining && cancelTarget !== 'sale' && (
              <button
                onClick={openCancelSale}
                className="w-full py-2.5 min-h-[44px] border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 cursor-pointer"
              >
                Cancelar venda inteira
              </button>
            )}

            {cancelTarget === 'sale' && (
              <div className="p-2 bg-red-50 rounded-lg space-y-2">
                <label className="text-xs text-gray-600">Método do estorno</label>
                <select
                  value={cancelMethod}
                  onChange={e => setCancelMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                >
                  {(['cash', 'card', 'pix'] as PaymentMethod[]).map(m => (
                    <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                  ))}
                </select>
                {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
                <div className="flex gap-2">
                  <button onClick={resetCancelForm} className="flex-1 py-2 min-h-[40px] text-xs border border-gray-300 rounded-lg text-gray-600 cursor-pointer">
                    Voltar
                  </button>
                  <button onClick={confirmCancelSale} className="flex-1 py-2 min-h-[40px] text-xs bg-red-600 text-white rounded-lg font-medium cursor-pointer">
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
