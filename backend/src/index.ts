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

type Bindings = {
  DB?: D1Database
  CACHE?: KVNamespace
  STORAGE?: R2Bucket
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

export default app
