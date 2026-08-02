import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import crypto from 'crypto'

// Recursos que só o papel de sistema (Admin) enxerga — não aparecem no editor de
// papéis e são bloqueados no IPC por auth.requireAdmin().
export const ADMIN_ONLY_RESOURCE_KEYS = ['dashboard', 'backdated'] as const

export const ASSIGNABLE_RESOURCE_KEYS = ['pos', 'products', 'history', 'menu', 'scheduling', 'finance', 'users'] as const

export const ALL_RESOURCE_KEYS = [...ASSIGNABLE_RESOURCE_KEYS, ...ADMIN_ONLY_RESOURCE_KEYS] as const

let db: Database.Database

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

export function closeDb() {
  if (db?.open) {
    db.close()
  }
}

// Backup "a quente": usa a API de backup do SQLite (via better-sqlite3), então
// funciona com o banco aberto e em uso, sem arriscar copiar um arquivo em
// escrita no meio de uma transação.
export function backupDatabase(destPath: string): Promise<void> {
  return db.backup(destPath).then(() => undefined)
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'pdv.db')
}

// Sem 0/O/1/l/I: evita confusão de quem for digitar a senha à mão a partir do
// diálogo mostrado uma única vez no primeiro uso.
const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generateRandomPassword(length = 10): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length]
  }
  return out
}

export interface SeedResult {
  // Presente só quando o banco acabou de ser criado agora: é a única vez que a
  // senha existe em texto puro, pra quem chamou initDb() poder mostrá-la.
  adminCredentials?: { username: string; password: string }
}

export function initDb(): SeedResult {
  db = new Database(getDbPath())
  // DELETE (padrão) em vez de WAL: mantém o .db principal sempre consistente e
  // legível por ferramentas externas (DBeaver etc.) sem depender de checkpoint.
  // App single-user de baixo volume, então não perdemos nada de performance.
  db.pragma('journal_mode = DELETE')

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      active INTEGER DEFAULT 1,
      unit_type TEXT NOT NULL DEFAULT 'unit',
      pack_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      change_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity REAL NOT NULL,
      subtotal REAL NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'unit',
      pack_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      received REAL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      active INTEGER DEFAULT 1,
      unit_type TEXT NOT NULL DEFAULT 'unit',
      pack_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT,
      scheduled_at TEXT NOT NULL,
      notes TEXT,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS appointment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_value REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    -- incurred_on = competência (quando a despesa foi gerada); paid_on = caixa
    -- (quando o dinheiro saiu, NULL enquanto está em aberto); due_on = vencimento.
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category_id INTEGER REFERENCES expense_categories(id),
      supplier TEXT,
      amount REAL NOT NULL,
      incurred_on TEXT NOT NULL,
      due_on TEXT,
      paid_on TEXT,
      payment_method TEXT,
      notes TEXT,
      recurring_id INTEGER REFERENCES recurring_expenses(id),
      period TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Molde das despesas fixas (aluguel, internet, assinaturas). Não é uma despesa:
    -- a cada mês vencido ele materializa uma linha real em expenses.
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category_id INTEGER REFERENCES expense_categories(id),
      supplier TEXT,
      amount REAL NOT NULL,
      due_day INTEGER NOT NULL,
      start_month TEXT NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_incurred ON expenses(incurred_on);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid ON expenses(paid_on);
    CREATE INDEX IF NOT EXISTS idx_expenses_due ON expenses(due_on);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `)

  ensureColumn('sales', 'type', `type TEXT NOT NULL DEFAULT 'sale'`)
  ensureColumn('sales', 'backdated', 'backdated INTEGER DEFAULT 0')
  ensureColumn('sales', 'reversal_of_sale_id', 'reversal_of_sale_id INTEGER REFERENCES sales(id)')
  ensureColumn('sale_items', 'reversed_item_id', 'reversed_item_id INTEGER REFERENCES sale_items(id)')
  ensureColumn('products', 'unit_type', `unit_type TEXT NOT NULL DEFAULT 'unit'`)
  ensureColumn('products', 'pack_size', 'pack_size INTEGER')
  ensureColumn('menu_items', 'unit_type', `unit_type TEXT NOT NULL DEFAULT 'unit'`)
  ensureColumn('menu_items', 'pack_size', 'pack_size INTEGER')
  ensureColumn('sale_items', 'unit_type', `unit_type TEXT NOT NULL DEFAULT 'unit'`)
  ensureColumn('sale_items', 'pack_size', 'pack_size INTEGER')
  ensureColumn('appointments', 'acknowledged', 'acknowledged INTEGER DEFAULT 0')
  ensureColumn('appointments', 'last_notified_at', 'last_notified_at TEXT')
  ensureColumn('expenses', 'recurring_id', 'recurring_id INTEGER REFERENCES recurring_expenses(id)')
  ensureColumn('expenses', 'period', 'period TEXT')

  // Depois do ensureColumn: em bancos criados antes da recorrência as colunas do
  // índice ainda não existiam. Índice parcial único = uma despesa por mês por
  // molde, mesmo que a geração rode duas vezes.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurrence
      ON expenses(recurring_id, period) WHERE recurring_id IS NOT NULL;
  `)

  syncRolePermissions()
  seedMessageTemplates()
  seedExpenseCategories()
  generateRecurringExpenses()

  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
  if (categoryCount.count === 0) {
    const ins = db.prepare('INSERT INTO categories (name) VALUES (?)')
    for (const name of ['Bolos', 'Doces', 'Salgados', 'Bebidas', 'Outros']) {
      ins.run(name)
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  let adminCredentials: { username: string; password: string } | undefined
  if (userCount.count === 0) {
    const adminRole = createRole({ name: 'Admin', permissions: [...ALL_RESOURCE_KEYS], is_system: true })
    const username = '0001'
    const password = generateRandomPassword()
    createUser({ username, password, role_id: adminRole.id as number })
    adminCredentials = { username, password }
  }

  return { adminCredentials }
}

export function getAllProducts() {
  return db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY c.name, p.name
  `).all()
}

interface ProductInput {
  name: string
  price: number
  category_id?: number
  unit_type?: string
  pack_size?: number
}

export function createProduct(data: ProductInput) {
  const result = db.prepare(
    'INSERT INTO products (name, price, category_id, unit_type, pack_size) VALUES (?, ?, ?, ?, ?)'
  ).run(data.name, data.price, data.category_id ?? null, data.unit_type ?? 'unit', data.pack_size ?? null)
  return { id: result.lastInsertRowid, ...data, active: 1 }
}

export function updateProduct(
  id: number,
  data: ProductInput & { active?: number }
) {
  db.prepare(
    'UPDATE products SET name = ?, price = ?, category_id = ?, active = ?, unit_type = ?, pack_size = ? WHERE id = ?'
  ).run(data.name, data.price, data.category_id ?? null, data.active ?? 1, data.unit_type ?? 'unit', data.pack_size ?? null, id)
  return { id, ...data }
}

export function deleteProduct(id: number) {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id)
}

export function getAllCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all()
}

export function createCategory(name: string) {
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name)
  return { id: result.lastInsertRowid, name }
}

interface SaleItemInput {
  product_id?: number
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  unit_type?: string
  pack_size?: number
}

interface SalePaymentInput {
  method: string
  amount: number
  received?: number
}

// Aceita 'YYYY-MM-DDTHH:MM' (input datetime-local) ou 'YYYY-MM-DD HH:MM[:SS]' e
// devolve no mesmo formato que datetime('now','localtime') grava.
export function normalizeSaleTimestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? '').trim())
  if (!match) throw new Error('Informe uma data e hora válidas para a venda.')

  const timestamp = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] ?? '00'}`
  const row = db.prepare(
    `SELECT datetime(?) as parsed, (datetime(?) > datetime('now', 'localtime')) as is_future`
  ).get(timestamp, timestamp) as { parsed: string | null; is_future: number | null }

  if (!row.parsed) throw new Error('Informe uma data e hora válidas para a venda.')
  if (row.is_future) throw new Error('Não é possível lançar uma venda com data no futuro.')
  return timestamp
}

export function createSale(data: {
  total: number
  items: SaleItemInput[]
  payments: SalePaymentInput[]
  created_at?: string
}) {
  const changeAmount = data.payments.reduce((sum, p) => sum + Math.max(0, (p.received ?? p.amount) - p.amount), 0)
  const createdAt = data.created_at ? normalizeSaleTimestamp(data.created_at) : null

  const insertSale = db.prepare(
    `INSERT INTO sales (total, change_amount, type, backdated, created_at)
     VALUES (?, ?, 'sale', ?, COALESCE(?, datetime('now', 'localtime')))`
  )
  const insertItem = db.prepare(
    'INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, subtotal, unit_type, pack_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertPayment = db.prepare(
    'INSERT INTO sale_payments (sale_id, method, amount, received) VALUES (?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    const saleResult = insertSale.run(data.total, changeAmount, createdAt ? 1 : 0, createdAt)
    const saleId = saleResult.lastInsertRowid
    for (const item of data.items) {
      insertItem.run(
        saleId, item.product_id ?? null, item.product_name, item.unit_price, item.quantity, item.subtotal,
        item.unit_type ?? 'unit', item.pack_size ?? null
      )
    }
    for (const payment of data.payments) {
      insertPayment.run(saleId, payment.method, payment.amount, payment.received ?? null)
    }
    return saleId
  })

  return { id: transaction() }
}

