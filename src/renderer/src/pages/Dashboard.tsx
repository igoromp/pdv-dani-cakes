import { useCallback, useEffect, useState } from 'react'
import { DashboardData, FinanceBasis, PAYMENT_LABELS, PaymentMethod, UnitType, formatCurrency } from '../types'
import { DEFAULT_PRESET, PRESETS, PresetId, fmtDay, pad, today } from '../periods'
import { AlertIcon, CalendarIcon } from '../components/icons'
import { BasisToggle } from '../components/BasisToggle'
import { Card, Delta, Tile } from '../components/stats'

const fmt = formatCurrency

const fmtCompact = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

const formatQuantity = (quantity: number, unitType: UnitType) => {
  if (unitType === 'kg') return `${quantity.toFixed(3)} kg`
  if (unitType === 'pack') return `${quantity} pct.`
  return `${quantity} un.`
}

const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
})

// Paleta categórica validada (CVD-safe sobre superfície branca) — usada apenas no
// mix de pagamentos, onde as categorias são o assunto. Os demais gráficos são de
// magnitude e usam um único tom da marca.
const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cash: '#2a78d6',
  card: '#008300',
  pix: '#e87ba4'
}

export default function Dashboard() {
  const [preset, setPreset] = useState<PresetId | 'custom'>(DEFAULT_PRESET.id)
  const [range, setRange] = useState(() => DEFAULT_PRESET.range())
  const [basis, setBasis] = useState<FinanceBasis>('cash')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setData(await window.api.dashboard.summary({ ...range, basis }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o dashboard.')
    }
  }, [range, basis])

  useEffect(() => { load() }, [load])

  const applyPreset = (p: typeof PRESETS[number]) => {
    setPreset(p.id)
    setRange(p.range())
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!data) {
    return <div className="h-full bg-gray-50" />
  }

  const { totals, previousTotals, today: todayTotals, daily, topProducts, paymentMix, hourly, finance } = data
  const averageTicket = totals.sale_count > 0 ? totals.gross_revenue / totals.sale_count : 0
  const previousTicket = previousTotals.sale_count > 0 ? previousTotals.gross_revenue / previousTotals.sale_count : 0

  // Escala única para faturamento e despesa: as duas barras do mesmo dia só são
  // comparáveis se dividirem o eixo.
  const maxDaily = Math.max(...daily.map(d => Math.max(d.net, d.expense)), 0)
  const maxProduct = Math.max(...topProducts.map(p => p.revenue), 0)
  const paymentTotal = paymentMix.reduce((sum, p) => sum + p.amount, 0)
  const expenseTotal = finance.byCategory.reduce((sum, c) => sum + c.amount, 0)
  const topCategory = finance.byCategory[0]

  const activeHours = hourly.filter(h => h.sale_count > 0).map(h => h.hour)
  const firstHour = activeHours.length ? Math.max(0, Math.min(...activeHours) - 1) : 8
  const lastHour = activeHours.length ? Math.min(23, Math.max(...activeHours) + 1) : 20
  const hourWindow = hourly.slice(firstHour, lastHour + 1)
  const maxHourly = Math.max(...hourWindow.map(h => h.sale_count), 0)
  const peakHour = activeHours.length
    ? hourly.reduce((best, h) => (h.sale_count > best.sale_count ? h : best), hourly[0])
    : null

  // Rótulos do eixo x espaçados para não colidirem em períodos longos.
  const labelEvery = Math.max(1, Math.ceil(daily.length / 10))

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800 mr-1">Dashboard</h1>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              aria-pressed={preset === p.id}
              className={`px-4 py-2 min-h-[40px] rounded-full text-xs font-semibold transition-colors cursor-pointer
                ${preset === p.id ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
          <BasisToggle value={basis} onChange={setBasis} />
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-gray-500">De</label>
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })) }}
              className="px-3 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <label className="text-xs text-gray-500">Até</label>
            <input
              type="date"
              value={range.to}
              min={range.from}
              max={today()}
              onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })) }}
              className="px-3 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile
            hero
            label="Faturamento líquido"
            value={fmt(totals.net_revenue)}
            hint={<Delta current={totals.net_revenue} previous={previousTotals.net_revenue} />}
          />
          <Tile
            label="Despesas"
            value={fmt(finance.current.expenses)}
            hint={<Delta current={finance.current.expenses} previous={finance.previous.expenses} />}
          />
          <Tile
            hero
            label="Lucro"
            value={fmt(finance.current.profit)}
            tone={finance.current.profit >= 0 ? 'positive' : 'negative'}
            hint={<Delta current={finance.current.profit} previous={finance.previous.profit} />}
          />
          <Tile
            label="Margem de lucro"
            value={`${finance.current.margin.toFixed(1)}%`}
            tone={finance.current.margin >= 0 ? 'positive' : 'negative'}
            hint={
              <span className="text-xs text-gray-500">
                {finance.previous.revenue > 0
                  ? `${finance.previous.margin.toFixed(1)}% no período anterior`
                  : 'sem base anterior'}
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile
            label="Vendas no período"
            value={String(totals.sale_count)}
            hint={<Delta current={totals.sale_count} previous={previousTotals.sale_count} />}
          />
          <Tile
            label="Ticket médio"
            value={fmt(averageTicket)}
            hint={<Delta current={averageTicket} previous={previousTicket} />}
          />
          <Tile
            label="Hoje"
            value={fmt(todayTotals.total)}
            hint={<span className="text-xs text-gray-500">{todayTotals.count} venda(s) registradas hoje</span>}
          />
          <Tile
            label="Dívida em aberto"
            value={fmt(finance.payables.open_amount)}
            tone={finance.payables.overdue_count > 0 ? 'negative' : 'default'}
            hint={
              <span className="text-xs text-gray-500">
                {finance.payables.open_count === 0
                  ? 'Nenhuma conta em aberto'
                  : finance.payables.overdue_count > 0
                    ? `${fmt(finance.payables.overdue_amount)} já vencidos`
                    : `${finance.payables.open_count} conta(s) a pagar`}
              </span>
            }
          />
        </div>

        {(totals.cancellation_count > 0 || totals.backdated_count > 0 || finance.payables.due_soon_count > 0) && (
          <div className="flex flex-wrap gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
            {totals.cancellation_count > 0 && (
              <div className="flex items-center gap-2">
                <AlertIcon className="w-4 h-4 text-[#d03b3b]" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  <strong className="text-gray-800">{fmt(totals.cancelled_amount)}</strong> em cancelamentos
                  <span className="text-gray-400"> ({totals.cancellation_count} operação(ões))</span>
                </span>
              </div>
            )}
            {totals.backdated_count > 0 && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#eda100]" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  <strong className="text-gray-800">{totals.backdated_count}</strong> venda(s) lançada(s) retroativamente
                </span>
              </div>
            )}
            {finance.payables.due_soon_count > 0 && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#eda100]" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  <strong className="text-gray-800">{fmt(finance.payables.due_soon_amount)}</strong> vencem nos próximos 7 dias
                  <span className="text-gray-400"> ({finance.payables.due_soon_count} conta(s))</span>
                </span>
              </div>
            )}
          </div>
        )}

        {daily.length > 1 && (
          <Card
            title="Faturamento e despesa por dia"
            aside={
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" aria-hidden="true" />
                  Faturamento
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" aria-hidden="true" />
                  Despesa
                </span>
              </span>
            }
          >
            <figure className="m-0">
              <div className="relative h-52">
                {/* grade recessiva */}
                <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                  {[1, 0.5, 0].map(step => (
                    <div key={step} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12 shrink-0 text-right tabular-nums">
                        {maxDaily > 0 ? fmtCompact(maxDaily * step) : ''}
                      </span>
                      <div className="flex-1 border-t border-gray-200" />
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 pl-14 flex items-end gap-[2px]">
                  {daily.map(d => {
                    const netHeight = maxDaily > 0 ? Math.max(d.net > 0 ? 2 : 0, (d.net / maxDaily) * 100) : 0
                    const expenseHeight = maxDaily > 0 ? Math.max(d.expense > 0 ? 2 : 0, (d.expense / maxDaily) * 100) : 0
                    return (
                      <div key={d.day} className="group relative flex-1 h-full flex items-end justify-center gap-[1px]">
                        <div
                          className="flex-1 max-w-[16px] rounded-t bg-rose-500 group-hover:bg-rose-600 transition-colors"
                          style={{ height: `${netHeight}%` }}
                        />
                        <div
                          className="flex-1 max-w-[16px] rounded-t bg-slate-500 group-hover:bg-slate-600 transition-colors"
                          style={{ height: `${expenseHeight}%` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                          <div className="bg-gray-900 text-white text-[11px] rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
                            <div className="font-semibold">{fmtDay(d.day)}</div>
                            <div>Faturamento: {fmt(d.net)}</div>
                            <div>Despesa: {fmt(d.expense)}</div>
                            <div className={d.profit >= 0 ? 'text-green-300' : 'text-red-300'}>
                              Lucro: {fmt(d.profit)}
                            </div>
                            <div className="text-gray-300">{d.sale_count} venda(s)</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="pl-14 flex gap-[2px] mt-1.5">
                {daily.map((d, i) => (
                  <div key={d.day} className="flex-1 min-w-0 text-[10px] text-gray-400 text-center whitespace-nowrap">
                    {i % labelEvery === 0 ? fmtDay(d.day) : ''}
                  </div>
                ))}
              </div>
              <table className="sr-only">
                <caption>Faturamento, despesa e lucro por dia</caption>
                <thead>
                  <tr><th>Dia</th><th>Faturamento</th><th>Despesa</th><th>Lucro</th><th>Vendas</th></tr>
                </thead>
                <tbody>
                  {daily.map(d => (
                    <tr key={d.day}>
                      <td>{fmtDay(d.day)}</td><td>{fmt(d.net)}</td><td>{fmt(d.expense)}</td>
                      <td>{fmt(d.profit)}</td><td>{d.sale_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Produtos mais vendidos" aside={topProducts.length ? 'por faturamento' : undefined}>
            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhuma venda no período</p>
            ) : (
              <ul className="space-y-2.5">
                {topProducts.map(p => (
                  <li key={p.name}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm text-gray-800 truncate">{p.name}</span>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">{fmt(p.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{ width: `${maxProduct > 0 ? (p.revenue / maxProduct) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-24 shrink-0 text-right">
                        {formatQuantity(p.quantity, p.unit_type)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Para onde vai o dinheiro"
            aside={
              topCategory && expenseTotal > 0
                ? `${topCategory.category}: ${((topCategory.amount / expenseTotal) * 100).toFixed(0)}% do gasto`
                : undefined
            }
          >
            {finance.byCategory.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhuma despesa no período</p>
            ) : (
              <ul className="space-y-2.5">
                {finance.byCategory.slice(0, 8).map(c => (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm text-gray-800 truncate">{c.category}</span>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">{fmt(c.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-500 rounded-full"
                          style={{ width: `${expenseTotal > 0 ? (c.amount / expenseTotal) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-24 shrink-0 text-right">
                        {totals.net_revenue > 0
                          ? `${((c.amount / totals.net_revenue) * 100).toFixed(0)}% da receita`
                          : `${c.count}x`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Formas de pagamento" aside={paymentTotal > 0 ? fmt(paymentTotal) : undefined}>
            {paymentTotal === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhum pagamento no período</p>
            ) : (
              <>
                <div className="flex gap-[2px] h-4 mb-3">
                  {paymentMix.map(p => (
                    <div
                      key={p.method}
                      className="h-full first:rounded-l last:rounded-r"
                      style={{
                        width: `${(p.amount / paymentTotal) * 100}%`,
                        backgroundColor: PAYMENT_COLORS[p.method]
                      }}
                    />
                  ))}
                </div>
                <ul className="space-y-2">
                  {paymentMix.map(p => (
                    <li key={p.method} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: PAYMENT_COLORS[p.method] }}
                        aria-hidden="true"
                      />
                      <span className="text-gray-600">{PAYMENT_LABELS[p.method]}</span>
                      <span className="text-gray-400 text-xs">{p.count}x</span>
                      <span className="ml-auto font-semibold text-gray-800 tabular-nums">{fmt(p.amount)}</span>
                      <span className="text-xs text-gray-400 tabular-nums w-12 text-right">
                        {((p.amount / paymentTotal) * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card
            title="Movimento por horário"
            aside={peakHour ? `Pico às ${pad(peakHour.hour)}h` : undefined}
          >
            {maxHourly === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhuma venda no período</p>
            ) : (
              <div className="flex items-end gap-[3px] h-24">
                {hourWindow.map(h => (
                  <div key={h.hour} className="group relative flex-1 h-full flex flex-col justify-end items-center gap-1">
                    <div
                      className="w-full max-w-[28px] rounded-t bg-rose-400 group-hover:bg-rose-600 transition-colors"
                      style={{ height: `${Math.max(h.sale_count > 0 ? 3 : 0, (h.sale_count / maxHourly) * 100)}%` }}
                    />
                    <span className="text-[9px] text-gray-400 tabular-nums">{pad(h.hour)}</span>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                      <div className="bg-gray-900 text-white text-[11px] rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
                        <div className="font-semibold">{pad(h.hour)}h</div>
                        <div>{h.sale_count} venda(s)</div>
                        <div className="text-gray-300">{fmt(h.net)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Próximos agendamentos"
          aside={data.appointmentStats.today_count > 0 ? `${data.appointmentStats.today_count} para hoje` : undefined}
        >
          {data.upcomingAppointments.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nenhum agendamento em aberto</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {data.upcomingAppointments.map(appt => (
                  <li key={appt.id} className="flex items-center gap-3 py-2">
                    <CalendarIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium text-gray-800 truncate">{appt.customer_name}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(appt.scheduled_at)}</span>
                    <span className="ml-auto text-sm font-semibold text-gray-800 tabular-nums">{fmt(appt.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-3 mt-1 border-t border-gray-200 text-sm">
                <span className="text-gray-500">Total a receber (agendado)</span>
                <span className="font-bold text-rose-600 tabular-nums">{fmt(data.appointmentStats.upcoming_total)}</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
