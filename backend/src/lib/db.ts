/**
 * Database abstraction layer for Cloudflare D1
 *
 * Development: Uses Wrangler's local D1 emulator (--local flag)
 * Production: Uses Cloudflare D1
 *
 * Note: Configure D1 in wrangler.toml:
 * [[d1_databases]]
 * binding = "DB"
 * database_name = "your-db-name"
 * database_id = "your-database-id"
 */

export interface DbBinding {
  DB?: D1Database
}

/**
 * Query the database (SELECT)
 */
export async function query<T = Record<string, unknown>>(
  env: DbBinding | null,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!env?.DB) {
    console.warn('D1 database not configured. Add [[d1_databases]] to wrangler.toml')
    return []
  }
  const stmt = env.DB.prepare(sql)
  const result = await stmt.bind(...params).all()
  return result.results as T[]
}

/**
 * Query single row
 */
export async function queryOne<T = Record<string, unknown>>(
  env: DbBinding | null,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  if (!env?.DB) {
    console.warn('D1 database not configured. Add [[d1_databases]] to wrangler.toml')
    return null
  }
  const stmt = env.DB.prepare(sql)
  const result = await stmt.bind(...params).first()
  return result as T | null
}

/**
 * Execute statement (INSERT/UPDATE/DELETE)
 */
export async function execute(
  env: DbBinding | null,
  sql: string,
  params: unknown[] = []
): Promise<{ lastRowId: number; changes: number }> {
  if (!env?.DB) {
    console.warn('D1 database not configured. Add [[d1_databases]] to wrangler.toml')
    return { lastRowId: 0, changes: 0 }
  }
  const stmt = env.DB.prepare(sql)
  const result = await stmt.bind(...params).run()
  return {
    lastRowId: result.meta.last_row_id || 0,
    changes: result.meta.changes || 0
  }
}