export function cancelSaleItems(
  saleId: number,
  data: { items: Array<{ sale_item_id: number; quantity: number }>; method: string }
) {
  const insertSale = db.prepare(
    `INSERT INTO sales (total, change_amount, type, reversal_of_sale_id) VALUES (?, 0, 'cancellation', ?)`
  )
  const insertItem = db.prepare(
    'INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, subtotal, reversed_item_id, unit_type, pack_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertPayment = db.prepare(
    'INSERT INTO sale_payments (sale_id, method, amount) VALUES (?, ?, ?)'
  )
  const getItem = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?')

  const transaction = db.transaction(() => {
    let total = 0
    const cancellationResult = insertSale.run(0, saleId)
    const cancellationId = cancellationResult.lastInsertRowid

    for (const line of data.items) {
      const original = getItem.get(line.sale_item_id, saleId) as
        | {
            id: number
            product_id: number | null
            product_name: string
            unit_price: number
            unit_type: string
            pack_size: number | null
          }
        | undefined
      if (!original) continue
      const remaining = getRemainingQuantity(line.sale_item_id)
      const qty = Math.min(line.quantity, remaining)
      if (qty <= 0) continue
      const subtotal = -(qty * original.unit_price)
      insertItem.run(
        cancellationId, original.product_id, original.product_name, original.unit_price, -qty, subtotal, original.id,
        original.unit_type, original.pack_size
      )
      total += subtotal
    }

    db.prepare('UPDATE sales SET total = ? WHERE id = ?').run(total, cancellationId)
    if (total !== 0) {
      insertPayment.run(cancellationId, data.method, total)
    }
    return cancellationId
  })

  return { id: transaction() }
}

export function getRemainingQuantity(saleItemId: number): number {
  const original = db.prepare('SELECT quantity FROM sale_items WHERE id = ?').get(saleItemId) as
    | { quantity: number }
    | undefined
  if (!original) return 0
  const cancelled = db.prepare(
    'SELECT COALESCE(SUM(-quantity), 0) as qty FROM sale_items WHERE reversed_item_id = ?'
  ).get(saleItemId) as { qty: number }
  return original.quantity - cancelled.qty
}

export function getSales(filters?: { from?: string; to?: string; limit?: number }) {
  let query = `
    SELECT s.*, COUNT(DISTINCT si.id) as item_count,
      (SELECT GROUP_CONCAT(DISTINCT method) FROM sale_payments WHERE sale_id = s.id) as payment_methods
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
  `
  const params: unknown[] = []
  const where: string[] = []

  if (filters?.from) {
    where.push('date(s.created_at) >= ?')
    params.push(filters.from)
  }
  if (filters?.to) {
    where.push('date(s.created_at) <= ?')
    params.push(filters.to)
  }
  if (where.length) {
    query += ` WHERE ${where.join(' AND ')}`
  }

  query += ` GROUP BY s.id ORDER BY s.created_at DESC`

  if (filters?.limit) {
    query += ` LIMIT ?`
    params.push(filters.limit)
  }

  return db.prepare(query).all(...params)
}

