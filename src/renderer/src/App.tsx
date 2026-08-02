import { useEffect, useState, useCallback } from 'react'
import POS from './pages/POS'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import History from './pages/History'
import Menu from './pages/Menu'
import Scheduling from './pages/Scheduling'
import Finance from './pages/Finance'
import Users from './pages/Users'
import Login from './pages/Login'
import { CurrentUser, ResourceKey } from './types'
import LogoMark from './components/LogoMark'
import UpdateBanner from './components/UpdateBanner'
import {
  CartIcon,
  PackageIcon,
  ChartIcon,
  ClipboardListIcon,
  CalendarIcon,
  UserIcon,
  BellIcon,
  LogOutIcon,
  DashboardIcon,
  CalendarPlusIcon,
  WalletIcon
} from './components/icons'
import type { ComponentType, SVGProps } from 'react'

type Page =
  | 'dashboard' | 'pos' | 'backdated' | 'products' | 'history' | 'menu' | 'scheduling' | 'finance' | 'users'

const NAV: Array<{ id: Page; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; resource: ResourceKey }> = [
  { id: 'dashboard', label: 'Painel', icon: DashboardIcon, resource: 'dashboard' },
  { id: 'pos', label: 'PDV', icon: CartIcon, resource: 'pos' },
  { id: 'backdated', label: 'Retroativo', icon: CalendarPlusIcon, resource: 'backdated' },
  { id: 'products', label: 'Produtos', icon: PackageIcon, resource: 'products' },
  { id: 'history', label: 'Histórico', icon: ChartIcon, resource: 'history' },
  { id: 'menu', label: 'Cardápio', icon: ClipboardListIcon, resource: 'menu' },
  { id: 'scheduling', label: 'Agenda', icon: CalendarIcon, resource: 'scheduling' },
  { id: 'finance', label: 'Financeiro', icon: WalletIcon, resource: 'finance' },
  { id: 'users', label: 'Usuários', icon: UserIcon, resource: 'users' }
]

// Papéis sem acesso ao PDV caem na primeira tela que puderem abrir.
function firstAllowedPage(user: CurrentUser): Page {
  return NAV.find(item => user.role.permissions.includes(item.resource))?.id ?? 'pos'
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null | undefined>(undefined)
  const [page, setPage] = useState<Page>('pos')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    window.api.auth.me().then(user => {
      setCurrentUser(user)
      if (user) setPage(firstAllowedPage(user))
    })
  }, [])

  const loadPendingCount = useCallback(async () => {
    if (!currentUser) return
    const pending = await window.api.appointments.pendingReminders()
    setPendingCount(pending.length)
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    loadPendingCount()
    const interval = setInterval(loadPendingCount, 30 * 1000)
    return () => clearInterval(interval)
  }, [currentUser, loadPendingCount])

  if (currentUser === undefined) {
    return (
      <>
        <div className="h-screen bg-gray-50" />
        <UpdateBanner />
      </>
    )
  }

  if (currentUser === null) {
    return (
      <>
        <Login onSuccess={user => { setCurrentUser(user); setPage(firstAllowedPage(user)) }} />
        <UpdateBanner />
      </>
    )
  }

  const handleLogout = async () => {
    await window.api.auth.logout()
    setCurrentUser(null)
  }

  const allowedNav = NAV.filter(item => currentUser.role.permissions.includes(item.resource))

  return (
    <div className="flex flex-1 min-w-0 h-screen bg-gray-50">
      <UpdateBanner />
      <nav className="w-20 bg-rose-700 flex flex-col items-center py-4 gap-2 shrink-0" aria-label="Navegação principal">
        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center mb-4 shrink-0" aria-hidden="true">
          <LogoMark className="w-9 h-9" />
        </div>
        {allowedNav.map(item => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer
                ${active ? 'bg-white text-rose-700 shadow-sm' : 'text-rose-100 hover:bg-rose-600'}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end gap-3 px-4 shrink-0">
          {currentUser.role.permissions.includes('scheduling') && (
            <button
              onClick={() => setPage('scheduling')}
              className="relative w-11 h-11 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 cursor-pointer"
              aria-label={pendingCount > 0 ? `Agendamentos pendentes: ${pendingCount}` : 'Agendamentos pendentes'}
              title="Agendamentos pendentes"
            >
              <BellIcon className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
          <div className="text-sm text-gray-600">
            {currentUser.username} <span className="text-gray-400">({currentUser.role.name})</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-medium cursor-pointer"
          >
            <LogOutIcon className="w-4 h-4" />
            Sair
          </button>
        </header>

        <div className="flex-1 overflow-hidden">
          {page === 'dashboard' && <Dashboard />}
          {page === 'pos' && <POS />}
          {page === 'backdated' && <POS backdated />}
          {page === 'products' && <Products />}
          {page === 'history' && <History />}
          {page === 'menu' && <Menu />}
          {page === 'scheduling' && <Scheduling currentUser={currentUser} onAcknowledge={loadPendingCount} />}
          {page === 'finance' && <Finance />}
          {page === 'users' && <Users currentUser={currentUser} />}
        </div>
      </main>
    </div>
  )
}
