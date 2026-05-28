import { serve } from '@hono/node-server'
import app from './index'
import Database from 'better-sqlite3'
import path from 'path'
import { readFileSync, existsSync, mkdirSync, writeFileSync, readFileSync as readBinaryFileSync } from 'fs'

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


// Local R2-compatible storage for development/preview uploads.
class LocalR2Bucket {
  private root = path.resolve('./uploads')

  private safePath(key: string) {
    const fullPath = path.resolve(this.root, key)
    if (!fullPath.startsWith(this.root + path.sep)) {
      throw new Error('Invalid storage key')
    }
    return fullPath
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: { httpMetadata?: { contentType?: string } }) {
    const filePath = this.safePath(key)
    mkdirSync(path.dirname(filePath), { recursive: true })
    const data = typeof value === 'string'
      ? Buffer.from(value)
      : Buffer.from(value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
    writeFileSync(filePath, data)
    if (options?.httpMetadata?.contentType) {
      writeFileSync(`${filePath}.metadata.json`, JSON.stringify({ contentType: options.httpMetadata.contentType }))
    }
    return null
  }

  async get(key: string) {
    const filePath = this.safePath(key)
    if (!existsSync(filePath)) return null
    let contentType = 'application/octet-stream'
    const metadataPath = `${filePath}.metadata.json`
    if (existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as { contentType?: string }
        if (metadata.contentType) contentType = metadata.contentType
      } catch { /* ignore invalid metadata */ }
    }
    const buffer = readBinaryFileSync(filePath)
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(buffer)
          controller.close()
        }
      }),
      writeHttpMetadata(headers: Headers) {
        headers.set('Content-Type', contentType)
      },
      async arrayBuffer() {
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }
    }
  }

  async head(key: string) {
    return existsSync(this.safePath(key)) ? {} : null
  }

  async delete(key: string) {
    const fs = await import('fs')
    const filePath = this.safePath(key)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    if (fs.existsSync(`${filePath}.metadata.json`)) fs.unlinkSync(`${filePath}.metadata.json`)
  }
}

// Mock Cloudflare Workers environment
const mockEnv = {
  DB: db ? (new MockD1Database(db) as any) : undefined,
  CACHE: undefined,
  STORAGE: new LocalR2Bucket() as any,
  ENVIRONMENT: 'development',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  APP_URL: process.env.APP_URL,
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
