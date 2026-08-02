import { useEffect, useState } from 'react'
import { CurrentUser, UserListItem, Role, ResourceKey, RESOURCE_LABELS, ASSIGNABLE_RESOURCE_KEYS } from '../types'
import { CloseIcon } from '../components/icons'

interface Props {
  currentUser: CurrentUser
}

interface UserForm {
  username: string
  password: string
  role_id: string
  active: boolean
}

const EMPTY_USER_FORM: UserForm = { username: '', password: '', role_id: '', active: true }

interface RoleForm {
  name: string
  permissions: ResourceKey[]
}

const EMPTY_ROLE_FORM: RoleForm = { name: '', permissions: [] }

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

const EMPTY_POINT_FORM = { enabled: false, webhookUrl: '', deviceId: '', apiToken: '' }

export default function Users({ currentUser }: Props) {
  const [tab, setTab] = useState<'users' | 'roles' | 'account' | 'backup' | 'point'>('users')
  const [users, setUsers] = useState<UserListItem[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  const [pointForm, setPointForm] = useState(EMPTY_POINT_FORM)
  const [pointHasToken, setPointHasToken] = useState(false)
  const [pointBusy, setPointBusy] = useState(false)
  const [pointMessage, setPointMessage] = useState('')
  const [pointError, setPointError] = useState('')

  const [backups, setBackups] = useState<Array<{ name: string; size: number; created_at: string }>>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupError, setBackupError] = useState('')

  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER_FORM)
  const [userError, setUserError] = useState('')

  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE_FORM)
  const [roleError, setRoleError] = useState('')

  const [accountForm, setAccountForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [accountError, setAccountError] = useState('')
  const [accountSuccess, setAccountSuccess] = useState('')

  const load = async () => {
    const [usersData, rolesData] = await Promise.all([window.api.users.list(), window.api.roles.list()])
    setUsers(usersData)
    setRoles(rolesData)
  }

  useEffect(() => { load() }, [])

  const loadBackups = async () => {
    setBackups(await window.api.backup.list())
  }

  useEffect(() => {
    if (tab === 'backup' && currentUser.role.is_system) loadBackups()
  }, [tab, currentUser.role.is_system])

  useEffect(() => {
    if (tab !== 'point' || !currentUser.role.is_system) return
    window.api.point
      .getConfig()
      .then(config => {
        // apiToken entra vazio de propósito: o token gravado nunca sai do main.
        // Deixar em branco ao salvar mantém o que já está lá.
        setPointForm({
          enabled: config.enabled,
          webhookUrl: config.webhookUrl,
          deviceId: config.deviceId,
          apiToken: ''
        })
        setPointHasToken(config.hasToken)
      })
      .catch(err => setPointError(err instanceof Error ? err.message : 'Erro ao carregar a configuração.'))
  }, [tab, currentUser.role.is_system])

  const handleSavePoint = async (e: React.FormEvent) => {
    e.preventDefault()
    setPointBusy(true)
    setPointError('')
    setPointMessage('')
    try {
      const saved = await window.api.point.saveConfig({
        enabled: pointForm.enabled,
        webhookUrl: pointForm.webhookUrl,
        deviceId: pointForm.deviceId,
        apiToken: pointForm.apiToken || undefined
      })
      setPointHasToken(saved.hasToken)
      setPointForm(f => ({ ...f, apiToken: '' }))
      setPointMessage(
        saved.enabled
          ? 'Configuração salva. A cobrança pela maquininha está ativa.'
          : 'Configuração salva. A cobrança pela maquininha está desativada.'
      )
    } catch (err) {
      setPointError(err instanceof Error ? err.message : 'Erro ao salvar a configuração.')
    } finally {
      setPointBusy(false)
    }
  }

  // Testa o que já está gravado, não o que está na tela: evita um "conexão ok"
  // enganoso com valores que ainda não foram salvos.
  const handleTestPoint = async () => {
    setPointBusy(true)
    setPointError('')
    setPointMessage('')
    try {
      await window.api.point.test()
      setPointMessage('Conexão com o servidor funcionando.')
    } catch (err) {
      setPointError(err instanceof Error ? err.message : 'Falha ao conectar no servidor.')
    } finally {
      setPointBusy(false)
    }
  }

  const handleCreateBackup = async () => {
    setBackupBusy(true)
    setBackupError('')
    setBackupMessage('')
    try {
      const savedPath = await window.api.backup.create()
      if (savedPath) {
        setBackupMessage(`Backup salvo em: ${savedPath}`)
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Erro ao criar backup.')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleRestoreBackup = async () => {
    setBackupError('')
    setBackupMessage('')
    try {
      await window.api.backup.restore()
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Erro ao restaurar backup.')
    }
  }

  const openNewUser = () => {
    setEditingUserId(null)
    setUserForm({ ...EMPTY_USER_FORM, role_id: roles[0] ? String(roles[0].id) : '' })
    setUserError('')
    setShowUserForm(true)
  }

  const openEditUser = (u: UserListItem) => {
    setEditingUserId(u.id)
    setUserForm({ username: u.username, password: '', role_id: String(u.role_id), active: u.active === 1 })
    setUserError('')
    setShowUserForm(true)
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError('')
    try {
      if (editingUserId !== null) {
        await window.api.users.update(editingUserId, {
          username: userForm.username.trim(),
          role_id: parseInt(userForm.role_id, 10),
          active: userForm.active ? 1 : 0,
          password: userForm.password || undefined
        })
      } else {
        if (!userForm.password) {
          setUserError('Informe uma senha.')
          return
        }
        await window.api.users.create({
          username: userForm.username.trim(),
          password: userForm.password,
          role_id: parseInt(userForm.role_id, 10)
        })
      }
      setShowUserForm(false)
      load()
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Erro ao salvar usuário.')
    }
  }

  const handleDeleteUser = async (u: UserListItem) => {
    if (!window.confirm(`Excluir o usuário "${u.username}"?`)) return
    try {
      await window.api.users.delete(u.id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir usuário.')
    }
  }

  const openNewRole = () => {
    setEditingRoleId(null)
    setRoleForm(EMPTY_ROLE_FORM)
    setRoleError('')
    setShowRoleForm(true)
  }

  const openEditRole = (r: Role) => {
    setEditingRoleId(r.id)
    setRoleForm({ name: r.name, permissions: r.permissions })
    setRoleError('')
    setShowRoleForm(true)
  }

  const toggleRolePermission = (key: ResourceKey) => {
    setRoleForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key]
    }))
  }

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRoleError('')
    try {
      const data = { name: roleForm.name.trim(), permissions: roleForm.permissions }
      if (editingRoleId !== null) {
        await window.api.roles.update(editingRoleId, data)
      } else {
        await window.api.roles.create(data)
      }
      setShowRoleForm(false)
      load()
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Erro ao salvar papel.')
    }
  }

  const handleDeleteRole = async (r: Role) => {
    if (!window.confirm(`Excluir o papel "${r.name}"?`)) return
    try {
      await window.api.roles.delete(r.id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir papel.')
    }
  }

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAccountError('')
    setAccountSuccess('')
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      setAccountError('A confirmação não bate com a nova senha.')
      return
    }
    try {
      await window.api.auth.changePassword(accountForm.currentPassword, accountForm.newPassword)
      setAccountSuccess('Senha alterada com sucesso.')
      setAccountForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Erro ao trocar senha.')
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-800 mr-4">Usuários</h1>
          {(['users', 'roles', 'account', ...(currentUser.role.is_system ? (['backup', 'point'] as const) : [])] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`px-4 py-2 min-h-[40px] rounded-full text-sm font-medium transition-colors cursor-pointer
                ${tab === t ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t === 'users'
                ? 'Usuários'
                : t === 'roles'
                  ? 'Papéis'
                  : t === 'account'
                    ? 'Minha conta'
                    : t === 'backup'
                      ? 'Backup'
                      : 'Maquininha'}
            </button>
          ))}
          {tab === 'users' && (
            <button onClick={openNewUser} className="ml-auto px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
              + Novo Usuário
            </button>
          )}
          {tab === 'roles' && (
            <button onClick={openNewRole} className="ml-auto px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
              + Novo Papel
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'users' && (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usuário</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Papel</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-3 text-sm font-medium text-gray-800">{u.username}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{u.role_name}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEditUser(u)} className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium mr-1 px-2.5 py-2 rounded-lg cursor-pointer">Editar</button>
                      {u.id !== currentUser.id && (
                        <button onClick={() => handleDeleteUser(u)} className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer">Excluir</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'roles' && (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Papel</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Telas permitidas</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {roles.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-800">
                      {r.name}
                      {r.is_system && <span className="ml-2 text-xs text-gray-400">(sistema)</span>}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {r.permissions.map(p => RESOURCE_LABELS[p]).join(', ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {!r.is_system && (
                        <>
                          <button onClick={() => openEditRole(r)} className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium mr-1 px-2.5 py-2 rounded-lg cursor-pointer">Editar</button>
                          <button onClick={() => handleDeleteRole(r)} className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer">Excluir</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'account' && (
            <form onSubmit={handleAccountSubmit} className="max-w-sm mx-auto mt-8 p-6 bg-white border border-gray-200 rounded-xl space-y-4">
              <h2 className="font-semibold text-gray-800">Trocar minha senha</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                <input
                  type="password" required
                  value={accountForm.currentPassword}
                  onChange={e => setAccountForm(f => ({ ...f, currentPassword: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input
                  type="password" required
                  value={accountForm.newPassword}
                  onChange={e => setAccountForm(f => ({ ...f, newPassword: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  type="password" required
                  value={accountForm.confirmPassword}
                  onChange={e => setAccountForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              {accountError && <p className="text-sm text-red-600">{accountError}</p>}
              {accountSuccess && <p className="text-sm text-green-600">{accountSuccess}</p>}
              <button type="submit" className="w-full py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
                Salvar nova senha
              </button>
            </form>
          )}

          {tab === 'backup' && currentUser.role.is_system && (
            <div className="max-w-2xl mx-auto mt-8 space-y-6 pb-8">
              <div className="p-6 bg-white border border-gray-200 rounded-xl">
                <h2 className="font-semibold text-gray-800 mb-1">Backup manual</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Salva uma cópia completa do banco de dados agora, no local que você escolher
                  (recomendado: pen-drive ou pasta sincronizada na nuvem).
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCreateBackup}
                    disabled={backupBusy}
                    className="px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    {backupBusy ? 'Salvando...' : 'Fazer backup agora'}
                  </button>
                  <button
                    onClick={handleRestoreBackup}
                    className="px-4 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    Restaurar backup...
                  </button>
                </div>
                {backupMessage && <p className="text-sm text-green-600 mt-3 break-all">{backupMessage}</p>}
                {backupError && <p className="text-sm text-red-600 mt-3">{backupError}</p>}
              </div>

              <div className="p-6 bg-white border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-gray-800">Backups automáticos</h2>
                  <button
                    onClick={() => window.api.backup.openFolder()}
                    className="text-sm text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                  >
                    Abrir pasta
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Uma cópia é feita sozinha no primeiro uso do dia (mantém as últimas 15). Fica no
                  computador — não substitui um backup manual guardado em outro lugar.
                </p>
                {backups.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum backup automático ainda.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {backups.map(b => (
                        <tr key={b.name}>
                          <td className="py-2 text-gray-700">{b.name}</td>
                          <td className="py-2 text-gray-500 text-right">{formatSize(b.size)}</td>
                          <td className="py-2 text-gray-500 text-right pl-4">{formatDateTime(b.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'point' && currentUser.role.is_system && (
            <form onSubmit={handleSavePoint} className="max-w-2xl mx-auto mt-8 space-y-6 pb-8">
              <div className="p-6 bg-white border border-gray-200 rounded-xl space-y-4">
                <div>
                  <h2 className="font-semibold text-gray-800">Cobrança pela maquininha</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Envia o valor da venda direto para a maquininha Mercado Pago Point, sem digitar
                    à mão. Depende de internet e do servidor de integração publicado.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer min-h-[44px] p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={pointForm.enabled}
                    onChange={e => setPointForm(f => ({ ...f, enabled: e.target.checked }))}
                    className="w-5 h-5 rounded"
                  />
                  <span>
                    <span className="text-sm font-medium text-gray-800 block">
                      Ativar cobrança pela maquininha
                    </span>
                    <span className="text-xs text-gray-500">
                      Desativado, o PDV segue funcionando normalmente: o cartão é registrado à mão,
                      como sempre foi.
                    </span>
                  </span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL do servidor de integração
                  </label>
                  <input
                    type="url"
                    placeholder="https://webhook.seudominio.com.br"
                    value={pointForm.webhookUrl}
                    onChange={e => setPointForm(f => ({ ...f, webhookUrl: e.target.value }))}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Endereço do projeto dani-cakes-webhook. Precisa ser https.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID da maquininha (device_id)
                  </label>
                  <input
                    type="text"
                    placeholder="PAX_A910__SMARTPOS1234567890"
                    value={pointForm.deviceId}
                    onChange={e => setPointForm(f => ({ ...f, deviceId: e.target.value }))}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    A maquininha precisa estar no modo PDV para aceitar cobranças pela integração.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Token de acesso ao servidor
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={pointHasToken ? '•••••••• (deixe em branco para manter)' : 'Cole o token aqui'}
                    value={pointForm.apiToken}
                    onChange={e => setPointForm(f => ({ ...f, apiToken: e.target.value }))}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    O mesmo valor de PDV_API_TOKEN configurado no servidor. Por segurança, ele nunca
                    é exibido de volta aqui.
                  </p>
                </div>

                {pointMessage && <p className="text-sm text-green-600">{pointMessage}</p>}
                {pointError && <p className="text-sm text-red-600">{pointError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTestPoint}
                    disabled={pointBusy}
                    className="px-4 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                  >
                    Testar conexão
                  </button>
                  <button
                    type="submit"
                    disabled={pointBusy}
                    className="px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    {pointBusy ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {showUserForm && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingUserId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
            <button
              onClick={() => setShowUserForm(false)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleUserSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuário *</label>
              <input
                type="text" required autoFocus
                value={userForm.username}
                onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {editingUserId ? 'Nova senha (deixe em branco p/ manter)' : 'Senha *'}
              </label>
              <input
                type="password"
                required={editingUserId === null}
                value={userForm.password}
                onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Papel *</label>
              <select
                required
                value={userForm.role_id}
                onChange={e => setUserForm(f => ({ ...f, role_id: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Selecione...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {editingUserId !== null && (
              <label className="flex items-center gap-2 cursor-pointer min-h-[40px] -ml-1 px-1 rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={userForm.active}
                  onChange={e => setUserForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Usuário ativo</span>
              </label>
            )}
            {userError && <p className="text-sm text-red-600">{userError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowUserForm(false)} className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {showRoleForm && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingRoleId ? 'Editar Papel' : 'Novo Papel'}</h2>
            <button
              onClick={() => setShowRoleForm(false)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleRoleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do papel *</label>
              <input
                type="text" required autoFocus
                value={roleForm.name}
                onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Telas permitidas</label>
              <p className="text-xs text-gray-500 mb-2">
                Painel e Lançamento retroativo são exclusivos do papel Admin e não podem ser concedidos aqui.
              </p>
              <div className="space-y-2">
                {ASSIGNABLE_RESOURCE_KEYS.map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer min-h-[40px] -ml-1 px-1 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.includes(key)}
                      onChange={() => toggleRolePermission(key)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">{RESOURCE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>
            {roleError && <p className="text-sm text-red-600">{roleError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowRoleForm(false)} className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