export function getPaymentBreakdown(filters?: { from?: string; to?: string }) {
  let query = `
    SELECT sp.method, COUNT(*) as count
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.type = 'sale'
  `
  const params: unknown[] = []

  if (filters?.from) {
    query += ' AND date(s.created_at) >= ?'
    params.push(filters.from)
  }
  if (filters?.to) {
    query += ' AND date(s.created_at) <= ?'
    params.push(filters.to)
  }

  query += ' GROUP BY sp.method'

  return db.prepare(query).all(...params) as Array<{ method: string; count: number }>
}

export function getSaleItems(saleId: number) {
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(saleId) as Array<{
    id: number
    quantity: number
  }>
  return items.map(item => ({
    ...item,
    remaining_quantity: item.quantity > 0 ? getRemainingQuantity(item.id) : null
  }))
}

export function getSalePayments(saleId: number) {
  return db.prepare('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id').all(saleId)
}

export function getTodayTotal() {
  return db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
    FROM sales
    WHERE date(created_at) = date('now', 'localtime') AND type = 'sale'
  `).get() as { total: number; count: number }
}

// --- Financeiro: despesas e contas a pagar ---

// 'cash' (caixa) conta a despesa no dia em que ela foi paga e ignora o que ainda
// está em aberto; 'accrual' (competência) conta na data em que ela foi gerada,
// paga ou não. Os dois convivem porque respondem perguntas diferentes: quanto
// saiu do caixa vs. quanto o mês realmente custou.
export type FinanceBasis = 'cash' | 'accrual'

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Insumos',
  'Embalagens',
  'Aluguel',
  'Energia e água',
  'Internet e telefone',
  'Salários e encargos',
  'Equipamentos',
  'Marketing',
  'Impostos e taxas',
  'Transporte',
  'Outros'
]

// Mesma regra dos modelos de mensagem: semeia uma vez só, para que categorias
// apagadas de propósito não voltem no próximo boot.
function seedExpenseCategories() {
  if (getSetting('expense_categories_seeded') === '1') return
  const insert = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)')
  for (const name of DEFAULT_EXPENSE_CATEGORIES) insert.run(name)
  setSetting('expense_categories_seeded', '1')
}

function normalizeBasis(basis?: string): FinanceBasis {
  return basis === 'accrual' ? 'accrual' : 'cash'
}

// Colunas de data, não parâmetros: por isso entram interpoladas na query. O valor
// vem sempre de normalizeBasis(), nunca direto do renderer.
function basisColumn(basis: FinanceBasis): string {
  return basis === 'cash' ? 'paid_on' : 'incurred_on'
}

function basisFilter(basis: FinanceBasis): string {
  return basis === 'cash' ? 'e.paid_on IS NOT NULL' : '1 = 1'
}

// Aceita 'YYYY-MM-DD'. allowFuture só para vencimento — competência e pagamento
// no futuro seriam lançamentos inconsistentes.
function normalizeExpenseDate(value: unknown, field: string, allowFuture = false): string {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Informe uma data válida para ${field}.`)
  }
  const row = db.prepare(
    `SELECT date(?) as parsed, (date(?) > date('now', 'localtime')) as is_future`
  ).get(text, text) as { parsed: string | null; is_future: number | null }

  if (!row.parsed) throw new Error(`Informe uma data válida para ${field}.`)
  if (!allowFuture && row.is_future) throw new Error(`A data de ${field} não pode estar no futuro.`)
  return text
}

export function getExpenseCategories() {
  return db.prepare('SELECT * FROM expense_categories ORDER BY name').all()
}

export function createExpenseCategory(name: string) {
  const clean = String(name ?? '').trim()
  if (!clean) throw new Error('Informe o nome da categoria.')
  const existing = db.prepare('SELECT * FROM expense_categories WHERE name = ? COLLATE NOCASE').get(clean) as
    | { id: number; name: string }
    | undefined
  if (existing) return existing
  const result = db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(clean)
  return { id: result.lastInsertRowid, name: clean }
}

export function deleteExpenseCategory(id: number) {
  const usage = db.prepare('SELECT COUNT(*) as count FROM expenses WHERE category_id = ?').get(id) as { count: number }
  if (usage.count > 0) {
    throw new Error('Existem despesas nessa categoria. Troque a categoria delas antes de excluir.')
  }
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id)
}

// Status derivado, nunca gravado: uma despesa "vence" sozinha com o passar do dia.
const STATUS_EXPR = `
  CASE
    WHEN e.paid_on IS NOT NULL THEN 'paid'
    WHEN e.due_on IS NOT NULL AND date(e.due_on) < date('now', 'localtime') THEN 'overdue'
    ELSE 'open'
  END`

export interface ExpenseInput {
  description: string
  category_id?: number | null
  supplier?: string | null
  amount: number
  incurred_on: string
  due_on?: string | null
  paid_on?: string | null
  payment_method?: string | null
  notes?: string | null
}

