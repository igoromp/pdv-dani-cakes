delete process.env.ELECTRON_RUN_AS_NODE

const { spawnSync } = require('child_process')
const result = spawnSync('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
})

process.exit(result.status ?? 1)
