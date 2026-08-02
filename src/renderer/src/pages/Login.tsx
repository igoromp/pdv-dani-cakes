import { useState } from 'react'
import { CurrentUser } from '../types'
import LogoMark from '../components/LogoMark'

interface Props {
  onSuccess: (user: CurrentUser) => void
}

export default function Login({ onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await window.api.auth.login(username.trim(), password)
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Usuário ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex flex-1 min-w-0 h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-rose-700 via-rose-600 to-amber-500">
      <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 bg-white rounded-3xl shadow-2xl w-[23rem] overflow-hidden"
      >
        <div className="px-8 pt-8 pb-6 text-center">
          <LogoMark className="mx-auto w-28 h-28 mb-2" aria-hidden="true" />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">PDV Dani Cakes</h1>
          <p className="text-sm text-gray-500 mt-1">Entre para abrir o caixa</p>
        </div>

        <div className="px-8 pb-8 space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-1.5">
              Usuário
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Senha
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
