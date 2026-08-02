import { app, dialog, shell, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import * as db from './database'

const MAX_AUTO_BACKUPS = 15

function backupsDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Data local (não UTC): mesma referência usada no nome do arquivo e na checagem
// de "já fez backup hoje" — misturar as duas perto da meia-noite fazia duplicar.
function localDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function timestamp(): string {
  const now = new Date()
  return `${localDate(now)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function pruneOldBackups(dir: string) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
  for (const file of files.slice(MAX_AUTO_BACKUPS)) {
    fs.unlinkSync(path.join(dir, file.name))
  }
}

// Um backup automático por dia de uso (na abertura do app), guardado dentro da
// pasta do usuário. Não substitui o backup manual — é a rede de segurança para
// quem nunca clica em "Fazer backup".
export async function createAutoBackupIfNeeded(): Promise<void> {
  const dir = backupsDir()
  const today = localDate(new Date())
  const already = fs.readdirSync(dir).some(f => f.startsWith(`pdv-${today}`))
  if (already) return
  await db.backupDatabase(path.join(dir, `pdv-${timestamp()}.db`))
  pruneOldBackups(dir)
}

export interface BackupInfo {
  name: string
  size: number
  created_at: string
}

export function listBackups(): BackupInfo[] {
  const dir = backupsDir()
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f))
      return { name: f, size: stat.size, created_at: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function openBackupsFolder(): void {
  shell.openPath(backupsDir())
}

export async function exportBackup(win: BrowserWindow | null): Promise<string | null> {
  const defaultName = `dani-cakes-backup-${timestamp()}.db`
  const result = win
    ? await dialog.showSaveDialog(win, {
        title: 'Salvar backup do PDV',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Banco de dados', extensions: ['db'] }]
      })
    : await dialog.showSaveDialog({
        title: 'Salvar backup do PDV',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Banco de dados', extensions: ['db'] }]
      })

  if (result.canceled || !result.filePath) return null
  await db.backupDatabase(result.filePath)
  return result.filePath
}

// Fecha o banco, troca o arquivo pelo backup escolhido e reinicia o app: não dá
// para sobrescrever o .db com ele ainda aberto (e mudanças em memória perderiam
// a troca de qualquer jeito).
export async function restoreBackup(win: BrowserWindow | null): Promise<boolean> {
  const openResult = win
    ? await dialog.showOpenDialog(win, {
        title: 'Selecionar arquivo de backup',
        properties: ['openFile'],
        filters: [{ name: 'Banco de dados', extensions: ['db'] }]
      })
    : await dialog.showOpenDialog({
        title: 'Selecionar arquivo de backup',
        properties: ['openFile'],
        filters: [{ name: 'Banco de dados', extensions: ['db'] }]
      })

  if (openResult.canceled || !openResult.filePaths[0]) return false
  const source = openResult.filePaths[0]

  const confirmOptions = {
    type: 'warning' as const,
    buttons: ['Cancelar', 'Restaurar e reiniciar'],
    defaultId: 0,
    cancelId: 0,
    title: 'Restaurar backup',
    message: 'Isso substitui todos os dados atuais pelos do arquivo selecionado.',
    detail: 'O aplicativo vai fechar e reabrir sozinho. Essa ação não pode ser desfeita.'
  }
  const confirm = win ? await dialog.showMessageBox(win, confirmOptions) : await dialog.showMessageBox(confirmOptions)
  if (confirm.response !== 1) return false

  db.closeDb()
  fs.copyFileSync(source, db.getDbPath())
  app.relaunch()
  app.exit(0)
  return true
}
