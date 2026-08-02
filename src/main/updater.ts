import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let win: BrowserWindow | null = null

function send(status: UpdaterStatus) {
  win?.webContents.send('updater:status', status)
}

// Roda só empacotado: em dev não existe app-update.yml (gerado pelo
// electron-builder a partir de "publish"), e checkForUpdates() erraria sempre.
function checkNow() {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch(err => send({ state: 'error', message: err.message }))
}

let initialized = false

// createWindow() pode rodar mais de uma vez (ex.: app.on('activate') recriando
// a janela) — os listeners/handlers e o intervalo só devem existir uma vez por
// processo; só a referência de janela (pra onde os eventos são enviados) troca.
export function initAutoUpdater(mainWindow: BrowserWindow) {
  win = mainWindow
  if (initialized) return
  initialized = true

  // Baixa sozinho assim que encontra uma versão nova; só o "reiniciar" fica a
  // critério de quem estiver usando o PDV, pra não interromper uma venda.
  // Se ninguém reiniciar, a atualização entra sozinha no próximo fechamento.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', info => send({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'not-available' }))
  autoUpdater.on('download-progress', progress => send({ state: 'downloading', percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', info => send({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', err => send({ state: 'error', message: err.message }))

  ipcMain.handle('updater:check', () => checkNow())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())

  checkNow()
  setInterval(checkNow, CHECK_INTERVAL_MS)
}