function sanitizeExpense(data: ExpenseInput) {
  const description = String(data.description ?? '').trim()
  if (!description) throw new Error('Informe a descrição da despesa.')

  const amount = Number(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.')

  const paidOn = data.paid_on ? normalizeExpenseDate(data.paid_on, 'pagamento') : null

  return {
    description,
    category_id: data.category_id ?? null,
    supplier: String(data.supplier ?? '').trim() || null,
    amount,
    incurred_on: normalizeExpenseDate(data.incurred_on, 'competência'),
    due_on: data.due_on ? normalizeExpenseDate(data.due_on, 'vencimento', true) : null,
    paid_on: paidOn,
    // Forma de pagamento só faz sentido depois que a despesa foi paga.
    payment_method: paidOn ? (String(data.payment_method ?? '').trim() || null) : null,
    notes: String(data.notes ?? '').trim() || null
  }
}

export function getExpenses(filters?: {
  from?: string
  to?: string
  basis?: string
  status?: string
  category_id?: number
  search?: string
}) {
  const basis = normalizeBasis(filters?.basis)
  const dateCol = basisColumn(basis)
  const params: unknown[] = []

  // Dívida em aberto é estado atual, não recorte de período: filtrar 'em aberto'
  // por data (ainda mais no regime de caixa, que só enxerga o que já foi pago)
  // devolveria lista vazia justamente quando a pessoa quer ver o que deve.
  const wantsPayables = filters?.status === 'open' || filters?.status === 'overdue'
  const where: string[] = wantsPayables ? ['e.paid_on IS NULL'] : [basisFilter(basis)]

  if (!wantsPayables && filters?.from) {
    where.push(`date(e.${dateCol}) >= ?`)
    params.push(filters.from)
  }
  if (!wantsPayables && filters?.to) {
    where.push(`date(e.${dateCol}) <= ?`)
    params.push(filters.to)
  }
  if (filters?.category_id) {
    where.push('e.category_id = ?')
    params.push(filters.category_id)
  }
  if (filters?.search) {
    where.push('(e.description LIKE ? OR e.supplier LIKE ?)')
    params.push(`%${filters.search}%`, `%${filters.search}%`)
  }

  const orderBy = wantsPayables
    ? '(e.due_on IS NULL), date(e.due_on) ASC, e.id ASC'
    : `COALESCE(e.${dateCol}, e.incurred_on) DESC, e.id DESC`

  const query = `
    SELECT e.*, c.name as category_name, ${STATUS_EXPR} as status
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
  `

  const rows = db.prepare(query).all(...params) as Array<{ status: string }>
  // Filtro por status depois da query: 'status' é expressão, não coluna, então não
  // dá para reusá-la no WHERE sem repetir o CASE inteiro.
  if (filters?.status && filters.status !== 'all') {
    return rows.filter(row => row.status === filters.status)
  }
  return rows
}

export function getExpenseById(id: number) {
  return db.prepare(`
    SELECT e.*, c.name as category_name, ${STATUS_EXPR} as status
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.id = ?
  `).get(id)
}

export function createExpense(data: ExpenseInput) {
  const clean = sanitizeExpense(data)
  const result = db.prepare(`
    INSERT INTO expenses (description, category_id, supplier, amount, incurred_on, due_on, paid_on, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clean.description, clean.category_id, clean.supplier, clean.amount,
    clean.incurred_on, clean.due_on, clean.paid_on, clean.payment_method, clean.notes
  )
  return getExpenseById(Number(result.lastInsertRowid))
}

export function updateExpense(id: number, data: ExpenseInput) {
  const clean = sanitizeExpense(data)
  db.prepare(`
    UPDATE expenses
    SET description = ?, category_id = ?, supplier = ?, amount = ?, incurred_on = ?,
        due_on = ?, paid_on = ?, payment_method = ?, notes = ?
    WHERE id = ?
  `).run(
    clean.description, clean.category_id, clean.supplier, clean.amount, clean.incurred_on,
    clean.due_on, clean.paid_on, clean.payment_method, clean.notes, id
  )
  return getExpenseById(id)
}

export function deleteExpense(id: number) {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
}

// Atalho da lista: quitar/reabrir sem passar pelo formulário inteiro.
export function setExpensePaid(id: number, data: { paid_on?: string; payment_method?: string }) {
  const paidOn = normalizeExpenseDate(data.paid_on ?? todayIso(), 'pagamento')
  const method = String(data.payment_method ?? '').trim() || null
  db.prepare('UPDATE expenses SET paid_on = ?, payment_method = ? WHERE id = ?').run(paidOn, method, id)
  return getExpenseById(id)
}

export function reopenExpense(id: number) {
  db.prepare('UPDATE expenses SET paid_on = NULL, payment_method = NULL WHERE id = ?').run(id)
  return getExpenseById(id)
}

function todayIso(): string {
  return (db.prepare(`SELECT date('now', 'localtime') as today`).get() as { today: string }).today
}

export interface ExpenseTotals {
  total: number
  count: number
}

function getExpenseTotals(from: string, to: string, basis: FinanceBasis): ExpenseTotals {
  const dateCol = basisColumn(basis)
  return db.prepare(`
    SELECT COALESCE(SUM(e.amount), 0) as total, COUNT(*) as count
    FROM expenses e
    WHERE ${basisFilter(basis)} AND date(e.${dateCol}) BETWEEN ? AND ?
  `).get(from, to) as ExpenseTotals
}

function getExpensesByCategory(from: string, to: string, basis: FinanceBasis) {
  const dateCol = basisColumn(basis)
  return db.prepare(`
    SELECT COALESCE(c.name, 'Sem categoria') as category,
      COALESCE(SUM(e.amount), 0) as amount,
      COUNT(*) as count
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE ${basisFilter(basis)} AND date(e.${dateCol}) BETWEEN ? AND ?
    GROUP BY category
    ORDER BY amount DESC
  `).all(from, to) as Array<{ category: string; amount: number; count: number }>
}

export interface PayablesSummary {
  overdue_amount: number
  overdue_count: number
  due_soon_amount: number
  due_soon_count: number
  open_amount: number
  open_count: number
}

// Dívida é estado atual, não recorte de período: sempre olha tudo que está aberto,
// independente do filtro de datas da tela.
export function getPayablesSummary(): PayablesSummary {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN due_on IS NOT NULL AND date(due_on) < date('now', 'localtime') THEN amount ELSE 0 END), 0) as overdue_amount,
      COUNT(CASE WHEN due_on IS NOT NULL AND date(due_on) < date('now', 'localtime') THEN 1 END) as overdue_count,
      COALESCE(SUM(CASE WHEN due_on IS NOT NULL AND date(due_on) BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days') THEN amount ELSE 0 END), 0) as due_soon_amount,
      COUNT(CASE WHEN due_on IS NOT NULL AND date(due_on) BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days') THEN 1 END) as due_soon_count,
      COALESCE(SUM(amount), 0) as open_amount,
      COUNT(*) as open_count
    FROM expenses
    WHERE paid_on IS NULL
  `).get() as PayablesSummary
}

export function getUpcomingPayables(limit = 6) {
  return db.prepare(`
    SELECT e.*, c.name as category_name, ${STATUS_EXPR} as status
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.paid_on IS NULL
    ORDER BY (e.due_on IS NULL), date(e.due_on) ASC, e.id ASC
    LIMIT ?
  `).all(limit)
}

// --- Despesas fixas (recorrentes) ---

// Quanto tempo para trás a geração aceita ir. Protege contra um mês inicial
// digitado errado (2016 em vez de 2026) virar dezenas de contas fantasma.
const MAX_BACKFILL_MONTHS = 24

function currentMonth(): string {
  return (db.prepare(`SELECT strftime('%Y-%m', 'now', 'localtime') as month`).get() as { month: string }).month
}

function addMonths(month: string, count: number): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1 + count, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function firstDayOf(month: string): string {
  return `${month}-01`
}

// Dia 31 num mês de 30 cai no último dia, não vaza para o mês seguinte.
function dayInMonth(month: string, day: number): string {
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, '0')}`
}

function normalizeMonth(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    throw new Error('Informe um mês inicial válido.')
  }
  return text
}

export interface RecurringExpenseInput {
  description: string
  category_id?: number | null
  supplier?: string | null
  amount: number
  due_day: number
  start_month: string
  notes?: string | null
  active?: number
}

function sanitizeRecurring(data: RecurringExpenseInput) {
  const description = String(data.description ?? '').trim()
  if (!description) throw new Error('Informe a descrição da despesa fixa.')

  const amount = Number(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.')

  const dueDay = Math.trunc(Number(data.due_day))
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error('O dia do vencimento precisa estar entre 1 e 31.')
  }

  const startMonth = normalizeMonth(data.start_month)
  const oldestAllowed = addMonths(currentMonth(), -MAX_BACKFILL_MONTHS)
  if (startMonth < oldestAllowed) {
    throw new Error(`O mês inicial não pode ser anterior a ${oldestAllowed.split('-').reverse().join('/')}.`)
  }

  return {
    description,
    category_id: data.category_id ?? null,
    supplier: String(data.supplier ?? '').trim() || null,
    amount,
    due_day: dueDay,
    start_month: startMonth,
    notes: String(data.notes ?? '').trim() || null,
    active: data.active === 0 ? 0 : 1
  }
}

// Materializa uma despesa em aberto para cada mês já iniciado que o molde ainda
// não cobriu. Idempotente: rodar de novo não duplica nada.
export function generateRecurringExpenses(): number {
  const rules = db.prepare('SELECT * FROM recurring_expenses WHERE active = 1').all() as Array<{
    id: number
    description: string
    category_id: number | null
    supplier: string | null
    amount: number
    due_day: number
    start_month: string
    notes: string | null
  }>
  if (rules.length === 0) return 0

  const thisMonth = currentMonth()
  const oldestAllowed = addMonths(thisMonth, -MAX_BACKFILL_MONTHS)
  const exists = db.prepare('SELECT 1 FROM expenses WHERE recurring_id = ? AND period = ?')
  const insert = db.prepare(`
    INSERT INTO expenses (description, category_id, supplier, amount, incurred_on, due_on, notes, recurring_id, period)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    let created = 0
    for (const rule of rules) {
      // Nunca gera mês futuro: a competência de um mês que ainda não começou
      // inflaria a despesa do período sem que ela tenha acontecido.
      let month = rule.start_month < oldestAllowed ? oldestAllowed : rule.start_month
      while (month <= thisMonth) {
        if (!exists.get(rule.id, month)) {
          insert.run(
            rule.description, rule.category_id, rule.supplier, rule.amount,
            firstDayOf(month), dayInMonth(month, rule.due_day), rule.notes, rule.id, month
          )
          created++
        }
        month = addMonths(month, 1)
      }
    }
    return created
  })

  return transaction()
}

