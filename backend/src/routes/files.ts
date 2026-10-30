import { Hono } from 'hono'
import { execute, query } from '../lib/db'

type Bindings = {
  DB?: D1Database
}

type BookingFile = {
  id: number
  booking_id: number
  name: string
  category: string | null
  type: string | null
  size: number | null
  data_base64?: string | null
  visible_to_customer: number
  created_at: string
}

export const filesRoutes = new Hono<{ Bindings: Bindings }>()

async function ensureFilesTable(env: Bindings) {
  await execute(env, `
    CREATE TABLE IF NOT EXISTS booking_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      type TEXT,
      size INTEGER,
      data_base64 TEXT NOT NULL,
      visible_to_customer INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  try { await execute(env, `ALTER TABLE booking_files ADD COLUMN category TEXT`) } catch { /* already exists */ }
}

async function syncDepositDocumentsReady(env: Bindings, bookingId: string) {
  await execute(env, `
    UPDATE bookings
    SET voorschot_documenten_klaar_op = COALESCE(voorschot_documenten_klaar_op, datetime('now'))
    WHERE id = ?
      AND EXISTS (SELECT 1 FROM booking_files WHERE booking_id = ? AND category = 'overeenkomst' AND visible_to_customer = 1)
      AND EXISTS (SELECT 1 FROM booking_files WHERE booking_id = ? AND category = 'voorschotfactuur' AND visible_to_customer = 1)
  `, [bookingId, bookingId, bookingId])
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

filesRoutes.get('/:bookingId', async (c) => {
  await ensureFilesTable(c.env)
  const bookingId = c.req.param('bookingId')
  const rows = await query<Omit<BookingFile, 'data_base64'>>(c.env, `
    SELECT id, booking_id, name, category, type, size, visible_to_customer, created_at
    FROM booking_files
    WHERE booking_id = ? AND visible_to_customer = 1
    ORDER BY created_at DESC, id DESC
  `, [bookingId])
  return c.json({ files: rows })
})

filesRoutes.post('/:bookingId', async (c) => {
  await ensureFilesTable(c.env)
  const bookingId = c.req.param('bookingId')
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  const categoryValue = String(form.get('category') || 'ander')
  const category = ['overeenkomst', 'voorschotfactuur', 'ander'].includes(categoryValue) ? categoryValue : 'ander'
  if (!file) return c.json({ success: false, error: 'Geen bestand gekozen' }, 400)

  // Hou D1 opslag bewust beperkt. Grote foto's/PDF-bundels horen later in R2.
  const maxBytes = 5 * 1024 * 1024
  if (file.size > maxBytes) {
    return c.json({ success: false, error: 'Bestand is te groot. Maximum is 5 MB per bestand.' }, 413)
  }

  const data = arrayBufferToBase64(await file.arrayBuffer())
  const result = await execute(c.env, `
    INSERT INTO booking_files (booking_id, name, category, type, size, data_base64, visible_to_customer)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `, [bookingId, file.name, category, file.type || 'application/octet-stream', file.size, data])
  if (category === 'overeenkomst' || category === 'voorschotfactuur') await syncDepositDocumentsReady(c.env, bookingId)

  return c.json({
    success: true,
    file: {
      id: result.lastRowId,
      booking_id: Number(bookingId),
      name: file.name,
      category,
      type: file.type || 'application/octet-stream',
      size: file.size,
      visible_to_customer: 1,
    }
  })
})

filesRoutes.patch('/:fileId/category', async (c) => {
  await ensureFilesTable(c.env)
  const fileId = c.req.param('fileId')
  const body = await c.req.json<{ category?: string }>()
  const category = body.category || 'ander'
  if (!['overeenkomst', 'voorschotfactuur', 'ander'].includes(category)) {
    return c.json({ success: false, error: 'Ongeldig documenttype' }, 400)
  }
  const rows = await query<{ booking_id: number }>(c.env, `SELECT booking_id FROM booking_files WHERE id = ? LIMIT 1`, [fileId])
  if (!rows[0]) return c.json({ success: false, error: 'Bestand niet gevonden' }, 404)
  await execute(c.env, `UPDATE booking_files SET category = ? WHERE id = ?`, [category, fileId])
  if (category === 'overeenkomst' || category === 'voorschotfactuur') {
    await syncDepositDocumentsReady(c.env, String(rows[0].booking_id))
  }
  return c.json({ success: true })
})

filesRoutes.get('/download/:fileId', async (c) => {
  await ensureFilesTable(c.env)
  const fileId = c.req.param('fileId')
  const rows = await query<BookingFile>(c.env, `SELECT * FROM booking_files WHERE id = ? AND visible_to_customer = 1 LIMIT 1`, [fileId])
  const file = rows[0]
  if (!file?.data_base64) return c.json({ error: 'Bestand niet gevonden' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', file.type || 'application/octet-stream')
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)
  headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  return new Response(base64ToUint8Array(file.data_base64), { headers })
})

filesRoutes.delete('/:fileId', async (c) => {
  await ensureFilesTable(c.env)
  const fileId = c.req.param('fileId')
  await execute(c.env, `DELETE FROM booking_files WHERE id = ?`, [fileId])
  return c.json({ success: true })
})
