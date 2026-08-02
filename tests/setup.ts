import { vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// database.ts só chama app.getPath('userData') dentro de initDb(), então basta
// mockar isso — nada de Electron de verdade roda nos testes. Um diretório
// temporário por arquivo de teste (memorizado no primeiro uso) mantém cada
// suíte com seu próprio banco, sem uma suíte pisar no banco da outra.
let userDataDir: string | null = null

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`getPath("${name}") inesperado nos testes`)
      if (!userDataDir) userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-test-'))
      return userDataDir
    }
  }
}))