export function getRecurringExpenses() {
  return db.prepare(`
    SELECT r.*, c.name as category_name,
      (SELECT COUNT(*) FROM expenses e WHERE e.recurring_id = r.id) as generated_count,
      (SELECT MAX(e.period) FROM expenses e WHERE e.recurring_id = r.id) as last_period
    FROM recurring_expenses r
    LEFT JOIN expense_categories c ON c.id = r.category_id
    ORDER BY r.active DESC, r.due_day, r.description
  `).all()
}

export function getRecurringMonthlyTotal(): { active_count: number; monthly_total: number } {
  return db.prepare(`
    SELECT COUNT(*) as active_count, COALESCE(SUM(amount), 0) as monthly_total
    FROM recurring_expenses WHERE active = 1
  `).get() as { active_count: number; monthly_total: number }
}

export function createRecurringExpense(data: RecurringExpenseInput) {
  const clean = sanitizeRecurring(data)
  const result = db.prepare(`
    INSERT INTO recurring_expenses (description, category_id, supplier, amount, due_day, start_month, notes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clean.description, clean.category_id, clean.supplier, clean.amount,
    clean.due_day, clean.start_month, clean.notes, clean.active
  )
  // Já traz para a tela as contas dos meses passados que o molde cobre.
  const generated = generateRecurringExpenses()
  return { id: Number(result.lastInsertRowid), generated }
}

// Alterações valem para os meses seguintes: as despesas já geradas continuam com
// o valor que foi realmente cobrado na época.
export function updateRecurringExpense(id: number, data: RecurringExpenseInput) {
  const clean = sanitizeRecurring(data)
  db.prepare(`
    UPDATE recurring_expenses
    SET description = ?, category_id = ?, supplier = ?, amount = ?, due_day = ?,
        start_month = ?, notes = ?, active = ?
    WHERE id = ?
  `).run(
    clean.description, clean.category_id, clean.supplier, clean.amount,
    clean.due_day, clean.start_month, clean.notes, clean.active, id
  )
  const generated = generateRecurringExpenses()
  return { id, generated }
}

export function setRecurringActive(id: number, active: boolean) {
  db.prepare('UPDATE recurring_expenses SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  const generated = active ? generateRecurringExpenses() : 0
  return { id, generated }
}

// As despesas já geradas ficam: são histórico real e podem estar pagas. Só perdem
// o vínculo com o molde.
export function deleteRecurringExpense(id: number) {
  const transaction = db.transaction(() => {
    db.prepare('UPDATE expenses SET recurring_id = NULL, period = NULL WHERE recurring_id = ?').run(id)
    db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id)
  })
  transaction()
}

interface FinanceBlock {
  basis: FinanceBasis
  revenue: number
  expenses: number
  expense_count: number
  profit: number
  margin: number
}

function buildFinanceBlock(from: string, to: string, basis: FinanceBasis, revenue: number): FinanceBlock {
  const expenses = getExpenseTotals(from, to, basis)
  const profit = revenue - expenses.total
  return {
    basis,
    revenue,
    expenses: expenses.total,
    expense_count: expenses.count,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0
  }
}

export function getFinanceSummary(filters: { from: string; to: string; basis?: string }) {
  const { from, to } = filters
  const basis = normalizeBasis(filters.basis)
  const span = daysBetween(from, to) + 1
  const previousTo = shiftDate(from, -1)
  const previousFrom = shiftDate(previousTo, -(span - 1))

  const totals = getPeriodTotals(from, to)
  const previousTotals = getPeriodTotals(previousFrom, previousTo)

  return {
    range: { from, to, previous_from: previousFrom, previous_to: previousTo },
    basis,
    // Faturamento aqui é líquido: uma venda cancelada some do total. `totals`
    // acompanha para a tela conseguir explicar a diferença em vez de só encolher.
    totals,
    current: buildFinanceBlock(from, to, basis, totals.net_revenue),
    previous: buildFinanceBlock(previousFrom, previousTo, basis, previousTotals.net_revenue),
    byCategory: getExpensesByCategory(from, to, basis),
    payables: getPayablesSummary(),
    upcomingPayables: getUpcomingPayables(),
    recurring: getRecurringMonthlyTotal()
  }
}

// --- Dashboard ---

function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(diff / 86400000)
}

interface PeriodTotals {
  net_revenue: number
  gross_revenue: number
  cancelled_amount: number
  sale_count: number
  cancellation_count: number
  backdated_count: number
}

function getPeriodTotals(from: string, to: string): PeriodTotals {
  return db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as net_revenue,
      COALESCE(SUM(CASE WHEN type = 'sale' THEN total ELSE 0 END), 0) as gross_revenue,
      COALESCE(SUM(CASE WHEN type = 'cancellation' THEN -total ELSE 0 END), 0) as cancelled_amount,
      COUNT(CASE WHEN type = 'sale' THEN 1 END) as sale_count,
      COUNT(CASE WHEN type = 'cancellation' THEN 1 END) as cancellation_count,
      COUNT(CASE WHEN type = 'sale' AND backdated = 1 THEN 1 END) as backdated_count
    FROM sales
    WHERE date(created_at) BETWEEN ? AND ?
  `).get(from, to) as PeriodTotals
}

