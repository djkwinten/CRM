import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const frontend = resolve(root, 'frontend')

function run(command, args, cwd = frontend) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env })
}

function copyIfExists(from, to) {
  if (existsSync(from)) copyFileSync(from, to)
}

// Vite needs the source index with /src/main.tsx as entry.
copyFileSync(resolve(frontend, 'index.source.html'), resolve(frontend, 'index.html'))
rmSync(resolve(frontend, 'dist'), { recursive: true, force: true })
rmSync(resolve(frontend, 'public/assets'), { recursive: true, force: true })

run('npx', ['tsc', '-b'])
run('npx', ['vite', 'build'])

// The user's current Cloudflare GitHub setup serves frontend/ directly without building.
// Keep frontend/ itself deployable by replacing index.html/assets with the production build output.
rmSync(resolve(frontend, 'assets'), { recursive: true, force: true })
cpSync(resolve(frontend, 'dist/assets'), resolve(frontend, 'assets'), { recursive: true })
mkdirSync(resolve(frontend, 'public/assets'), { recursive: true })
cpSync(resolve(frontend, 'assets'), resolve(frontend, 'public/assets'), { recursive: true })
copyFileSync(resolve(frontend, 'dist/index.html'), resolve(frontend, 'index.html'))

for (const file of [
  'favicon.ico',
  'favicon-32.png',
  'apple-touch-icon.png',
  'logo-dj-kwinten.jpg',
  'logo-original.jpg',
  'djkwinten-vragenlijst-algemeen.pdf',
  'djkwinten-vragenlijst-trouw.pdf',
]) {
  copyIfExists(resolve(frontend, 'dist', file), resolve(frontend, file))
}
