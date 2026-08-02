import { useCallback, useEffect, useState } from 'react'
import {
  EXPENSE_STATUS_LABELS,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  FINANCE_BASIS_HINTS,
  FinanceBasis,
  FinanceSummary,
  PAYMENT_LABELS,
  PaymentMethod,
  RecurringExpense,
  formatCurrency
} from '../types'
import { DEFAULT_PRESET, PRESETS, PresetId, fmtDate, today } from '../periods'
import { AlertIcon, ChevronRightIcon, CloseIcon } from '../components/icons'
import { BasisToggle } from '../components/BasisToggle'
import { Card, Delta, Tile } from '../components/stats'

type StatusFilter = ExpenseStatus | 'all'

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'Em aberto' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'paid', label: 'Pagas' }
]

const STATUS_BADGE: Record<ExpenseStatus, string> = {
  paid: 'bg-green-100 text-green-700',
  open: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700'
}

interface Form {
  description: string
  amount: string
  category_id: string
  supplier: string
  incurred_on: string
  due_on: string
  paid: boolean
  paid_on: string
  payment_method: PaymentMethod
  notes: string
}

const emptyForm = (): Form => ({
  description: '',
  amount: '',
  category_id: '',
  supplier: '',
  incurred_on: today(),
  due_on: '',
  paid: true,
  paid_on: today(),
  payment_method: 'cash',
  notes: ''
})

type PanelMode = 'expense' | 'recurring' | null

interface RecurringForm {
  description: string
  amount: string
  category_id: string
  supplier: string
  due_day: string
  start_month: string
  notes: string
  active: boolean
}

const thisMonth = () => today().slice(0, 7)