export function getDashboard(filters: { from: string; to: string; basis?: string }) {
  const { from, to } = filters
  const basis = normalizeBasis(filters.basis)
  const span = daysBetween(from, to) + 1
  const previousTo = shiftDate(from, -1)
  const previousFrom = shiftDate(previousTo, -(span - 1))

  const dailyRows = db.prepare(`
    SELECT date(created_at) as day,
      COALESCE(SUM(total), 0) as net,
      COUNT(CASE WHEN type = 'sale' THEN 1 END) as sale_count
    FROM sales
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY day
  `).all(from, to) as Array<{ day: string; net: number; sale_count: number }>

  const dailyExpenseRows = db.prepare(`
    SELECT date(e.${basisColumn(basis)}) as day, COALESCE(SUM(e.amount), 0) as expense
    FROM expenses e
    WHERE ${basisFilter(basis)} AND date(e.${basisColumn(basis)}) BETWEEN ? AND ?
    GROUP BY day
  `).all(from, to) as Array<{ day: string; expense: number }>

  const byDay = new Map(dailyRows.map(row => [row.day, row]))
  const expenseByDay = new Map(dailyExpenseRows.map(row => [row.day, row.expense]))
  const daily: Array<{ day: string; net: number; sale_count: number; expense: number; profit: number }> = []
  for (let i = 0; i < span; i++) {
    const day = shiftDate(from, i)
    const sales = byDay.get(day) ?? { day, net: 0, sale_count: 0 }
    const expense = expenseByDay.get(day) ?? 0
    daily.push({ ...sales, expense, profit: sales.net - expense })
  }

  const topProducts = db.prepare(`
    SELECT si.product_name as name,
      MIN(si.unit_type) as unit_type,
      COALESCE(SUM(si.quantity), 0) as quantity,
      COALESCE(SUM(si.subtotal), 0) as revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE date(s.created_at) BETWEEN ? AND ?
    GROUP BY si.product_name
    HAVING revenue > 0
    ORDER BY revenue DESC
    LIMIT 8
  `).all(from, to)

  const paymentMix = db.prepare(`
    SELECT sp.method,
      COALESCE(SUM(sp.amount), 0) as amount,
      COUNT(*) as count
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.type = 'sale' AND date(s.created_at) BETWEEN ? AND ?
    GROUP BY sp.method
    ORDER BY amount DESC
  `).all(from, to)

  const hourlyRows = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
      COUNT(*) as sale_count,
      COALESCE(SUM(total), 0) as net
    FROM sales
    WHERE type = 'sale' AND date(created_at) BETWEEN ? AND ?
    GROUP BY hour
  `).all(from, to) as Array<{ hour: number; sale_count: number; net: number }>

  const byHour = new Map(hourlyRows.map(row => [row.hour, row]))
  const hourly = Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, sale_count: 0, net: 0 })

  const upcomingAppointments = db.prepare(`
    SELECT * FROM appointments
    WHERE status = 'scheduled' AND datetime(scheduled_at) >= datetime('now', 'localtime', '-1 day')
    ORDER BY scheduled_at ASC
    LIMIT 6
  `).all()

  const appointmentStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN date(scheduled_at) = date('now', 'localtime') THEN 1 END) as today_count,
      COALESCE(SUM(CASE WHEN datetime(scheduled_at) >= datetime('now', 'localtime') THEN total ELSE 0 END), 0) as upcoming_total
    FROM appointments
    WHERE status = 'scheduled'
  `).get() as { today_count: number; upcoming_total: number }

  const totals = getPeriodTotals(from, to)
  const previousTotals = getPeriodTotals(previousFrom, previousTo)

  return {
    range: { from, to, previous_from: previousFrom, previous_to: previousTo },
    totals,
    previousTotals,
    today: getTodayTotal(),
    daily,
    topProducts,
    paymentMix,
    hourly,
    upcomingAppointments,
    appointmentStats,
    finance: {
      basis,
      current: buildFinanceBlock(from, to, basis, totals.net_revenue),
      previous: buildFinanceBlock(previousFrom, previousTo, basis, previousTotals.net_revenue),
      byCategory: getExpensesByCategory(from, to, basis),
      payables: getPayablesSummary()
    }
  }
}

export function getAllMenuItems() {
  return db.prepare('SELECT * FROM menu_items ORDER BY name').all()
}

