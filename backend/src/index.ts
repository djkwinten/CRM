import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bookingsRoutes } from './routes/bookings'
import { remindersRoutes } from './routes/reminders'
import { uploadsRoutes } from './routes/uploads'
import { calendarRoutes } from './routes/calendar'
import { exportRoutes } from './routes/export'
import { venuesRoutes } from './routes/venues'
import { templatesRoutes } from './routes/templates'
import { mailRoutes } from './routes/mail'
import { filesRoutes } from './routes/files'

type Bindings = {
  DB?: D1Database
  CACHE?: KVNamespace
  STORAGE?: R2Bucket
  ASSETS?: Fetcher
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Base middleware
app.use('*', logger())
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// Routes - bookings are public for questionnaire access
app.route('/api/bookings', bookingsRoutes)
app.route('/api/reminders', remindersRoutes)
app.route('/api/uploads', uploadsRoutes)
app.route('/api/calendar', calendarRoutes)
app.route('/api/export', exportRoutes)
app.route('/api/venues', venuesRoutes)
app.route('/api/templates', templatesRoutes)
app.route('/api/mail', mailRoutes)
app.route('/api/files', filesRoutes)

// When this API is deployed together with the frontend assets, let React handle
// all non-API routes such as /event/:slug, /vragenlijst/:slug, /agenda, etc.
app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/api/') || path === '/health') {
    return c.json({ error: 'Not found' }, 404)
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.text('Not found', 404)
})

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    // Dagelijkse automatische check: maak 1 maand voor het feest enkel een
    // interne opvolg-todo aan. Er wordt hier bewust geen e-mail verstuurd.
    ctx.waitUntil(Promise.resolve(
      app.fetch(new Request('https://internal.local/api/reminders/feest-herinnering-check', { method: 'POST' }), env)
    ))
  },
}