const nextMonth = () => {
  const [year, month] = today().split('-').map(Number)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const emptyRecurringForm = (): RecurringForm => ({
  description: '',
  amount: '',
  category_id: '',
  supplier: '',
  due_day: '10',
  start_month: thisMonth(),
  notes: '',
  active: true
})

/** 'YYYY-MM' -> 'MM/YYYY' */
const fmtMonth = (month: string | null) => {
  if (!month) return '—'
  const [year, m] = month.split('-')
  return `${m}/${year}`
}

export default function Finance() {
  const [preset, setPreset] = useState<PresetId | 'custom'>(DEFAULT_PRESET.id)
  const [range, setRange] = useState(() => DEFAULT_PRESET.range())
  const [basis, setBasis] = useState<FinanceBasis>('cash')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  // A busca vai para o banco, então só acompanha a digitação depois que ela para.
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [showRecurring, setShowRecurring] = useState(false)
  const [error, setError] = useState('')

  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [payingMode, setPayingMode] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [recurringForm, setRecurringForm] = useState<RecurringForm>(emptyRecurringForm)
  const [formError, setFormError] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const [nextSummary, nextExpenses, nextCategories, nextRecurring] = await Promise.all([
        window.api.finance.summary({ ...range, basis }),
        window.api.finance.expenses({ ...range, basis, status, search: searchTerm || undefined }),
        window.api.finance.categories(),
        window.api.finance.recurring()
      ])
      setSummary(nextSummary)
      setExpenses(nextExpenses)
      setCategories(nextCategories)
      setRecurring(nextRecurring)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o financeiro.')
    }
  }, [range, basis, status, searchTerm])

  useEffect(() => { load() }, [load])

  // Só na montagem: se o app ficou aberto na virada do mês, as contas fixas do
  // mês novo aparecem sem reiniciar. Recarrega apenas se algo foi de fato gerado.
  useEffect(() => {
    let cancelled = false
    window.api.finance.generateRecurring()
      .then(created => { if (created > 0 && !cancelled) load() })
      .catch(() => undefined)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPreset = (p: typeof PRESETS[number]) => {
    setPreset(p.id)
    setRange(p.range())
  }

  const openNew = () => {
    setEditingId(null)
    setPayingMode(false)
    setForm(emptyForm())
    setFormError('')
    setPanelMode('expense')
  }

  const openNewRecurring = () => {
    setEditingId(null)
    setRecurringForm(emptyRecurringForm())
    setFormError('')
    setPanelMode('recurring')
    setShowRecurring(true)
  }

  const openEditRecurring = (rule: RecurringExpense) => {
    setEditingId(rule.id)
    setRecurringForm({
      description: rule.description,
      amount: rule.amount.toFixed(2),
      category_id: rule.category_id?.toString() ?? '',
      supplier: rule.supplier ?? '',
      due_day: String(rule.due_day),
      start_month: rule.start_month,
      notes: rule.notes ?? '',
      active: rule.active === 1
    })
    setFormError('')
    setPanelMode('recurring')
  }

  // Transformar uma despesa avulsa em fixa: o mês inicial é o SEGUINTE, senão o
  // molde geraria uma segunda cobrança para o mês que já foi lançado à mão.
  const openRepeat = (expense: Expense) => {
    setEditingId(null)
    setRecurringForm({
      description: expense.description,
      amount: expense.amount.toFixed(2),
      category_id: expense.category_id?.toString() ?? '',
      supplier: expense.supplier ?? '',
      due_day: String(Number((expense.due_on ?? expense.incurred_on).slice(8, 10))),
      start_month: nextMonth(),
      notes: expense.notes ?? '',
      active: true
    })
    setFormError('')
    setPanelMode('recurring')
    setShowRecurring(true)
  }

  const fillForm = (expense: Expense, forcePaid: boolean) => ({
    description: expense.description,
    amount: expense.amount.toFixed(2),
    category_id: expense.category_id?.toString() ?? '',
    supplier: expense.supplier ?? '',
    incurred_on: expense.incurred_on,
    due_on: expense.due_on ?? '',
    paid: forcePaid || expense.paid_on !== null,
    paid_on: expense.paid_on ?? today(),
    payment_method: expense.payment_method ?? 'cash',
    notes: expense.notes ?? ''
  })

  const openEdit = (expense: Expense) => {
    setEditingId(expense.id)
    setPayingMode(false)
    setForm(fillForm(expense, false))
    setFormError('')
    setPanelMode('expense')
  }

  // Quitar reaproveita o formulário de edição com o pagamento já marcado: é a mesma
  // gravação e ainda permite corrigir o valor na hora de pagar.
  const openPay = (expense: Expense) => {
    setEditingId(expense.id)
    setPayingMode(true)
    setForm(fillForm(expense, true))
    setFormError('')
    setPanelMode('expense')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      description: form.description.trim(),
      amount: parseFloat(form.amount.replace(',', '.')),
      category_id: form.category_id ? parseInt(form.category_id, 10) : null,
      supplier: form.supplier.trim() || null,
      incurred_on: form.incurred_on,
      due_on: form.due_on || null,
      paid_on: form.paid ? form.paid_on : null,
      payment_method: form.paid ? form.payment_method : null,
      notes: form.notes.trim() || null
    }

    try {
      setFormError('')
      if (editingId !== null) {
        await window.api.finance.updateExpense(editingId, payload)
      } else {
        await window.api.finance.createExpense(payload)
      }
      setPanelMode(null)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a despesa.')
    }
  }

  const handleRecurringSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      description: recurringForm.description.trim(),
      amount: parseFloat(recurringForm.amount.replace(',', '.')),
      category_id: recurringForm.category_id ? parseInt(recurringForm.category_id, 10) : null,
      supplier: recurringForm.supplier.trim() || null,
      due_day: parseInt(recurringForm.due_day, 10),
      start_month: recurringForm.start_month,
      notes: recurringForm.notes.trim() || null,
      active: recurringForm.active ? 1 : 0
    }

    try {
      setFormError('')
      if (editingId !== null) {
        await window.api.finance.updateRecurring(editingId, payload)
      } else {
        await window.api.finance.createRecurring(payload)
      }
      setPanelMode(null)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a despesa fixa.')
    }
  }

  const handleToggleRecurring = async (rule: RecurringExpense) => {
    await window.api.finance.toggleRecurring(rule.id, rule.active !== 1)
    await load()
  }

  const handleDeleteRecurring = async (rule: RecurringExpense) => {
    const confirmed = window.confirm(
      `Excluir a despesa fixa "${rule.description}"?\n\n` +
      `As ${rule.generated_count} despesa(s) já lançadas por ela continuam no histórico — ` +
      `só param de ser geradas daqui pra frente.`
    )
    if (!confirmed) return
    await window.api.finance.deleteRecurring(rule.id)
    if (panelMode === 'recurring' && editingId === rule.id) setPanelMode(null)
    await load()
  }

  const handleReopen = async (expense: Expense) => {
    await window.api.finance.reopenExpense(expense.id)
    await load()
  }

  const handleDelete = async (expense: Expense) => {
    const warning = expense.recurring_id
      ? '\n\nEla foi gerada por uma despesa fixa e será recriada na próxima abertura da tela. ' +
        'Para parar de vez, pause ou exclua a despesa fixa.'
      : ''
    if (!window.confirm(`Excluir a despesa "${expense.description}"?${warning}`)) return
    await window.api.finance.deleteExpense(expense.id)
    if (panelMode === 'expense' && editingId === expense.id) setPanelMode(null)
    await load()
  }

  const handleAddCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    try {
      const created = await window.api.finance.createCategory(name)
      setNewCategory('')
      setCategories(await window.api.finance.categories())
      const id = String(created.id)
      if (panelMode === 'recurring') setRecurringForm(f => ({ ...f, category_id: id }))
      else setForm(f => ({ ...f, category_id: id }))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível criar a categoria.')
    }
  }

  // Mesmo seletor nos dois formulários (despesa e despesa fixa).
  const categoryField = (value: string, onChange: (next: string) => void) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      >
        <option value="">Sem categoria</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          placeholder="Nova categoria..."
          aria-label="Nome da nova categoria de despesa"
          className="flex-1 px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
        />
        <button
          type="button"
          onClick={handleAddCategory}
          aria-label="Adicionar categoria de despesa"
          className="w-10 min-h-[40px] bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold cursor-pointer"
        >+</button>
      </div>
    </div>
  )

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!summary) {
    return <div className="h-full bg-gray-50" />
  }

  const { current, previous, byCategory, payables } = summary
  const categoryTotal = byCategory.reduce((sum, c) => sum + c.amount, 0)
  const topCategory = byCategory[0]
  const listIgnoresPeriod = status === 'open' || status === 'overdue'

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-800 mr-1">Financeiro</h1>
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
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <BasisToggle value={basis} onChange={setBasis} />
            <span className="text-xs text-gray-500">{FINANCE_BASIS_HINTS[basis]}</span>
            <button
              onClick={openNew}
              className="ml-auto px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors cursor-pointer"
            >
              + Nova despesa
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile
                label="Faturamento líquido"
                value={formatCurrency(current.revenue)}
                hint={
                  summary.totals.cancellation_count > 0 ? (
                    <span className="text-xs text-gray-500">
                      {formatCurrency(summary.totals.gross_revenue)} vendidos −{' '}
                      <span className="text-red-600">{formatCurrency(summary.totals.cancelled_amount)}</span>{' '}
                      cancelados
                    </span>
                  ) : (
                    <Delta current={current.revenue} previous={previous.revenue} />
                  )
                }
              />
              <Tile
                label="Despesas"
                value={formatCurrency(current.expenses)}
                hint={<span className="text-xs text-gray-500">{current.expense_count} lançamento(s)</span>}
              />
              <Tile
                hero
                label="Lucro"
                value={formatCurrency(current.profit)}
                tone={current.profit >= 0 ? 'positive' : 'negative'}
                hint={<Delta current={current.profit} previous={previous.profit} />}
              />
              <Tile
                label="Margem de lucro"
                value={`${current.margin.toFixed(1)}%`}
                tone={current.margin >= 0 ? 'positive' : 'negative'}
                hint={
                  <span className="text-xs text-gray-500">
                    {current.revenue > 0
                      ? `${formatCurrency(current.expenses / (current.revenue / 100))} de custo a cada R$ 100`
                      : 'Sem faturamento no período'}
                  </span>
                }
              />
            </div>

            {payables.open_count > 0 && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Contas a pagar (situação atual)
                </span>
                {payables.overdue_count > 0 && (
                  <span className="flex items-center gap-2 text-sm text-gray-600">
                    <AlertIcon className="w-4 h-4 text-[#d03b3b]" aria-hidden="true" />
                    <strong className="text-red-600">{formatCurrency(payables.overdue_amount)}</strong>
                    vencidas
                    <span className="text-gray-400">({payables.overdue_count})</span>
                  </span>
                )}
                {payables.due_soon_count > 0 && (
                  <span className="text-sm text-gray-600">
                    <strong className="text-amber-600">{formatCurrency(payables.due_soon_amount)}</strong>{' '}
                    vencem em 7 dias
                    <span className="text-gray-400"> ({payables.due_soon_count})</span>
                  </span>
                )}
                <span className="text-sm text-gray-600 ml-auto">
                  Dívida total em aberto{' '}
                  <strong className="text-gray-800">{formatCurrency(payables.open_amount)}</strong>
                  <span className="text-gray-400"> ({payables.open_count})</span>
                </span>
              </div>
            )}

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 flex-wrap px-4 py-3">
                <button
                  onClick={() => setShowRecurring(v => !v)}
                  aria-expanded={showRecurring}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer"
                >
                  <ChevronRightIcon
                    className={`w-4 h-4 text-gray-400 transition-transform ${showRecurring ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                  Despesas fixas
                </button>
                <span className="text-xs text-gray-500">
                  {summary.recurring.active_count === 0
                    ? 'Nenhuma cadastrada — o aluguel, a internet e as assinaturas entram aqui uma vez só'
                    : `${summary.recurring.active_count} ativa(s) · ${formatCurrency(summary.recurring.monthly_total)} por mês`}
                </span>
                <button
                  onClick={openNewRecurring}
                  className="ml-auto px-3.5 py-2 min-h-[40px] border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 cursor-pointer"
                >
                  + Nova despesa fixa
                </button>
              </div>

              {showRecurring && (
                recurring.length === 0 ? (
                  <p className="px-4 pb-6 pt-2 text-sm text-gray-400 text-center border-t border-gray-100">
                    Cadastre aluguel, internet, assinaturas e afins uma vez — a conta a pagar
                    de cada mês passa a ser criada sozinha.
                  </p>
                ) : (
                  <table className="w-full border-t border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoria</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Lançadas</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recurring.map(rule => (
                        <tr key={rule.id} className={`hover:bg-gray-50 ${rule.active ? '' : 'opacity-60'}`}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-800">{rule.description}</div>
                            {rule.supplier && <div className="text-xs text-gray-500">{rule.supplier}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{rule.category_name ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            todo dia {rule.due_day}
                            {!rule.active && (
                              <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                                pausada
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right tabular-nums">
                            {formatCurrency(rule.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">
                            {rule.generated_count}x
                            <span className="text-gray-400"> · até {fmtMonth(rule.last_period)}</span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleToggleRecurring(rule)}
                              className="text-sm text-gray-500 hover:text-amber-700 hover:bg-amber-50 px-2.5 py-2 rounded-lg cursor-pointer"
                            >
                              {rule.active ? 'Pausar' : 'Retomar'}
                            </button>
                            <button
                              onClick={() => openEditRecurring(rule)}
                              className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteRecurring(rule)}
                              className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </section>

            <Card
              title="Despesas por categoria"
              aside={
                topCategory && categoryTotal > 0
                  ? `${topCategory.category} concentra ${((topCategory.amount / categoryTotal) * 100).toFixed(0)}% do gasto`
                  : undefined
              }
            >
              {byCategory.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhuma despesa no período</p>
              ) : (
                <ul className="space-y-2.5">
                  {byCategory.map(c => (
                    <li key={c.category}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm text-gray-800 truncate">{c.category}</span>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-500 rounded-full"
                            style={{ width: `${categoryTotal > 0 ? (c.amount / categoryTotal) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums w-20 shrink-0 text-right">
                          {categoryTotal > 0 ? ((c.amount / categoryTotal) * 100).toFixed(0) : 0}% · {c.count}x
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-200">
                <div className="flex gap-1" role="group" aria-label="Filtrar por situação">
                  {STATUS_TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStatus(tab.id)}
                      aria-pressed={status === tab.id}
                      className={`px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer
                        ${status === tab.id ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Buscar descrição ou fornecedor..."
                  aria-label="Buscar despesa"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ml-auto w-full max-w-xs px-3 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {listIgnoresPeriod && (
                <p className="px-4 py-2 bg-amber-50 text-xs text-amber-800 border-b border-amber-100">
                  Contas em aberto são exibidas na íntegra, sem o filtro de período — dívida é
                  situação atual, não recorte de datas.
                </p>
              )}

              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Competência</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Situação</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expenses.map(expense => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{expense.description}</span>
                          {expense.recurring_id && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide"
                              title={`Gerada automaticamente pela despesa fixa · referente a ${fmtMonth(expense.period)}`}
                            >
                              fixa {fmtMonth(expense.period)}
                            </span>
                          )}
                        </div>
                        {expense.supplier && (
                          <div className="text-xs text-gray-500">{expense.supplier}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{expense.category_name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">{fmtDate(expense.incurred_on)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">{fmtDate(expense.due_on)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right tabular-nums">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[expense.status]}`}>
                          {EXPENSE_STATUS_LABELS[expense.status]}
                        </span>
                        {expense.paid_on && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {fmtDate(expense.paid_on)}
                            {expense.payment_method ? ` · ${PAYMENT_LABELS[expense.payment_method]}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {expense.status === 'paid' ? (
                          <button
                            onClick={() => handleReopen(expense)}
                            className="text-sm text-gray-500 hover:text-amber-700 hover:bg-amber-50 px-2.5 py-2 rounded-lg cursor-pointer"
                          >
                            Reabrir
                          </button>
                        ) : (
                          <button
                            onClick={() => openPay(expense)}
                            className="text-sm text-green-700 hover:bg-green-50 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                          >
                            Pagar
                          </button>
                        )}
                        {!expense.recurring_id && (
                          <button
                            onClick={() => openRepeat(expense)}
                            title="Transformar em despesa fixa mensal"
                            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-2 rounded-lg cursor-pointer"
                          >
                            Repetir
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(expense)}
                          className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(expense)}
                          className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                        {search
                          ? 'Nenhuma despesa encontrada'
                          : status === 'all'
                            ? 'Nenhuma despesa lançada nesse período'
                            : 'Nenhuma despesa nessa situação'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      </div>

      {panelMode === 'expense' && (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              {payingMode ? 'Registrar pagamento' : editingId !== null ? 'Editar despesa' : 'Nova despesa'}
            </h2>
            <button
              onClick={() => setPanelMode(null)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input
                type="text"
                required
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Farinha e açúcar do mês"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus={!payingMode}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {categoryField(form.category_id, next => setForm(f => ({ ...f, category_id: next })))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <input
                type="text"
                value={form.supplier}
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                placeholder="Ex.: Atacadão"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data da compra *</label>
                <input
                  type="date"
                  required
                  max={today()}
                  value={form.incurred_on}
                  onChange={e => setForm(f => ({ ...f, incurred_on: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                <input
                  type="date"
                  value={form.due_on}
                  onChange={e => setForm(f => ({ ...f, due_on: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Despesa já paga</span>
              </label>

              {form.paid ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data do pagamento</label>
                    <input
                      type="date"
                      required
                      max={today()}
                      value={form.paid_on}
                      onChange={e => setForm(f => ({ ...f, paid_on: e.target.value }))}
                      className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                      autoFocus={payingMode}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Forma de pagamento</label>
                    <select
                      value={form.payment_method}
                      onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                      className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map(method => (
                        <option key={method} value={method}>{PAYMENT_LABELS[method]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Fica como conta a pagar. No regime de caixa ela só entra no lucro no dia em
                  que for quitada.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPanelMode(null)}
                className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {panelMode === 'recurring' && (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              {editingId !== null ? 'Editar despesa fixa' : 'Nova despesa fixa'}
            </h2>
            <button
              onClick={() => setPanelMode(null)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleRecurringSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
            )}

            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Todo mês uma conta a pagar é criada automaticamente com esses dados. Se o valor
              vier diferente em algum mês, é só editar aquela despesa — o molde continua igual.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input
                type="text"
                required
                value={recurringForm.description}
                onChange={e => setRecurringForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Aluguel da loja"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor mensal (R$) *</label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={recurringForm.amount}
                onChange={e => setRecurringForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {categoryField(recurringForm.category_id, next => setRecurringForm(f => ({ ...f, category_id: next })))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <input
                type="text"
                value={recurringForm.supplier}
                onChange={e => setRecurringForm(f => ({ ...f, supplier: e.target.value }))}
                placeholder="Ex.: Vivo Fibra"
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vence todo dia *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={31}
                  value={recurringForm.due_day}
                  onChange={e => setRecurringForm(f => ({ ...f, due_day: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-xs text-gray-400 mt-1">Em meses mais curtos cai no último dia.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">A partir de *</label>
                <input
                  type="month"
                  required
                  max={thisMonth()}
                  value={recurringForm.start_month}
                  onChange={e => setRecurringForm(f => ({ ...f, start_month: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-xs text-gray-400 mt-1">Meses passados são lançados na hora.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea
                rows={2}
                value={recurringForm.notes}
                onChange={e => setRecurringForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {editingId !== null && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recurringForm.active}
                  onChange={e => setRecurringForm(f => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Ativa (continua gerando todo mês)</span>
              </label>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPanelMode(null)}
                className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
