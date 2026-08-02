// better-sqlite3 é compilado contra o ABI de Node embutido no Electron (ver
// scripts/dev.js), não o Node do sistema — então os testes também precisam
// rodar sob o runtime do Electron. ELECTRON_RUN_AS_NODE faz o binário do
// Electron se comportar como um `node` normal, sem abrir janela nenhuma.
const { spawnSync } = require('child_process')
const path = require('path')

const electronPath = require('electron')
const vitestBin = path.join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')

const cliArgs = process.argv.slice(2)
const hasMode = cliArgs.some(a => a === 'run' || a === 'watch')
const args = [vitestBin, ...(hasMode ? cliArgs : ['run', ...cliArgs])]

const result = spawnSync(electronPath, args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

process.exit(result.status ?? 1)
