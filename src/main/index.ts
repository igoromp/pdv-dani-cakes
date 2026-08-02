import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import * as db from './database'
import * as auth from './auth'
import * as backup from './backup'

const RENOTIFY_INTERVAL_MINUTES = 10
const UNIT_TO_MINUTES: Record<string, number> = { minutes: 1, hours: 60, days: 1440 }

let mainWindow: BrowserWindow | null = null

// Empacotado: build/icon.png vira resources/icon.png (ver "extraResources" no
// package.json), já que a pasta build/ em si não entra no pacote final.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'PDV - Dani Cakes'
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  mainWindow = win

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function reminderMinutes(): number {
  const amount = parseFloat(db.getSetting('reminder_amount') ?? '30')
  const unit = db.getSetting('reminder_unit') ?? 'minutes'
  return amount * (UNIT_TO_MINUTES[unit] ?? 1)
}

function checkAppointmentReminders() {
  const minutes = reminderMinutes()
  const pending = db.getPendingReminders(minutes) as Array<{
    id: number
    customer_name: string
    scheduled_at: string
    last_notified_at: string | null
  }>

  for (const appt of pending) {
    if (!db.shouldRenotify(appt.last_notified_at, RENOTIFY_INTERVAL_MINUTES)) continue

    const time = new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const items = db.getAppointmentItems(appt.id) as Array<{ description: string }>
    const summary = items.map(i => i.description).join(', ')

    new Notification({
      title: 'Agendamento — Dani Cakes',
      body: `${appt.customer_name} às ${time}${summary ? ' — ' + summary : ''}`
    }).show()

    db.markAppointmentLastNotified(appt.id)
  }
}

