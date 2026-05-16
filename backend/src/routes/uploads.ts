import { Hono } from 'hono'

type Bindings = {
  STORAGE?: R2Bucket
}

export const uploadsRoutes = new Hono<{ Bindings: Bindings }>()

// Upload een bestand naar R2 en geef de key terug
uploadsRoutes.post('/', async (c) => {
  const storage = c.env.STORAGE
  if (!storage) {
    return c.json({
      success: false,
      error: 'Uploadopslag is nog niet geconfigureerd. Je kan de vragenlijst zonder foto verder invullen.'
    }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  const allowed = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!allowed) {
    return c.json({ success: false, error: 'Enkel afbeeldingen en PDF-bestanden zijn toegestaan.' }, 400)
  }

  const maxBytes = 10 * 1024 * 1024
  if (file.size > maxBytes) {
    return c.json({ success: false, error: 'Bestand is te groot. Maximum 10 MB per bestand.' }, 413)
  }

  const ext = file.name.split('.').pop() || 'bin'
  const key = `zaal-fotos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const buffer = await file.arrayBuffer()
  await storage.put(key, buffer, {
    httpMetadata: { contentType: file.type }
  })

  return c.json({ success: true, key, naam: file.name, type: file.type })
})

// Haal een bestand op uit R2
uploadsRoutes.get('/:key{.+}', async (c) => {
  const storage = c.env.STORAGE
  if (!storage) return c.json({ error: 'Storage not configured' }, 500)

  const key = c.req.param('key')
  const object = await storage.get(key)
  if (!object) return c.json({ error: 'Not found' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=31536000')

  return new Response(object.body, { headers })
})
