import { serve } from '@hono/node-server'
import app from './index'
import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'fs'

// Load .env if present
if (existsSync('./.env')) {
  const envContent = readFileSync('./.env', 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
}

const port = 3001

// Initialize database if schema.sql exists
let db: Database.Database | undefined
if (existsSync('./schema.sql')) {
  if (!existsSync('./dev.db')) {
    console.log('📦 Initializing database from schema.sql...')
    db = new Database('./dev.db')
    const schema = readFileSync('./schema.sql', 'utf-8')
    db.exec(schema)
    console.log('✓ Database initialized')
  } else {
    db = new Database('./dev.db')
    console.log('✓ Using existing dev.db')
  }
} else {
  console.log('⚠️  No schema.sql found - database features disabled')
}

// Mock D1 Database API
class MockD1Database {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql)
    return {
      bind: (...params: any[]) => ({
        all: () => {
          const startTime = Date.now()
          try {
            const results = stmt.all(...params)
            return {
              success: true,
              results,
              meta: {
                served_by: 'dev-server',
                duration: Date.now() - startTime,
                changes: 0,
                last_row_id: 0,
                changed_db: false,
                size_after: 0,
                rows_read: results.length,
                rows_written: 0
              }
            }
          } catch (error: any) {
            console.error('D1 query error:', error.message)
            throw error
          }
        },
        first: () => {
          try {
            return stmt.get(...params) || null
          } catch (error: any) {
            console.error('D1 query error:', error.message)
            return null
          }
        },
        run: () => {
          const startTime = Date.now()
          try {
            const info = stmt.run(...params)
            return {
              success: true,
              results: [],
              meta: {
                served_by: 'dev-server',
                duration: Date.now() - startTime,
                changes: info.changes,
                last_row_id: info.lastInsertRowid,
                changed_db: info.changes > 0,
                size_after: 0,
                rows_read: 0,
                rows_written: info.changes
              }
            }
          } catch (error: any) {
            console.error('D1 query error:', error.message)
            throw error
          }
        }
      })
    }
  }

  async batch(statements: any[]) {
    const results = []
    for (const stmt of statements) {
      results.push(await stmt.all())
    }
    return results
  }

  async exec(sql: string) {
    try {
      this.db.exec(sql)
      return { count: 0, duration: 0 }
    } catch (error: any) {
      console.error('D1 exec error:', error.message)
      throw error
    }
  }
}

// Mock Cloudflare Workers environment
const mockEnv = {
  DB: db ? (new MockD1Database(db) as any) : undefined,
  CACHE: undefined,
  STORAGE: undefined,
  ENVIRONMENT: 'development'
}

console.log(`🚀 Dev server running at http://localhost:${port}`)
if (!db) {
  console.log('💡 To enable database, create a schema.sql file')
}
console.log('💡 Use "npm run dev:wrangler" for full Workers emulation (requires glibc)')

serve({
  fetch: (req) => app.fetch(req, mockEnv),
  port,
})
