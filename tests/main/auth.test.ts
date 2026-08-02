import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as db from '../../src/main/database'
import * as auth from '../../src/main/auth'

let adminPassword: string

beforeAll(() => {
  const { adminCredentials } = db.initDb()
  adminPassword = adminCredentials!.password
})

afterAll(() => {
  db.closeDb()
})

describe('login/logout', () => {
  it('autentica o Admin semeado e recusa senha errada', () => {
    expect(() => auth.login('0001', 'senha-errada')).toThrow(/inválidos/)

    const user = auth.login('0001', adminPassword)
    expect(user?.username).toBe('0001')
    expect(user?.role.is_system).toBeTruthy()
    expect(auth.getCurrentUser()?.username).toBe('0001')

    auth.logout()
    expect(auth.getCurrentUser()).toBeNull()
  })

  it('recusa usuário inativo', () => {
    const role = db.createRole({ name: `Inativo ${Date.now()}`, permissions: ['pos'] })
    const created = db.createUser({
      username: `inativo-${Date.now()}`,
      password: '123456',
      role_id: role.id as number,
      active: 0
    })
    expect(() => auth.login(created.username, '123456')).toThrow(/inválidos/)
  })
})

describe('controle de acesso', () => {
  it('requireCurrentUser exige sessão ativa', () => {
    auth.logout()
    expect(() => auth.requireCurrentUser()).toThrow(/Sessão expirada/)
    auth.login('0001', adminPassword)
    expect(auth.requireCurrentUser().username).toBe('0001')
  })

  it('requireAdmin só passa para papel de sistema', () => {
    const role = db.createRole({ name: `Caixa ${Date.now()}`, permissions: ['pos'] })
    const created = db.createUser({
      username: `caixa-${Date.now()}`,
      password: '123456',
      role_id: role.id as number
    })

    auth.login(created.username, '123456')
    expect(() => auth.requireAdmin()).toThrow(/Admin/)

    auth.login('0001', adminPassword)
    expect(() => auth.requireAdmin()).not.toThrow()
  })
})

describe('troca de senha', () => {
  it('exige a senha atual correta e passa a aceitar a nova', () => {
    const role = db.createRole({ name: `Conta ${Date.now()}`, permissions: ['pos'] })
    const created = db.createUser({
      username: `conta-${Date.now()}`,
      password: 'senha-antiga',
      role_id: role.id as number
    })

    auth.login(created.username, 'senha-antiga')
    expect(() => auth.changeOwnPassword('senha-errada', 'senha-nova')).toThrow(/incorreta/)

    auth.changeOwnPassword('senha-antiga', 'senha-nova')
    auth.logout()

    expect(() => auth.login(created.username, 'senha-antiga')).toThrow(/inválidos/)
    expect(auth.login(created.username, 'senha-nova')?.username).toBe(created.username)
  })
})
