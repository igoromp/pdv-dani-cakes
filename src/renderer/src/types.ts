export type UnitType = 'unit' | 'kg' | 'pack'

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  unit: 'Unidade',
  kg: 'Por quilo (kg)',
  pack: 'Pacote'
}

export function formatUnitLabel(unitType: UnitType, packSize: number | null): string {
  if (unitType === 'kg') return 'kg'
  if (unitType === 'pack') return `${packSize ?? '?'} un.`
  return 'unidade'
}

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export function formatPriceLabel(price: number, unitType: UnitType, packSize: number | null): string {
  return `${formatCurrency(price)} / ${formatUnitLabel(unitType, packSize)}`
}

export interface Product {
  id: number
  name: string
  price: number
  category_id: number | null
  category_name: string | null
  active: number
  unit_type: UnitType
  pack_size: number | null
}

export interface Category {
  id: number
  name: string
}

export interface CartItem {
  /** Chave local da linha. Existe porque um item avulso não tem product_id. */
  line_id: number
  product_id?: number
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  unit_type: UnitType
  pack_size: number | null
}

export type SaleType = 'sale' | 'cancellation'

export interface Sale {
  id: number
  total: number
  change_amount: number
  type: SaleType
  reversal_of_sale_id: number | null
  backdated: number
  created_at: string
  item_count: number
  payment_methods: string | null
}

export interface SaleItem {
  id: number
  sale_id: number
  product_id: number | null
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  reversed_item_id: number | null
  remaining_quantity: number | null
  unit_type: UnitType
  pack_size: number | null
}

export interface SalePayment {
  id: number
  sale_id: number
  method: PaymentMethod
  amount: number
  received: number | null
}

export type PaymentMethod = 'cash' | 'card' | 'pix'

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  card: 'Cartão',
  pix: 'PIX'
}

export interface MenuItem {
  id: number
  name: string
  price: number
  active: number
  unit_type: UnitType
  pack_size: number | null
}

export type AppointmentStatus = 'scheduled' | 'done' | 'cancelled'

export interface Appointment {
  id: number
  customer_name: string
  phone: string | null
  scheduled_at: string
  notes: string | null
  total: number
  status: AppointmentStatus
  acknowledged: number
  last_notified_at: string | null
  created_at: string
}

export interface AppointmentItem {
  id: number
  appointment_id: number
  description: string
  quantity: number
  unit_value: number
  subtotal: number
}

export type ResourceKey =
  | 'pos'
  | 'products'
  | 'history'
  | 'menu'
  | 'scheduling'
  | 'finance'
  | 'users'
  | 'dashboard'
  | 'backdated'

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  dashboard: 'Dashboard',
  pos: 'PDV',
  backdated: 'Lançamento retroativo',
  products: 'Produtos',
  history: 'Histórico',
  menu: 'Cardápio',
  scheduling: 'Agenda',
  finance: 'Financeiro',
  users: 'Usuários'
}

// Recursos exclusivos do Admin: não podem ser concedidos a papéis customizados
// (o main também bloqueia via auth.requireAdmin()).
export const ADMIN_ONLY_RESOURCE_KEYS: ResourceKey[] = ['dashboard', 'backdated']

export const ASSIGNABLE_RESOURCE_KEYS: ResourceKey[] = [
  'pos', 'products', 'history', 'menu', 'scheduling', 'finance', 'users'
]

export interface Role {
  id: number
  name: string
  permissions: ResourceKey[]
  is_system: boolean
}

export interface CurrentUser {
  id: number
  username: string
  active: number
  role: Role
}

export interface UserListItem {
  id: number
  username: string
  role_id: number
  role_name: string
  active: number
  created_at: string
}

export interface DashboardTotals {
  net_revenue: number
  gross_revenue: number
  cancelled_amount: number
  sale_count: number
  cancellation_count: number
  backdated_count: number
}

export interface DashboardData {
  range: { from: string; to: string; previous_from: string; previous_to: string }
  totals: DashboardTotals
  previousTotals: DashboardTotals
  today: { total: number; count: number }
  daily: Array<{ day: string; net: number; sale_count: number; expense: number; profit: number }>
  topProducts: Array<{ name: string; unit_type: UnitType; quantity: number; revenue: number }>
  paymentMix: Array<{ method: PaymentMethod; amount: number; count: number }>
  hourly: Array<{ hour: number; sale_count: number; net: number }>
  upcomingAppointments: Appointment[]
  appointmentStats: { today_count: number; upcoming_total: number }
  finance: {
    basis: FinanceBasis
    current: FinanceBlock
    previous: FinanceBlock
    byCategory: ExpenseCategoryTotal[]
    payables: PayablesSummary
  }
}

// --- Financeiro ---

// Caixa = conta a despesa no dia em que foi paga; competência = no dia em que foi
// gerada, paga ou não.
export type FinanceBasis = 'cash' | 'accrual'

export const FINANCE_BASIS_LABELS: Record<FinanceBasis, string> = {
  cash: 'Caixa',
  accrual: 'Competência'
}

export const FINANCE_BASIS_HINTS: Record<FinanceBasis, string> = {
  cash: 'Considera a despesa no dia em que ela foi paga. Reflete o dinheiro que saiu.',
  accrual: 'Considera a despesa na data em que ela foi gerada, mesmo sem pagamento.'
}

export type ExpenseStatus = 'paid' | 'open' | 'overdue'

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  paid: 'Paga',
  open: 'Em aberto',
  overdue: 'Vencida'
}

export interface ExpenseCategory {
  id: number
  name: string
}

export interface Expense {
  id: number
  description: string
  category_id: number | null
  category_name: string | null
  supplier: string | null
  amount: number
  incurred_on: string
  due_on: string | null
  paid_on: string | null
  payment_method: PaymentMethod | null
  notes: string | null
  status: ExpenseStatus
  /** Preenchida por uma despesa fixa; null quando foi lançada à mão. */
  recurring_id: number | null
  /** Mês de referência ('YYYY-MM') quando veio de uma despesa fixa. */
  period: string | null
  created_at: string
}

export interface RecurringExpense {
  id: number
  description: string
  category_id: number | null
  category_name: string | null
  supplier: string | null
  amount: number
  due_day: number
  start_month: string
  notes: string | null
  active: number
  generated_count: number
  last_period: string | null
  created_at: string
}

export interface FinanceBlock {
  basis: FinanceBasis
  revenue: number
  expenses: number
  expense_count: number
  profit: number
  margin: number
}

export interface ExpenseCategoryTotal {
  category: string
  amount: number
  count: number
}

export interface PayablesSummary {
  overdue_amount: number
  overdue_count: number
  due_soon_amount: number
  due_soon_count: number
  open_amount: number
  open_count: number
}

export interface FinanceSummary {
  range: { from: string; to: string; previous_from: string; previous_to: string }
  basis: FinanceBasis
  totals: DashboardTotals
  current: FinanceBlock
  previous: FinanceBlock
  byCategory: ExpenseCategoryTotal[]
  payables: PayablesSummary
  upcomingPayables: Expense[]
  recurring: { active_count: number; monthly_total: number }
}

export interface MessageTemplate {
  id: number
  name: string
  body: string
  sort_order: number
}

export type ReminderUnit = 'minutes' | 'hours' | 'days'

export const REMINDER_UNIT_LABELS: Record<ReminderUnit, string> = {
  minutes: 'Minutos',
  hours: 'Horas',
  days: 'Dias'
}

export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