interface MenuItemInput {
  name: string
  price: number
  unit_type?: string
  pack_size?: number
}

export function createMenuItem(data: MenuItemInput) {
  const result = db.prepare(
    'INSERT INTO menu_items (name, price, unit_type, pack_size) VALUES (?, ?, ?, ?)'
  ).run(data.name, data.price, data.unit_type ?? 'unit', data.pack_size ?? null)
  return { id: result.lastInsertRowid, ...data, active: 1 }
}

export function updateMenuItem(id: number, data: MenuItemInput & { active?: number }) {
  db.prepare('UPDATE menu_items SET name = ?, price = ?, active = ?, unit_type = ?, pack_size = ? WHERE id = ?')
    .run(data.name, data.price, data.active ?? 1, data.unit_type ?? 'unit', data.pack_size ?? null, id)
  return { id, ...data }
}

export function deleteMenuItem(id: number) {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id)
}

interface AppointmentItemInput {
  description: string
  quantity: number
  unit_value: number
  subtotal: number
}

export function getAppointments(filters?: { from?: string; to?: string }) {
  let query = 'SELECT * FROM appointments'
  const params: unknown[] = []
  const where: string[] = []

  if (filters?.from) {
    where.push('date(scheduled_at) >= ?')
    params.push(filters.from)
  }
  if (filters?.to) {
    where.push('date(scheduled_at) <= ?')
    params.push(filters.to)
  }
  if (where.length) {
    query += ` WHERE ${where.join(' AND ')}`
  }
  query += ' ORDER BY scheduled_at ASC'

  return db.prepare(query).all(...params)
}

export function getAppointmentItems(appointmentId: number) {
  return db.prepare('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY id').all(appointmentId)
}

export function createAppointment(data: {
  customer_name: string
  phone?: string
  scheduled_at: string
  notes?: string
  items: AppointmentItemInput[]
}) {
  const total = data.items.reduce((sum, i) => sum + i.subtotal, 0)
  const insertAppointment = db.prepare(
    'INSERT INTO appointments (customer_name, phone, scheduled_at, notes, total) VALUES (?, ?, ?, ?, ?)'
  )
  const insertItem = db.prepare(
    'INSERT INTO appointment_items (appointment_id, description, quantity, unit_value, subtotal) VALUES (?, ?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    const result = insertAppointment.run(data.customer_name, data.phone ?? null, data.scheduled_at, data.notes ?? null, total)
    const appointmentId = result.lastInsertRowid
    for (const item of data.items) {
      insertItem.run(appointmentId, item.description, item.quantity, item.unit_value, item.subtotal)
    }
    return appointmentId
  })

  return { id: transaction() }
}

export function updateAppointment(
  id: number,
  data: {
    customer_name: string
    phone?: string
    scheduled_at: string
    notes?: string
    status?: string
    items: AppointmentItemInput[]
  }
) {
  const total = data.items.reduce((sum, i) => sum + i.subtotal, 0)
  const updateAppointmentStmt = db.prepare(
    `UPDATE appointments SET customer_name = ?, phone = ?, scheduled_at = ?, notes = ?, total = ?, status = ?,
     acknowledged = 0, last_notified_at = NULL WHERE id = ?`
  )
  const deleteItems = db.prepare('DELETE FROM appointment_items WHERE appointment_id = ?')
  const insertItem = db.prepare(
    'INSERT INTO appointment_items (appointment_id, description, quantity, unit_value, subtotal) VALUES (?, ?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    updateAppointmentStmt.run(
      data.customer_name, data.phone ?? null, data.scheduled_at, data.notes ?? null, total, data.status ?? 'scheduled', id
    )
    deleteItems.run(id)
    for (const item of data.items) {
      insertItem.run(id, item.description, item.quantity, item.unit_value, item.subtotal)
    }
  })

  transaction()
  return { id }
}

export function deleteAppointment(id: number) {
  db.prepare('DELETE FROM appointment_items WHERE appointment_id = ?').run(id)
  db.prepare('DELETE FROM appointments WHERE id = ?').run(id)
}

export function getPendingReminders(reminderMinutes: number) {
  return db.prepare(`
    SELECT * FROM appointments
    WHERE status = 'scheduled'
      AND acknowledged = 0
      AND datetime(scheduled_at) <= datetime('now', 'localtime', '+' || ? || ' minutes')
  `).all(reminderMinutes)
}

export function shouldRenotify(lastNotifiedAt: string | null, renotifyIntervalMinutes: number): boolean {
  if (!lastNotifiedAt) return true
  const row = db.prepare(
    `SELECT (datetime(?) <= datetime('now', 'localtime', '-' || ? || ' minutes')) as due`
  ).get(lastNotifiedAt, renotifyIntervalMinutes) as { due: number }
  return row.due === 1
}

export function markAppointmentLastNotified(id: number) {
  db.prepare(`UPDATE appointments SET last_notified_at = datetime('now', 'localtime') WHERE id = ?`).run(id)
}

export function acknowledgeAppointment(id: number) {
  db.prepare('UPDATE appointments SET acknowledged = 1 WHERE id = ?').run(id)
}

// --- Modelos de mensagem do WhatsApp ---

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    name: 'Confirmar pedido',
    body:
      'Oi, {primeiro_nome}! Aqui é da Dani Cakes 🎂\n\n' +
      'Confirmando seu pedido para {data_hora}:\n{itens}\n\n' +
      'Total: {total}\n\nQualquer ajuste é só me avisar!'
  },
  {
    name: 'Lembrete de retirada',
    body:
      'Oi, {primeiro_nome}! Passando para lembrar do seu pedido na Dani Cakes, ' +
      'marcado para {data_hora}. Até logo! 😊'
  },
  {
    name: 'Pedido pronto',
    body:
      'Oi, {primeiro_nome}! Seu pedido da Dani Cakes já está pronto para retirada. ' +
      'Te esperamos! 🎂'
  }
]

// Semeia só uma vez: se a pessoa apagar todos os modelos de propósito, eles não
// voltam sozinhos no próximo boot.
function seedMessageTemplates() {
  if (getSetting('message_templates_seeded') === '1') return
  const insert = db.prepare('INSERT INTO message_templates (name, body, sort_order) VALUES (?, ?, ?)')
  DEFAULT_MESSAGE_TEMPLATES.forEach((template, index) => insert.run(template.name, template.body, index))
  setSetting('message_templates_seeded', '1')
}

