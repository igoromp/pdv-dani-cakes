import { Appointment, AppointmentItem } from './types'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export interface TemplateVariable {
  key: string
  label: string
  example: string
}

// A ordem aqui é a ordem mostrada no editor.
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'primeiro_nome', label: 'Primeiro nome', example: 'Marina' },
  { key: 'cliente', label: 'Nome completo', example: 'Marina Alves' },
  { key: 'data', label: 'Data', example: '26/07/2026' },
  { key: 'hora', label: 'Hora', example: '15:00' },
  { key: 'data_hora', label: 'Data e hora', example: '26/07/2026, 15:00' },
  { key: 'itens', label: 'Itens do pedido', example: '• 1x Bolo de chocolate 2kg\n• 2x Brigadeiro gourmet' },
  { key: 'total', label: 'Total do pedido', example: 'R$ 320,00' },
  { key: 'telefone', label: 'Telefone', example: '(11) 98888-7777' },
  { key: 'observacao', label: 'Observação', example: 'Bolo de 2 andares, tema jardim' }
]

/** Precisa buscar os itens do agendamento antes de renderizar? */
export function usesItems(body: string): boolean {
  return body.includes('{itens}')
}

function templateValues(appointment: Appointment, items: AppointmentItem[]): Record<string, string> {
  const date = new Date(appointment.scheduled_at)
  return {
    primeiro_nome: appointment.customer_name.trim().split(/\s+/)[0] ?? '',
    cliente: appointment.customer_name.trim(),
    data: date.toLocaleDateString('pt-BR'),
    hora: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    data_hora: date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    itens: items.map(i => `• ${i.quantity}x ${i.description}`).join('\n'),
    total: fmt(appointment.total),
    telefone: appointment.phone ?? '',
    observacao: appointment.notes ?? ''
  }
}

/** Troca {variavel} pelos dados do agendamento. O que não for variável conhecida fica como está. */
export function renderTemplate(body: string, appointment: Appointment, items: AppointmentItem[]): string {
  const values = templateValues(appointment, items)
  return body.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

/** Prévia com dados de exemplo, para o editor. */
export function previewTemplate(body: string): string {
  const values = Object.fromEntries(TEMPLATE_VARIABLES.map(v => [v.key, v.example]))
  return body.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}
