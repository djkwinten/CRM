/**
 * Unified cache abstraction layer
 * - Development: In-memory Map
 * - Production: Cloudflare KV
 */

// Development: in-memory cache with TTL
const memoryCache = new Map<string, { value: string; expires: number }>()

export interface CacheBinding {
  CACHE?: KVNamespace
}

/**
 * Get value from cache
 */
export async function cacheGet(
  env: CacheBinding | null,
  key: string
): Promise<string | null> {
  if (env?.CACHE) {
    return env.CACHE.get(key)
  } else {
    const item = memoryCache.get(key)
    if (!item) return null
    if (item.expires && item.expires < Date.now()) {
      memoryCache.delete(key)
      return null
    }
    return item.value
  }
}

/**
 * Get JSON value from cache
 */
export async function cacheGetJson<T>(
  env: CacheBinding | null,
  key: string
): Promise<T | null> {
  const value = await cacheGet(env, key)
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * Set value in cache
 */
export async function cacheSet(
  env: CacheBinding | null,
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  if (env?.CACHE) {
    await env.CACHE.put(key, value, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  } else {
    memoryCache.set(key, {
      value,
      expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0
    })
  }
}

/**
 * Set JSON value in cache
 */
export async function cacheSetJson<T>(
  env: CacheBinding | null,
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  await cacheSet(env, key, JSON.stringify(value), ttlSeconds)
}

/**
 * Delete value from cache
 */
export async function cacheDelete(
  env: CacheBinding | null,
  key: string
): Promise<void> {
  if (env?.CACHE) {
    await env.CACHE.delete(key)
  } else {
    memoryCache.delete(key)
  }
}