export function getMessageTemplates() {
  return db.prepare('SELECT * FROM message_templates ORDER BY sort_order, id').all()
}

export function createMessageTemplate(data: { name: string; body: string }) {
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM message_templates')
    .get() as { next: number }
  const result = db.prepare('INSERT INTO message_templates (name, body, sort_order) VALUES (?, ?, ?)')
    .run(data.name, data.body, next.next)
  return { id: result.lastInsertRowid, ...data, sort_order: next.next }
}

export function updateMessageTemplate(id: number, data: { name: string; body: string }) {
  db.prepare('UPDATE message_templates SET name = ?, body = ? WHERE id = ?').run(data.name, data.body, id)
  return { id, ...data }
}

export function deleteMessageTemplate(id: number) {
  db.prepare('DELETE FROM message_templates WHERE id = ?').run(id)
}

export function resetMessageTemplates() {
  const insert = db.prepare('INSERT INTO message_templates (name, body, sort_order) VALUES (?, ?, ?)')
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM message_templates').run()
    DEFAULT_MESSAGE_TEMPLATES.forEach((template, index) => insert.run(template.name, template.body, index))
  })
  transaction()
  return getMessageTemplates()
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

// --- Auth: papéis e usuários ---

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, useSalt, 64).toString('hex')
  return { hash, salt: useSalt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const attempt = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected)
}

interface RoleRow {
  id: number
  name: string
  permissions: string
  is_system: number
}

function parseRole(row: RoleRow) {
  return { ...row, permissions: JSON.parse(row.permissions) as string[] }
}

// O papel de sistema sempre tem todos os recursos; os demais nunca podem ter os
// recursos exclusivos de admin, mesmo que o payload tente forçar.
function sanitizePermissions(permissions: string[], isSystem: boolean): string[] {
  if (isSystem) return [...ALL_RESOURCE_KEYS]
  const admin = ADMIN_ONLY_RESOURCE_KEYS as readonly string[]
  return permissions.filter(p => (ASSIGNABLE_RESOURCE_KEYS as readonly string[]).includes(p) && !admin.includes(p))
}

// Migração: bancos criados antes de dashboard/backdated existirem guardam um JSON
// de permissões desatualizado no papel Admin.
function syncRolePermissions() {
  const rows = db.prepare('SELECT * FROM roles').all() as RoleRow[]
  const update = db.prepare('UPDATE roles SET permissions = ? WHERE id = ?')
  for (const row of rows) {
    const current = JSON.parse(row.permissions) as string[]
    const next = sanitizePermissions(current, row.is_system === 1)
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      update.run(JSON.stringify(next), row.id)
    }
  }
}

export function getAllRoles() {
  const rows = db.prepare('SELECT * FROM roles ORDER BY name').all() as RoleRow[]
  return rows.map(parseRole)
}

export function getRoleById(id: number) {
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as RoleRow | undefined
  return row ? parseRole(row) : undefined
}

export function createRole(data: { name: string; permissions: string[]; is_system?: boolean }) {
  const permissions = sanitizePermissions(data.permissions, data.is_system ?? false)
  const result = db.prepare('INSERT INTO roles (name, permissions, is_system) VALUES (?, ?, ?)')
    .run(data.name, JSON.stringify(permissions), data.is_system ? 1 : 0)
  return { id: result.lastInsertRowid, name: data.name, permissions, is_system: data.is_system ?? false }
}

export function updateRole(id: number, data: { name: string; permissions: string[] }) {
  const role = getRoleById(id)
  if (!role) throw new Error('Papel não encontrado.')
  if (role.is_system) throw new Error('O papel Admin não pode ser editado.')
  const permissions = sanitizePermissions(data.permissions, false)
  db.prepare('UPDATE roles SET name = ?, permissions = ? WHERE id = ?')
    .run(data.name, JSON.stringify(permissions), id)
  return { id, name: data.name, permissions }
}

export function deleteRole(id: number) {
  const role = getRoleById(id)
  if (!role) return
  if (role.is_system) throw new Error('O papel Admin não pode ser excluído.')
  const usage = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(id) as { count: number }
  if (usage.count > 0) throw new Error('Existem usuários com esse papel. Troque o papel deles antes de excluir.')
  db.prepare('DELETE FROM roles WHERE id = ?').run(id)
}

interface UserRow {
  id: number
  username: string
  password_hash: string
  password_salt: string
  role_id: number
  active: number
  created_at: string
}

export function getAllUsers() {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.role_id, u.active, u.created_at, r.name as role_name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    ORDER BY u.username
  `).all()
  return rows
}

export function getUserByUsername(username: string) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
}

export function getUserById(id: number) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function countActiveUsersByRole(roleId: number) {
  const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ? AND active = 1').get(roleId) as { count: number }
  return row.count
}

export function createUser(data: { username: string; password: string; role_id: number; active?: number }) {
  const { hash, salt } = hashPassword(data.password)
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, password_salt, role_id, active) VALUES (?, ?, ?, ?, ?)'
  ).run(data.username, hash, salt, data.role_id, data.active ?? 1)
  return { id: result.lastInsertRowid, username: data.username, role_id: data.role_id, active: data.active ?? 1 }
}

export function updateUser(
  id: number,
  data: { username: string; role_id: number; active?: number; password?: string }
) {
  if (data.password) {
    const { hash, salt } = hashPassword(data.password)
    db.prepare('UPDATE users SET username = ?, role_id = ?, active = ?, password_hash = ?, password_salt = ? WHERE id = ?')
      .run(data.username, data.role_id, data.active ?? 1, hash, salt, id)
  } else {
    db.prepare('UPDATE users SET username = ?, role_id = ?, active = ? WHERE id = ?')
      .run(data.username, data.role_id, data.active ?? 1, id)
  }
  return { id, ...data }
}

export function setUserPassword(id: number, newPassword: string) {
  const { hash, salt } = hashPassword(newPassword)
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id)
}

export function deleteUser(id: number) {
  const user = getUserById(id)
  if (!user) return
  const role = getRoleById(user.role_id)
  if (role?.is_system && countActiveUsersByRole(role.id) <= 1) {
    throw new Error('Não é possível excluir o único usuário Admin restante.')
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}
