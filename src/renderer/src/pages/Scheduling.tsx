import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Appointment, AppointmentItem, AppointmentStatus, CurrentUser, MenuItem, MessageTemplate,
  formatPriceLabel, ReminderUnit, REMINDER_UNIT_LABELS
} from '../types'
import { TEMPLATE_VARIABLES, previewTemplate, renderTemplate, usesItems } from '../messageTemplates'
import { BellIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, WhatsAppIcon } from '../components/icons'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  done: 'Concluído',
  cancelled: 'Cancelado'
}

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-500'
}

// Só monta o número: quem dispara a mensagem é a pessoa, no próprio WhatsApp.
function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}` // fixo/celular BR sem DDI
  if (digits.length >= 12) return digits // já veio com DDI
  return null
}

interface OrderLine {
  description: string
  quantity: number
  unit_value: number
  subtotal: number
}

interface Form {
  customer_name: string
  phone: string
  date: string
  time: string
  notes: string
  status: AppointmentStatus
}

const emptyForm = (): Form => ({
  customer_name: '',
  phone: '',
  date: '',
  time: '',
  notes: '',
  status: 'scheduled'
})

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const start = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

interface Props {
  currentUser: CurrentUser
  onAcknowledge?: () => void
}

export default function Scheduling({ currentUser, onAcknowledge }: Props) {
  const canEditTemplates = !!currentUser.role.is_system
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(emptyForm())
  const [orderItems, setOrderItems] = useState<OrderLine[]>([])

  const [lineMenuId, setLineMenuId] = useState('')
  const [lineDescription, setLineDescription] = useState('')
  const [lineQty, setLineQty] = useState('1')
  const [lineValue, setLineValue] = useState('')

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [waMenuId, setWaMenuId] = useState<number | null>(null)
  const [waError, setWaError] = useState('')

  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<number | 'new' | null>(null)
  const [templateForm, setTemplateForm] = useState({ name: '', body: '' })
  const [templateError, setTemplateError] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const [reminderAmount, setReminderAmount] = useState('30')
  const [reminderUnit, setReminderUnit] = useState<ReminderUnit>('minutes')
  const [reminderSaved, setReminderSaved] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    const [appts, menu, amount, unit, pending, msgTemplates] = await Promise.all([
      window.api.appointments.list(),
      window.api.menu.list(),
      window.api.settings.get('reminder_amount'),
      window.api.settings.get('reminder_unit'),
      window.api.appointments.pendingReminders(),
      window.api.templates.list()
    ])
    setAppointments(appts)
    setMenuItems(menu)
    if (amount) setReminderAmount(amount)
    if (unit) setReminderUnit(unit as ReminderUnit)
    setPendingIds(new Set(pending.map(p => p.id)))
    setTemplates(msgTemplates)
  }

  useEffect(() => { load() }, [])

  const appointmentsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const a of appointments) {
      const key = dateKey(new Date(a.scheduled_at))
      if (!map[key]) map[key] = []
      map[key].push(a)
    }
    return map
  }, [appointments])

  const visibleAppointments = selectedDay
    ? appointments.filter(a => dateKey(new Date(a.scheduled_at)) === selectedDay)
    : appointments

  const orderTotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0)

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOrderItems([])
    setFormError('')
    resetLine()
  }

  const resetLine = () => {
    setLineMenuId('')
    setLineDescription('')
    setLineQty('1')
    setLineValue('')
  }

  const openNew = () => {
    resetForm()
    setShowTemplates(false)
    setShowForm(true)
  }

  const openEdit = async (a: Appointment) => {
    const dt = new Date(a.scheduled_at)
    setEditingId(a.id)
    setForm({
      customer_name: a.customer_name,
      phone: a.phone ?? '',
      date: dateKey(dt),
      time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
      notes: a.notes ?? '',
      status: a.status
    })
    const items = await window.api.appointments.items(a.id)
    setOrderItems(items.map((i: AppointmentItem) => ({
      description: i.description,
      quantity: i.quantity,
      unit_value: i.unit_value,
      subtotal: i.subtotal
    })))
    resetLine()
    setShowTemplates(false)
    setShowForm(true)
  }

  const handleMenuSelect = (id: string) => {
    setLineMenuId(id)
    const item = menuItems.find(m => m.id === parseInt(id, 10))
    if (item) {
      setLineDescription(item.name)
      setLineValue(item.price.toFixed(2))
    }
  }

  const addLine = () => {
    const description = lineDescription.trim()
    const qty = parseInt(lineQty, 10) || 1
    const value = parseFloat(lineValue.replace(',', '.')) || 0
    if (!description || qty <= 0 || value < 0) return
    setOrderItems(prev => [...prev, { description, quantity: qty, unit_value: value, subtotal: qty * value }])
    resetLine()
  }

  const removeLine = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (orderItems.length === 0) return
    setFormError('')
    const scheduled_at = `${form.date} ${form.time}:00`
    const data = {
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim() || undefined,
      scheduled_at,
      notes: form.notes.trim() || undefined,
      status: form.status,
      items: orderItems
    }
    try {
      if (editingId !== null) {
        await window.api.appointments.update(editingId, data)
      } else {
        await window.api.appointments.create(data)
      }
      setShowForm(false)
      resetForm()
      load()
      onAcknowledge?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar o agendamento. Tente novamente.')
    }
  }

  const handleDelete = async (id: number) => {
    await window.api.appointments.delete(id)
    if (editingId === id) resetForm()
    load()
    onAcknowledge?.()
  }

  const saveReminder = async () => {
    await window.api.settings.set('reminder_amount', reminderAmount)
    await window.api.settings.set('reminder_unit', reminderUnit)
    setReminderSaved(true)
    setTimeout(() => setReminderSaved(false), 2000)
    load()
  }

  const handleAcknowledge = async (id: number) => {
    await window.api.appointments.acknowledge(id)
    await load()
    onAcknowledge?.()
  }

  const sendWhatsApp = async (appt: Appointment, template: MessageTemplate) => {
    setWaMenuId(null)
    setWaError('')
    const number = whatsappNumber(appt.phone)
    if (!number) {
      setWaError(`Cadastre um telefone válido em "${appt.customer_name}" para usar o WhatsApp.`)
      return
    }
    try {
      // Só busca os itens se o modelo realmente usa {itens}.
      const items = usesItems(template.body) ? await window.api.appointments.items(appt.id) : []
      await window.api.whatsapp.open(number, renderTemplate(template.body, appt, items))
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  const openTemplates = () => {
    setWaMenuId(null)
    setShowForm(false)
    setShowTemplates(true)
    setEditingTemplateId(null)
    setTemplateError('')
  }

  const openTemplateForm = (template?: MessageTemplate) => {
    setEditingTemplateId(template ? template.id : 'new')
    setTemplateForm({ name: template?.name ?? '', body: template?.body ?? '' })
    setTemplateError('')
  }

  const insertVariable = (key: string) => {
    const field = bodyRef.current
    const token = `{${key}}`
    if (!field) {
      setTemplateForm(f => ({ ...f, body: f.body + token }))
      return
    }
    const { selectionStart, selectionEnd, value } = field
    const body = value.slice(0, selectionStart) + token + value.slice(selectionEnd)
    setTemplateForm(f => ({ ...f, body }))
    // Devolve o cursor para logo depois da variável inserida.
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(selectionStart + token.length, selectionStart + token.length)
    })
  }

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setTemplateError('')
    const data = { name: templateForm.name.trim(), body: templateForm.body.trim() }
    if (!data.name || !data.body) {
      setTemplateError('Preencha o nome e o texto do modelo.')
      return
    }
    try {
      if (editingTemplateId === 'new' || editingTemplateId === null) {
        await window.api.templates.create(data)
      } else {
        await window.api.templates.update(editingTemplateId, data)
      }
      setTemplates(await window.api.templates.list())
      setEditingTemplateId(null)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Erro ao salvar o modelo.')
    }
  }

  const deleteTemplate = async (template: MessageTemplate) => {
    if (!window.confirm(`Excluir o modelo "${template.name}"?`)) return
    try {
      await window.api.templates.delete(template.id)
      setTemplates(await window.api.templates.list())
      if (editingTemplateId === template.id) setEditingTemplateId(null)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Erro ao excluir o modelo.')
    }
  }

  const restoreTemplates = async () => {
    if (!window.confirm('Restaurar os modelos padrão? Os modelos atuais serão substituídos.')) return
    try {
      setTemplates(await window.api.templates.reset())
      setEditingTemplateId(null)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Erro ao restaurar os modelos.')
    }
  }

  const monthLabel = monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const grid = buildMonthGrid(monthCursor.getFullYear(), monthCursor.getMonth())
  const todayKey = dateKey(new Date())

  const monthAppointments = appointments.filter(a => {
    const d = new Date(a.scheduled_at)
    return d.getFullYear() === monthCursor.getFullYear() && d.getMonth() === monthCursor.getMonth()
  })
  const monthScheduled = monthAppointments.filter(a => a.status === 'scheduled')
  const visibleTotal = visibleAppointments.reduce((sum, a) => sum + a.total, 0)
  const selectedLabel = selectedDay
    ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
    : null

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800">Agendamento</h1>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Avisar</span>
            <input
              type="number"
              min={0}
              aria-label="Quantidade para lembrete"
              value={reminderAmount}
              onChange={e => setReminderAmount(e.target.value)}
              className="w-16 px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
            />
            <select
              value={reminderUnit}
              onChange={e => setReminderUnit(e.target.value as ReminderUnit)}
              aria-label="Unidade do lembrete"
              className="px-2 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
            >
              {(['minutes', 'hours', 'days'] as ReminderUnit[]).map(u => (
                <option key={u} value={u}>{REMINDER_UNIT_LABELS[u]}</option>
              ))}
            </select>
            <span>antes</span>
            <button
              onClick={saveReminder}
              className="px-3 py-2 min-h-[40px] bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold cursor-pointer"
            >
              {reminderSaved ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canEditTemplates && (
              <button
                onClick={openTemplates}
                className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer"
              >
                <WhatsAppIcon className="w-4 h-4 text-green-700" />
                Modelos
              </button>
            )}
            <button
              onClick={openNew}
              className="px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors cursor-pointer"
            >
              + Novo Agendamento
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          <div className="w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                aria-label="Mês anterior"
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer"
              ><ChevronLeftIcon className="w-5 h-5" /></button>
              <div className="font-semibold text-gray-800 first-letter:uppercase">{monthLabel}</div>
              <button
                onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                aria-label="Próximo mês"
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer"
              ><ChevronRightIcon className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, i) => {
                const key = dateKey(day)
                const inMonth = day.getMonth() === monthCursor.getMonth()
                const hasAppts = !!appointmentsByDay[key]?.length
                const isSelected = selectedDay === key
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(prev => prev === key ? null : key)}
                    className={`aspect-square min-h-[40px] rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer
                      ${!inMonth ? 'text-gray-400' : 'text-gray-700'}
                      ${isSelected ? 'bg-rose-600 text-white' : key === todayKey ? 'bg-rose-50 font-semibold' : 'hover:bg-gray-100'}`}
                  >
                    <span>{day.getDate()}</span>
                    {hasAppts && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-500'}`} />}
                  </button>
                )
              })}
            </div>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 mt-2 px-2 py-1.5 -ml-2 rounded-lg cursor-pointer"
              >
                Limpar filtro do dia
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{monthLabel}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-gray-800">{monthAppointments.length}</span>
              <span className="text-sm text-gray-500">agendamento(s)</span>
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 text-sm">
              <span className="text-gray-500">Em aberto</span>
              <span className="font-semibold text-gray-800 tabular-nums">
                {monthScheduled.length} · {fmt(monthScheduled.reduce((s, a) => s + a.total, 0))}
              </span>
            </div>
          </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-baseline gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-800">
                {selectedLabel ? `Agendamentos de ${selectedLabel}` : 'Todos os agendamentos'}
              </h2>
              <span className="text-sm text-gray-500">
                {visibleAppointments.length} item(ns)
              </span>
              <span className="ml-auto text-sm font-bold text-rose-600 tabular-nums">{fmt(visibleTotal)}</span>
            </div>

            {waError && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <span className="flex-1">{waError}</span>
                <button
                  onClick={() => setWaError('')}
                  aria-label="Fechar aviso"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-red-100 cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {visibleAppointments.length === 0 ? (
                <div className="text-center text-gray-400 py-16">
                  {selectedLabel ? `Nenhum agendamento em ${selectedLabel}` : 'Nenhum agendamento encontrado'}
                </div>
              ) : (
                visibleAppointments.map(a => {
                  const isPending = pendingIds.has(a.id)
                  const hasPhone = whatsappNumber(a.phone) !== null
                  return (
                    <div
                      key={a.id}
                      className={`rounded-xl border p-3 ${isPending ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-medium text-gray-800">
                            {isPending && <BellIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Aviso pendente" />}
                            <span className="truncate">{a.customer_name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_BADGE[a.status]}`}>
                              {STATUS_LABELS[a.status]}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">{fmtDateTime(a.scheduled_at)}</div>
                          {a.phone && <div className="text-xs text-gray-500">{a.phone}</div>}
                          {a.notes && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{a.notes}</div>}
                        </div>
                        <span className="text-sm font-bold text-gray-800 tabular-nums shrink-0">{fmt(a.total)}</span>
                      </div>

                      <div className="flex items-center gap-1 mt-2 flex-wrap relative">
                        <button
                          onClick={() => { setWaMenuId(prev => prev === a.id ? null : a.id); setWaError('') }}
                          disabled={!hasPhone}
                          aria-expanded={waMenuId === a.id}
                          title={hasPhone ? 'Enviar mensagem no WhatsApp' : 'Cadastre um telefone para usar o WhatsApp'}
                          className="flex items-center gap-1.5 text-sm font-medium text-green-700 hover:bg-green-50 px-2.5 py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <WhatsAppIcon className="w-4 h-4" />
                          WhatsApp
                        </button>

                        {waMenuId === a.id && (
                          <div className="absolute z-20 top-full left-0 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                            <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
                              Abre o WhatsApp com o texto pronto — você confere e envia.
                            </div>
                            {templates.length === 0 ? (
                              <p className="px-3 py-3 text-sm text-gray-400">Nenhum modelo cadastrado.</p>
                            ) : (
                              templates.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => sendWhatsApp(a, t)}
                                  className="w-full text-left px-3 py-2.5 min-h-[40px] text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                                >
                                  {t.name}
                                </button>
                              ))
                            )}
                            {canEditTemplates && (
                              <button
                                onClick={openTemplates}
                                className="w-full text-left px-3 py-2.5 min-h-[40px] text-sm font-medium text-rose-600 border-t border-gray-100 hover:bg-rose-50 cursor-pointer"
                              >
                                Gerenciar modelos…
                              </button>
                            )}
                          </div>
                        )}

                        {isPending && (
                          <button
                            onClick={() => handleAcknowledge(a.id)}
                            className="text-sm text-amber-700 hover:text-amber-800 hover:bg-amber-100 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                          >
                            Confirmar aviso
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(a)}
                          className="ml-auto text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {showTemplates && canEditTemplates && (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Modelos de mensagem</h2>
            <button
              onClick={() => setShowTemplates(false)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          {editingTemplateId === null ? (
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <p className="text-xs text-gray-500">
                Estes são os textos que aparecem no botão de WhatsApp de cada agendamento.
              </p>

              {templates.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhum modelo cadastrado.</p>
              )}

              {templates.map(t => (
                <div key={t.id} className="border border-gray-200 rounded-xl p-3">
                  <div className="font-medium text-sm text-gray-800">{t.name}</div>
                  <p className="text-xs text-gray-500 mt-1 whitespace-pre-line line-clamp-3">{t.body}</p>
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => openTemplateForm(t)}
                      className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2.5 py-2 rounded-lg cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteTemplate(t)}
                      className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}

              {templateError && <p className="text-sm text-red-600">{templateError}</p>}

              <button
                onClick={() => openTemplateForm()}
                className="w-full py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer"
              >
                + Novo modelo
              </button>
              <button
                onClick={restoreTemplates}
                className="w-full py-2.5 min-h-[44px] border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
              >
                Restaurar modelos padrão
              </button>
            </div>
          ) : (
            <form onSubmit={saveTemplate} className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do modelo *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex.: Aviso de atraso"
                  value={templateForm.name}
                  onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label htmlFor="template-body" className="block text-sm font-medium text-gray-700 mb-1">
                  Texto da mensagem *
                </label>
                <textarea
                  id="template-body"
                  ref={bodyRef}
                  required
                  rows={8}
                  value={templateForm.body}
                  onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">Variáveis</span>
                <p className="text-xs text-gray-500 mb-2">
                  Clique para inserir no ponto onde o cursor está. Elas são trocadas pelos dados do agendamento na hora do envio.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      title={`${v.label} — ex.: ${v.example.split('\n')[0]}`}
                      className="px-2.5 py-2 min-h-[36px] bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 cursor-pointer"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {templateForm.body.trim() && (
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-1">Prévia</span>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-gray-800 whitespace-pre-line">
                    {previewTemplate(templateForm.body)}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Exemplo com dados fictícios.</p>
                </div>
              )}

              {templateError && <p className="text-sm text-red-600">{templateError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingTemplateId(null)}
                  className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {showForm && (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingId ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
            <button
              onClick={() => setShowForm(false)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente *</label>
              <input
                type="text"
                required
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora *</label>
                <input
                  type="time"
                  required
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {editingId !== null && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as AppointmentStatus }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {(['scheduled', 'done', 'cancelled'] as AppointmentStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                rows={2}
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Itens do pedido *</label>

              {orderItems.length > 0 && (
                <div className="space-y-1 mb-3">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg pl-3 pr-1.5 py-1.5">
                      <span className="text-sm text-gray-700">{item.quantity}x {item.description}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-gray-800">{fmt(item.subtotal)}</span>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label={`Remover item ${item.description}`}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between px-1 pt-1 text-sm font-semibold text-gray-800">
                    <span>Total</span>
                    <span>{fmt(orderTotal)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                <select
                  value={lineMenuId}
                  onChange={e => handleMenuSelect(e.target.value)}
                  aria-label="Selecionar item do cardápio"
                  className="w-full px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Item avulso (digitar abaixo)</option>
                  {menuItems.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {formatPriceLabel(m.price, m.unit_type, m.pack_size)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Descrição do item"
                  aria-label="Descrição do item"
                  value={lineDescription}
                  onChange={e => setLineDescription(e.target.value)}
                  className="w-full px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Qtd"
                    min={1}
                    aria-label="Quantidade"
                    value={lineQty}
                    onChange={e => setLineQty(e.target.value)}
                    className="w-20 px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Valor unit."
                    step="0.01"
                    min={0}
                    aria-label="Valor unitário"
                    value={lineValue}
                    onChange={e => setLineValue(e.target.value)}
                    className="flex-1 px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={addLine}
                    aria-label="Adicionar item ao pedido"
                    className="w-10 min-h-[40px] flex items-center justify-center bg-rose-600 text-white rounded-lg hover:bg-rose-700 cursor-pointer"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {orderItems.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">Adicione ao menos um item ao pedido.</p>
              )}
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={orderItems.length === 0}
                className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {editingId ? 'Salvar' : 'Agendar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