app.whenReady().then(async () => {
  db.initDb()
  try {
    await backup.createAutoBackupIfNeeded()
  } catch (err) {
    console.error('Falha ao criar backup automático:', err)
  }

  ipcMain.handle('products:list', () => db.getAllProducts())
  ipcMain.handle('products:create', (_, data) => db.createProduct(data))
  ipcMain.handle('products:update', (_, id, data) => db.updateProduct(id, data))
  ipcMain.handle('products:delete', (_, id) => db.deleteProduct(id))

  ipcMain.handle('categories:list', () => db.getAllCategories())
  ipcMain.handle('categories:create', (_, name) => db.createCategory(name))

  ipcMain.handle('sales:create', (_, data) => db.createSale({ ...data, created_at: undefined }))
  ipcMain.handle('sales:create-backdated', (_, data) => {
    auth.requireAdmin()
    return db.createSale(data)
  })
  ipcMain.handle('sales:cancel', (_, saleId, data) => db.cancelSaleItems(saleId, data))
  ipcMain.handle('sales:list', (_, filters) => db.getSales(filters))
  ipcMain.handle('sales:payment-breakdown', (_, filters) => db.getPaymentBreakdown(filters))
  ipcMain.handle('sales:items', (_, saleId) => db.getSaleItems(saleId))
  ipcMain.handle('sales:payments', (_, saleId) => db.getSalePayments(saleId))
  ipcMain.handle('sales:today-total', () => db.getTodayTotal())

  ipcMain.handle('dashboard:summary', (_, filters) => {
    auth.requireAdmin()
    return db.getDashboard(filters)
  })

  // Financeiro é um recurso atribuível: basta ter sessão válida — o papel já foi
  // filtrado na navegação e o main só precisa garantir que há alguém logado.
  ipcMain.handle('finance:summary', (_, filters) => {
    auth.requireCurrentUser()
    return db.getFinanceSummary(filters)
  })
  ipcMain.handle('finance:expenses', (_, filters) => {
    auth.requireCurrentUser()
    return db.getExpenses(filters)
  })
  ipcMain.handle('finance:expense-create', (_, data) => {
    auth.requireCurrentUser()
    return db.createExpense(data)
  })
  ipcMain.handle('finance:expense-update', (_, id, data) => {
    auth.requireCurrentUser()
    return db.updateExpense(id, data)
  })
  ipcMain.handle('finance:expense-delete', (_, id) => {
    auth.requireCurrentUser()
    db.deleteExpense(id)
  })
  ipcMain.handle('finance:expense-pay', (_, id, data) => {
    auth.requireCurrentUser()
    return db.setExpensePaid(id, data ?? {})
  })
  ipcMain.handle('finance:expense-reopen', (_, id) => {
    auth.requireCurrentUser()
    return db.reopenExpense(id)
  })
  ipcMain.handle('finance:recurring-list', () => {
    auth.requireCurrentUser()
    return db.getRecurringExpenses()
  })
  ipcMain.handle('finance:recurring-create', (_, data) => {
    auth.requireCurrentUser()
    return db.createRecurringExpense(data)
  })
  ipcMain.handle('finance:recurring-update', (_, id, data) => {
    auth.requireCurrentUser()
    return db.updateRecurringExpense(id, data)
  })
  ipcMain.handle('finance:recurring-toggle', (_, id, active) => {
    auth.requireCurrentUser()
    return db.setRecurringActive(id, active)
  })
  ipcMain.handle('finance:recurring-delete', (_, id) => {
    auth.requireCurrentUser()
    db.deleteRecurringExpense(id)
  })
  // Chamado ao abrir a tela: se o app ficou aberto na virada do mês, as contas
  // fixas do mês novo aparecem sem precisar reiniciar.
  ipcMain.handle('finance:generate-recurring', () => {
    auth.requireCurrentUser()
    return db.generateRecurringExpenses()
  })

  ipcMain.handle('finance:categories', () => {
    auth.requireCurrentUser()
    return db.getExpenseCategories()
  })
  ipcMain.handle('finance:category-create', (_, name) => {
    auth.requireCurrentUser()
    return db.createExpenseCategory(name)
  })
  ipcMain.handle('finance:category-delete', (_, id) => {
    auth.requireCurrentUser()
    db.deleteExpenseCategory(id)
  })

  ipcMain.handle('menu:list', () => db.getAllMenuItems())
  ipcMain.handle('menu:create', (_, data) => db.createMenuItem(data))
  ipcMain.handle('menu:update', (_, id, data) => db.updateMenuItem(id, data))
  ipcMain.handle('menu:delete', (_, id) => db.deleteMenuItem(id))

  ipcMain.handle('appointments:list', (_, filters) => db.getAppointments(filters))
  ipcMain.handle('appointments:items', (_, id) => db.getAppointmentItems(id))
  ipcMain.handle('appointments:create', (_, data) => db.createAppointment(data))
  ipcMain.handle('appointments:update', (_, id, data) => db.updateAppointment(id, data))
  ipcMain.handle('appointments:delete', (_, id) => db.deleteAppointment(id))
  ipcMain.handle('appointments:pending-reminders', () => db.getPendingReminders(reminderMinutes()))
  ipcMain.handle('appointments:acknowledge', (_, id) => db.acknowledgeAppointment(id))

  // Qualquer usuário com acesso à Agenda usa os modelos; só o Admin os edita.
  ipcMain.handle('templates:list', () => { auth.requireCurrentUser(); return db.getMessageTemplates() })
  ipcMain.handle('templates:create', (_, data) => { auth.requireAdmin(); return db.createMessageTemplate(data) })
  ipcMain.handle('templates:update', (_, id, data) => { auth.requireAdmin(); return db.updateMessageTemplate(id, data) })
  ipcMain.handle('templates:delete', (_, id) => { auth.requireAdmin(); db.deleteMessageTemplate(id) })
  ipcMain.handle('templates:reset', () => { auth.requireAdmin(); return db.resetMessageTemplates() })

  // Abre o WhatsApp (app ou web) com a conversa e o texto prontos — quem envia é
  // a pessoa. A URL é montada aqui para o renderer não conseguir abrir outra coisa.
  ipcMain.handle('whatsapp:open', (_, phone: string, message: string) => {
    auth.requireCurrentUser()
    const digits = String(phone ?? '').replace(/\D/g, '')
    if (digits.length < 10) {
      throw new Error('Telefone inválido para o WhatsApp.')
    }
    shell.openExternal(`https://wa.me/${digits}?text=${encodeURIComponent(String(message ?? ''))}`)
  })

  ipcMain.handle('settings:get', (_, key) => db.getSetting(key))
  ipcMain.handle('settings:set', (_, key, value) => db.setSetting(key, value))

  ipcMain.handle('auth:login', (_, username, password) => auth.login(username, password))
  ipcMain.handle('auth:logout', () => auth.logout())
  ipcMain.handle('auth:me', () => auth.getCurrentUser())
  ipcMain.handle('auth:change-password', (_, currentPassword, newPassword) =>
    auth.changeOwnPassword(currentPassword, newPassword)
  )

  ipcMain.handle('users:list', () => { auth.requireCurrentUser(); return db.getAllUsers() })
  ipcMain.handle('users:create', (_, data) => { auth.requireCurrentUser(); return db.createUser(data) })
  ipcMain.handle('users:update', (_, id, data) => { auth.requireCurrentUser(); return db.updateUser(id, data) })
  ipcMain.handle('users:delete', (_, id) => {
    const current = auth.requireCurrentUser()
    if (current.id === id) throw new Error('Não é possível excluir o próprio usuário logado.')
    db.deleteUser(id)
  })

  ipcMain.handle('roles:list', () => { auth.requireCurrentUser(); return db.getAllRoles() })
  ipcMain.handle('roles:create', (_, data) => { auth.requireCurrentUser(); return db.createRole(data) })
  ipcMain.handle('roles:update', (_, id, data) => { auth.requireCurrentUser(); return db.updateRole(id, data) })
  ipcMain.handle('roles:delete', (_, id) => { auth.requireCurrentUser(); db.deleteRole(id) })

  ipcMain.handle('backup:list', () => { auth.requireAdmin(); return backup.listBackups() })
  ipcMain.handle('backup:create', () => { auth.requireAdmin(); return backup.exportBackup(mainWindow) })
  ipcMain.handle('backup:restore', () => { auth.requireAdmin(); return backup.restoreBackup(mainWindow) })
  ipcMain.handle('backup:open-folder', () => { auth.requireAdmin(); backup.openBackupsFolder() })

  createWindow()
  checkAppointmentReminders()
  setInterval(checkAppointmentReminders, 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  db.closeDb()
})
