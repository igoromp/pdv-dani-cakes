import * as db from './database'

let currentUserId: number | null = null

function toPublicUser(userId: number) {
  const user = db.getUserById(userId)
  if (!user) return null
  const role = db.getRoleById(user.role_id)
  return {
    id: user.id,
    username: user.username,
    active: user.active,
    role: role ?? { id: user.role_id, name: 'Desconhecido', permissions: [], is_system: false }
  }
}

export function login(username: string, password: string) {
  const user = db.getUserByUsername(username)
  if (!user || !user.active) {
    throw new Error('Usuário ou senha inválidos.')
  }
  if (!db.verifyPassword(password, user.password_hash, user.password_salt)) {
    throw new Error('Usuário ou senha inválidos.')
  }
  currentUserId = user.id
  return toPublicUser(user.id)
}

export function logout() {
  currentUserId = null
}

export function getCurrentUser() {
  if (currentUserId == null) return null
  const user = toPublicUser(currentUserId)
  if (!user || !user.active) {
    currentUserId = null
    return null
  }
  return user
}

export function requireCurrentUser() {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Faça login novamente.')
  return user
}

// Recursos exclusivos do Admin (dashboard, lançamento retroativo) passam por aqui:
// o papel de sistema é o único que os enxerga.
export function requireAdmin() {
  const user = requireCurrentUser()
  if (!user.role.is_system) {
    throw new Error('Acesso restrito ao papel Admin.')
  }
  return user
}

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  const session = requireCurrentUser()
  const user = db.getUserById(session.id)
  if (!user || !db.verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
    throw new Error('Senha atual incorreta.')
  }
  db.setUserPassword(session.id, newPassword)
}
