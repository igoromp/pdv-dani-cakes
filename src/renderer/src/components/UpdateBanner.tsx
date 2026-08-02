import { useEffect, useState } from 'react'
import { UpdaterStatus } from '../types'

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => window.api.updater.onStatus(setStatus), [])

  const handleInstall = async () => {
    setInstalling(true)
    await window.api.updater.install()
  }

  if (status?.state === 'downloading') {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 text-sm text-gray-700">
        Baixando atualização... {status.percent}%
      </div>
    )
  }

  if (status?.state === 'downloaded') {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-sm text-gray-700">Nova versão pronta (v{status.version})</span>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="px-3 py-2 min-h-[36px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
        >
          {installing ? 'Reiniciando...' : 'Reiniciar agora'}
        </button>
      </div>
    )
  }

  return null
}
