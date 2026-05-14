import { Hono } from 'hono'

const exampleRoutes = new Hono()

// GET /api/hello - 示例 GET 请求
exampleRoutes.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Nxcode!',
    timestamp: Date.now()
  })
})

// POST /api/echo - 示例 POST 请求，返回请求体
exampleRoutes.post('/echo', async (c) => {
  const body = await c.req.json()
  return c.json({
    received: body,
    timestamp: Date.now()
  })
})

export { exampleRoutes }
