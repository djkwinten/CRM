import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(__dirname, '../frontend')

function run(command, args) {
  execFileSync(command, args, { cwd: frontend, stdio: 'inherit', env: process.env })
}

rmSync(resolve(frontend, 'dist'), { recursive: true, force: true })
run('npx', ['tsc', '-b'])
run('npx', ['vite', 'build'])
