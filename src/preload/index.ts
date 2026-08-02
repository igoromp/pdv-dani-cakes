import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    create: (data: unknown) => ipcRenderer.invoke('products:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('products:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('products:delete', id)
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: (name: string) => ipcRenderer.invoke('categories:create', name)
  },
  sales: {
    create: (data: unknown) => ipcRenderer.invoke('sales:create', data),
    createBackdated: (data: unknown) => ipcRenderer.invoke('sales:create-backdated', data),
    cancel: (saleId: number, data: unknown) => ipcRenderer.invoke('sales:cancel', saleId, data),
    list: (filters?: unknown) => ipcRenderer.invoke('sales:list', filters),
    paymentBreakdown: (filters?: unknown) => ipcRenderer.invoke('sales:payment-breakdown', filters),
    items: (saleId: number) => ipcRenderer.invoke('sales:items', saleId),
    payments: (saleId: number) => ipcRenderer.invoke('sales:payments', saleId),
    todayTotal: () => ipcRenderer.invoke('sales:today-total')
  },
  dashboard: {
    summary: (filters: unknown) => ipcRenderer.invoke('dashboard:summary', filters)
  },
  finance: {
    summary: (filters: unknown) => ipcRenderer.invoke('finance:summary', filters),
    expenses: (filters?: unknown) => ipcRenderer.invoke('finance:expenses', filters),
    createExpense: (data: unknown) => ipcRenderer.invoke('finance:expense-create', data),
    updateExpense: (id: number, data: unknown) => ipcRenderer.invoke('finance:expense-update', id, data),
    deleteExpense: (id: number) => ipcRenderer.invoke('finance:expense-delete', id),
    payExpense: (id: number, data?: unknown) => ipcRenderer.invoke('finance:expense-pay', id, data),
    reopenExpense: (id: number) => ipcRenderer.invoke('finance:expense-reopen', id),
    recurring: () => ipcRenderer.invoke('finance:recurring-list'),
    createRecurring: (data: unknown) => ipcRenderer.invoke('finance:recurring-create', data),
    updateRecurring: (id: number, data: unknown) => ipcRenderer.invoke('finance:recurring-update', id, data),
    toggleRecurring: (id: number, active: boolean) => ipcRenderer.invoke('finance:recurring-toggle', id, active),
    deleteRecurring: (id: number) => ipcRenderer.invoke('finance:recurring-delete', id),
    generateRecurring: () => ipcRenderer.invoke('finance:generate-recurring'),
    categories: () => ipcRenderer.invoke('finance:categories'),
    createCategory: (name: string) => ipcRenderer.invoke('finance:category-create', name),
    deleteCategory: (id: number) => ipcRenderer.invoke('finance:category-delete', id)
  },
  menu: {
    list: () => ipcRenderer.invoke('menu:list'),
    create: (data: unknown) => ipcRenderer.invoke('menu:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('menu:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('menu:delete', id)
  },
  appointments: {
    list: (filters?: unknown) => ipcRenderer.invoke('appointments:list', filters),
    items: (id: number) => ipcRenderer.invoke('appointments:items', id),
    create: (data: unknown) => ipcRenderer.invoke('appointments:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('appointments:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('appointments:delete', id),
    pendingReminders: () => ipcRenderer.invoke('appointments:pending-reminders'),
    acknowledge: (id: number) => ipcRenderer.invoke('appointments:acknowledge', id)
  },
  whatsapp: {
    open: (phone: string, message: string) => ipcRenderer.invoke('whatsapp:open', phone, message)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    create: (data: unknown) => ipcRenderer.invoke('templates:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('templates:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('templates:delete', id),
    reset: () => ipcRenderer.invoke('templates:reset')
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  auth: {
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    me: () => ipcRenderer.invoke('auth:me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:change-password', currentPassword, newPassword)
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (data: unknown) => ipcRenderer.invoke('users:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('users:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('users:delete', id)
  },
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
    create: (data: unknown) => ipcRenderer.invoke('roles:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('roles:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('roles:delete', id)
  },
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    openFolder: () => ipcRenderer.invoke('backup:open-folder')
  }
})
