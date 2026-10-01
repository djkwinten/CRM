type AppUrlEnv = {
  APP_URL?: string
}

/**
 * Resolve the public CRM origin used in customer-facing links.
 *
 * A configured APP_URL wins (useful behind a custom domain). For same-origin
 * deployments, the current request origin is authoritative and prevents stale
 * Worker URLs from leaking into e-mails.
 */
export function publicAppUrl(env: AppUrlEnv, requestUrl: string): string {
  const configured = env.APP_URL?.trim()
  const candidate = configured || new URL(requestUrl).origin
  const url = new URL(candidate)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('APP_URL must use http or https')
  }

  return url.origin.replace(/\/$/, '')
}
