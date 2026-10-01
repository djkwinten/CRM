import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const fail = (message) => { throw new Error(message) }
const read = (path) => readFileSync(resolve(root, path), 'utf8')

for (const obsolete of [
  'wrangler.jsonc',
  'backend/wrangler.toml',
  'frontend/wrangler.toml',
  'frontend/public/wrangler.toml',
  'frontend/index.source.html',
  'frontend/src/modules/auth',
]) {
  if (existsSync(resolve(root, obsolete))) fail(`Obsolete source-of-truth path still exists: ${obsolete}`)
}

function filesBelow(directory) {
  return readdirSync(directory).flatMap(name => {
    if (name === 'node_modules' || name === '.git' || name === 'dist') return []
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? filesBelow(path) : [path]
  })
}

const manifests = filesBelow(root)
  .map(path => relative(root, path))
  .filter(path => path === 'wrangler.toml' || path.endsWith('/wrangler.toml') || path === 'wrangler.jsonc' || path.endsWith('/wrangler.jsonc'))
if (manifests.length !== 1 || manifests[0] !== 'wrangler.toml') {
  fail(`Expected only root wrangler.toml, found: ${manifests.join(', ') || 'none'}`)
}

const manifest = read('wrangler.toml')
for (const required of [
  'name = "crm"',
  'main = "backend/src/index.ts"',
  'directory = "./dist"',
  'binding = "DB"',
  'database_id = "25eee93e-26c4-4789-8cbc-3fd5f3a8c93d"',
  'binding = "STORAGE"',
]) {
  if (!manifest.includes(required)) fail(`Canonical Worker manifest is missing: ${required}`)
}

const browserSources = filesBelow(resolve(root, 'frontend/src'))
  .filter(path => /\.(ts|tsx)$/.test(path))
for (const path of browserSources) {
  const source = readFileSync(path, 'utf8')
  if (source.includes('VITE_API_URL') || source.includes('API_ROOT')) {
    fail(`Browser API host override remains in ${path}`)
  }
}

const html = read('frontend/index.html')
if (html.includes('@nxcode/sdk') || html.includes('cdn.jsdelivr.net')) {
  fail('Frontend entry still loads the obsolete authentication runtime')
}
if (!html.includes('/src/main.tsx')) fail('Frontend entry is not a Vite source entry')

console.log(JSON.stringify({ success: true, worker: 'crm', api: 'same-origin', manifests: 1 }))
