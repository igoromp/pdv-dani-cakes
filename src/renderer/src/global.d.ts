import type {
  Product,
  Category,
  Sale,
  SaleItem,
  SalePayment,
  PaymentMethod,
  MenuItem,
  Appointment,
  AppointmentItem,
  AppointmentStatus,
  UnitType,
  CurrentUser,
  UserListItem,
  Role,
  ResourceKey,
  DashboardData,
  MessageTemplate,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  FinanceBasis,
  FinanceSummary,
  RecurringExpense,
  UpdaterStatus,
  PointConfig,
  PointOutcome
} from './types'

interface RecurringPayload {
  description: string
  category_id?: number | null
  supplier?: string | null
  amount: number
  due_day: number
  start_month: string
  notes?: string | null
  active?: number
}

interface ExpensePayload {
  description: string
  category_id?: number | null
  supplier?: string | null
  amount: number
  incurred_on: string
  due_on?: string | null
  paid_on?: string | null
  payment_method?: PaymentMethod | null
  notes?: string | null
}

declare global {
  interface Window {
    api: {
      products: {
        list: () => Promise<Product[]>
        create: (data: { name: string; price: number; category_id?: number; unit_type?: UnitType; pack_size?: number }) => Promise<Product>
        update: (id: number, data: { name: string; price: number; category_id?: number; active?: number; unit_type?: UnitType; pack_size?: number }) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      categories: {
        list: () => Promise<Category[]>
        create: (name: string) => Promise<Category>
      }
      sales: {
        create: (data: {
          total: number
          items: Array<{
            product_id?: number
            product_name: string
            unit_price: number
            quantity: number
            subtotal: number
            unit_type?: UnitType
            pack_size?: number | null
          }>
          payments: Array<{ method: PaymentMethod; amount: number; received?: number }>
        }) => Promise<{ id: number }>
        createBackdated: (data: {
          total: number
          created_at: string
          items: Array<{
            product_id?: number
            product_name: string
            unit_price: number
            quantity: number
            subtotal: number
            unit_type?: UnitType
            pack_size?: number | null
          }>
          payments: Array<{ method: PaymentMethod; amount: number; received?: number }>
        }) => Promise<{ id: number }>
        cancel: (
          saleId: number,
          data: { items: Array<{ sale_item_id: number; quantity: number }>; method: PaymentMethod }
        ) => Promise<{ id: number }>
        list: (filters?: { from?: string; to?: string; limit?: number }) => Promise<Sale[]>
        paymentBreakdown: (filters?: { from?: string; to?: string }) => Promise<Array<{ method: PaymentMethod; count: number }>>
        items: (saleId: number) => Promise<SaleItem[]>
        payments: (saleId: number) => Promise<SalePayment[]>
        todayTotal: () => Promise<{ total: number; count: number }>
      }
      dashboard: {
        summary: (filters: { from: string; to: string; basis?: FinanceBasis }) => Promise<DashboardData>
      }
      finance: {
        summary: (filters: { from: string; to: string; basis?: FinanceBasis }) => Promise<FinanceSummary>
        expenses: (filters?: {
          from?: string
          to?: string
          basis?: FinanceBasis
          status?: ExpenseStatus | 'all'
          category_id?: number
          search?: string
        }) => Promise<Expense[]>
        createExpense: (data: ExpensePayload) => Promise<Expense>
        updateExpense: (id: number, data: ExpensePayload) => Promise<Expense>
        deleteExpense: (id: number) => Promise<void>
        payExpense: (id: number, data?: { paid_on?: string; payment_method?: PaymentMethod }) => Promise<Expense>
        reopenExpense: (id: number) => Promise<Expense>
        recurring: () => Promise<RecurringExpense[]>
        createRecurring: (data: RecurringPayload) => Promise<{ id: number; generated: number }>
        updateRecurring: (id: number, data: RecurringPayload) => Promise<{ id: number; generated: number }>
        toggleRecurring: (id: number, active: boolean) => Promise<{ id: number; generated: number }>
        deleteRecurring: (id: number) => Promise<void>
        generateRecurring: () => Promise<number>
        categories: () => Promise<ExpenseCategory[]>
        createCategory: (name: string) => Promise<ExpenseCategory>
        deleteCategory: (id: number) => Promise<void>
      }
      menu: {
        list: () => Promise<MenuItem[]>
        create: (data: { name: string; price: number; unit_type?: UnitType; pack_size?: number }) => Promise<MenuItem>
        update: (id: number, data: { name: string; price: number; active?: number; unit_type?: UnitType; pack_size?: number }) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      appointments: {
        list: (filters?: { from?: string; to?: string }) => Promise<Appointment[]>
        items: (id: number) => Promise<AppointmentItem[]>
        create: (data: {
          customer_name: string
          phone?: string
          scheduled_at: string
          notes?: string
          items: Array<{ description: string; quantity: number; unit_value: number; subtotal: number }>
        }) => Promise<{ id: number }>
        update: (
          id: number,
          data: {
            customer_name: string
            phone?: string
            scheduled_at: string
            notes?: string
            status?: AppointmentStatus
            items: Array<{ description: string; quantity: number; unit_value: number; subtotal: number }>
          }
        ) => Promise<{ id: number }>
        delete: (id: number) => Promise<void>
        pendingReminders: () => Promise<Appointment[]>
        acknowledge: (id: number) => Promise<void>
      }
      whatsapp: {
        open: (phone: string, message: string) => Promise<void>
      }
      templates: {
        list: () => Promise<MessageTemplate[]>
        create: (data: { name: string; body: string }) => Promise<MessageTemplate>
        update: (id: number, data: { name: string; body: string }) => Promise<void>
        delete: (id: number) => Promise<void>
        reset: () => Promise<MessageTemplate[]>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
      }
      auth: {
        login: (username: string, password: string) => Promise<CurrentUser>
        logout: () => Promise<void>
        me: () => Promise<CurrentUser | null>
        changePassword: (currentPassword: string, newPassword: string) => Promise<void>
      }
      users: {
        list: () => Promise<UserListItem[]>
        create: (data: { username: string; password: string; role_id: number; active?: number }) => Promise<UserListItem>
        update: (
          id: number,
          data: { username: string; role_id: number; active?: number; password?: string }
        ) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      roles: {
        list: () => Promise<Role[]>
        create: (data: { name: string; permissions: ResourceKey[] }) => Promise<Role>
        update: (id: number, data: { name: string; permissions: ResourceKey[] }) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      backup: {
        list: () => Promise<Array<{ name: string; size: number; created_at: string }>>
        create: () => Promise<string | null>
        restore: () => Promise<boolean>
        openFolder: () => Promise<void>
      }
      point: {
        getConfig: () => Promise<PointConfig>
        saveConfig: (data: {
          enabled: boolean
          webhookUrl: string
          deviceId: string
          apiToken?: string
        }) => Promise<PointConfig>
        test: () => Promise<{ ok: true }>
        enabled: () => Promise<boolean>
        charge: (data: { amount: number; externalReference?: string }) => Promise<{ orderId: string }>
        awaitResult: (orderId: string) => Promise<PointOutcome>
      }
      updater: {
        check: () => Promise<void>
        install: () => Promise<void>
        onStatus: (callback: (status: UpdaterStatus) => void) => () => void
      }
    }
  }
}
