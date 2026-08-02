import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as db from '../../src/main/database'

let seededAdminPassword: string

beforeAll(() => {
  const { adminCredentials } = db.initDb()
  seededAdminPassword = adminCredentials!.password
})

afterAll(() => {
  db.closeDb()
})

describe('inicialização', () => {
  it('semeia categorias padrão e um usuário Admin com senha aleatória', () => {
    const categories = db.getAllCategories() as Array<{ name: string }>
    expect(categories.map(c => c.name)).toContain('Bolos')

    const admin = db.getUserByUsername('0001')
    expect(admin).toBeDefined()
    expect(seededAdminPassword).toHaveLength(10)
    expect(db.verifyPassword(seededAdminPassword, admin!.password_hash, admin!.password_salt)).toBe(true)
    expect(db.verifyPassword('102030', admin!.password_hash, admin!.password_salt)).toBe(false)
  })

  it('não gera credenciais numa segunda chamada de initDb (banco já semeado)', () => {
    const result = db.initDb()
    expect(result.adminCredentials).toBeUndefined()
  })
})

describe('produtos', () => {
  it('cria, atualiza e exclui (soft delete) um produto', () => {
    const created = db.createProduct({ name: 'Bolo de cenoura', price: 45 })
    expect(created.id).toBeDefined()

    db.updateProduct(created.id as number, { name: 'Bolo de cenoura', price: 50 })
    const afterUpdate = (db.getAllProducts() as Array<{ id: number; price: number }>).find(
      p => p.id === created.id
    )
    expect(afterUpdate?.price).toBe(50)

    db.deleteProduct(created.id as number)
    const afterDelete = (db.getAllProducts() as Array<{ id: number; active: number }>).find(
      p => p.id === created.id
    )
    expect(afterDelete?.active).toBe(0)
  })
})

describe('vendas e cancelamento', () => {
  it('cria uma venda e calcula o total corretamente', () => {
    const sale = db.createSale({
      total: 30,
      items: [{ product_name: 'Fatia de bolo', unit_price: 10, quantity: 3, subtotal: 30 }],
      payments: [{ method: 'cash', amount: 30, received: 30 }]
    })
    expect(sale.id).toBeDefined()

    const items = db.getSaleItems(sale.id as number) as Array<{ remaining_quantity: number }>
    expect(items).toHaveLength(1)
    expect(items[0].remaining_quantity).toBe(3)
  })

  it('cancelamento parcial reduz a quantidade restante sem passar de zero', () => {
    const sale = db.createSale({
      total: 20,
      items: [{ product_name: 'Torta de limão', unit_price: 20, quantity: 2, subtotal: 40 }],
      payments: [{ method: 'cash', amount: 40 }]
    })
    const [item] = db.getSaleItems(sale.id as number) as Array<{ id: number }>

    db.cancelSaleItems(sale.id as number, {
      items: [{ sale_item_id: item.id, quantity: 1 }],
      method: 'cash'
    })
    expect(db.getRemainingQuantity(item.id)).toBe(1)

    // Tentar cancelar mais do que resta não deve deixar a quantidade negativa.
    db.cancelSaleItems(sale.id as number, {
      items: [{ sale_item_id: item.id, quantity: 5 }],
      method: 'cash'
    })
    expect(db.getRemainingQuantity(item.id)).toBe(0)
  })

  it('normalizeSaleTimestamp aceita datas passadas e rejeita futuro/formato inválido', () => {
    expect(db.normalizeSaleTimestamp('2024-01-15T10:30')).toBe('2024-01-15 10:30:00')
    expect(() => db.normalizeSaleTimestamp('não é uma data')).toThrow()
    expect(() => db.normalizeSaleTimestamp('2999-01-01T10:00')).toThrow(/futuro/)
  })
})

