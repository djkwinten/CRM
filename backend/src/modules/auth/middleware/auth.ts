import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

// Nxcode user info from token verification
export interface NxcodeUser {
  id: string
  email: string
  name?: string
  picture?: string
}

// Extended context with user
export interface AuthVariables {
  user: NxcodeUser
}

// Nxcode API endpoint - read from env at runtime for Cloudflare Workers compatibility
function getNxcodeApi(env?: { NXCODE_API_URL?: string }): string {
  return env?.NXCODE_API_URL || 'https://studio-api.nxcode.io'
}

/**
 * Auth middleware - verifies Nxcode token and attaches user to context
 *
 * Usage:
 * ```ts
 * import { authMiddleware } from './middleware/auth'
 *
 * // Protect a single route
 * app.get('/api/protected', authMiddleware, (c) => {
 *   const user = c.get('user')
 *   return c.json({ message: `Hello ${user.email}` })
 * })
 *
 * // Protect all routes in a group
 * const protectedRoutes = new Hono()
 * protectedRoutes.use('*', authMiddleware)
 * ```
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' })
  }

  const token = authHeader.slice(7) // Remove 'Bearer ' prefix
  const nxcodeApi = getNxcodeApi(c.env)

  try {
    // Verify token with Nxcode API
    const response = await fetch(`${nxcodeApi}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new HTTPException(401, { message: 'Invalid or expired token' })
      }
      throw new HTTPException(500, { message: 'Failed to verify token' })
    }

    const data = await response.json() as { user: NxcodeUser }

    // Attach user to context
    c.set('user', data.user)

    await next()
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }
    console.error('Auth middleware error:', error)
    throw new HTTPException(500, { message: 'Authentication failed' })
  }
}

/**
 * Optional auth middleware - doesn't require auth but attaches user if present
 *
 * Usage:
 * ```ts
 * app.get('/api/public', optionalAuthMiddleware, (c) => {
 *   const user = c.get('user') // may be undefined
 *   return c.json({ message: user ? `Hello ${user.email}` : 'Hello guest' })
 * })
 * ```
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const nxcodeApi = getNxcodeApi(c.env)

    try {
      const response = await fetch(`${nxcodeApi}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json() as { user: NxcodeUser }
        c.set('user', data.user)
      }
    } catch {
      // Silently ignore auth errors for optional auth
    }
  }

  await next()
}