describe('despesas', () => {
  it('valida descrição e valor ao criar', () => {
    expect(() => db.createExpense({ description: '', amount: 10, incurred_on: '2024-01-01' })).toThrow(
      /descrição/
    )
    expect(() =>
      db.createExpense({ description: 'Aluguel', amount: 0, incurred_on: '2024-01-01' })
    ).toThrow(/valor/)
  })

  it('deriva o status a partir de paid_on/due_on', () => {
    const paid = db.createExpense({
      description: 'Insumos pagos',
      amount: 100,
      incurred_on: '2024-01-05',
      paid_on: '2024-01-06',
      payment_method: 'pix'
    }) as { id: number; status: string }
    expect(paid.status).toBe('paid')

    const overdue = db.createExpense({
      description: 'Conta vencida',
      amount: 50,
      incurred_on: '2024-01-01',
      due_on: '2024-01-02'
    }) as { id: number; status: string }
    expect(overdue.status).toBe('overdue')
  })

  it('setExpensePaid e reopenExpense alternam o status', () => {
    const expense = db.createExpense({
      description: 'Energia',
      amount: 200,
      incurred_on: '2024-02-01',
      due_on: '2024-02-10'
    }) as { id: number }

    const paid = db.setExpensePaid(expense.id, { paid_on: '2024-02-05', payment_method: 'pix' }) as {
      status: string
      paid_on: string
    }
    expect(paid.status).toBe('paid')
    expect(paid.paid_on).toBe('2024-02-05')

    const reopened = db.reopenExpense(expense.id) as { status: string; paid_on: string | null }
    expect(reopened.status).toBe('overdue')
    expect(reopened.paid_on).toBeNull()
  })
})

describe('despesas recorrentes', () => {
  function currentMonthIso(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  it('gera uma despesa para o mês atual e é idempotente ao rodar de novo', () => {
    const month = currentMonthIso()
    const recurring = db.createRecurringExpense({
      description: 'Aluguel do ateliê',
      amount: 1200,
      due_day: 10,
      start_month: month
    }) as { id: number; generated: number }

    expect(recurring.generated).toBe(1)

    const generatedAgain = db.generateRecurringExpenses()
    expect(generatedAgain).toBe(0)

    // Regime de caixa (padrão) só mostra despesas pagas — a gerada pela
    // recorrência ainda está em aberto, então precisa do regime de competência.
    const expenses = db.getExpenses({ from: `${month}-01`, to: `${month}-28`, basis: 'accrual' }) as Array<{
      recurring_id: number | null
    }>
    expect(expenses.filter(e => e.recurring_id === recurring.id)).toHaveLength(1)
  })
})

describe('papéis e permissões', () => {
  it('papel de sistema sempre recebe todos os recursos, mesmo que o payload não peça', () => {
    const role = db.createRole({ name: `Sistema ${Date.now()}`, permissions: [], is_system: true })
    expect(role.permissions).toEqual(expect.arrayContaining([...db.ALL_RESOURCE_KEYS]))
  })

  it('papel comum nunca recebe recursos exclusivos de admin', () => {
    const role = db.createRole({
      name: `Caixa ${Date.now()}`,
      permissions: [...db.ASSIGNABLE_RESOURCE_KEYS, 'dashboard', 'backdated'] as never
    })
    expect(role.permissions).not.toContain('dashboard')
    expect(role.permissions).not.toContain('backdated')
    expect(role.permissions).toEqual(expect.arrayContaining([...db.ASSIGNABLE_RESOURCE_KEYS]))
  })

  it('não deixa excluir o papel Admin nem um papel em uso', () => {
    const roles = db.getAllRoles() as Array<{ id: number; is_system: boolean }>
    const admin = roles.find(r => r.is_system)!
    expect(() => db.deleteRole(admin.id)).toThrow(/Admin/)

    const role = db.createRole({ name: `Em uso ${Date.now()}`, permissions: [] })
    db.createUser({ username: `user-${Date.now()}`, password: '123456', role_id: role.id as number })
    expect(() => db.deleteRole(role.id as number)).toThrow(/papel/)
  })
})

describe('usuários', () => {
  it('não permite excluir o único usuário Admin restante', () => {
    const roles = db.getAllRoles() as Array<{ id: number; is_system: boolean }>
    const admin = roles.find(r => r.is_system)!
    expect(db.countActiveUsersByRole(admin.id)).toBeGreaterThanOrEqual(1)

    const onlyAdmin = (db.getAllUsers() as Array<{ id: number; role_id: number }>).find(
      u => u.role_id === admin.id
    )!
    if (db.countActiveUsersByRole(admin.id) === 1) {
      expect(() => db.deleteUser(onlyAdmin.id)).toThrow(/único usuário Admin/)
    }
  })

  it('hashPassword/verifyPassword: senha certa autentica, errada não', () => {
    const { hash, salt } = db.hashPassword('minha-senha-forte')
    expect(db.verifyPassword('minha-senha-forte', hash, salt)).toBe(true)
    expect(db.verifyPassword('senha-errada', hash, salt)).toBe(false)
  })
})
