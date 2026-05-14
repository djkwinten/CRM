/**
 * Connection test script for CI
 * Verifies frontend-backend communication is working
 */

const FRONTEND_PORT = 5173
const BACKEND_PORT = 3001
const MAX_RETRIES = 30
const RETRY_INTERVAL = 1000

async function waitForServer(port, name) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await fetch(`http://localhost:${port}/`)
      console.log(`✅ ${name} ready on port ${port}`)
      return true
    } catch {
      await new Promise(r => setTimeout(r, RETRY_INTERVAL))
    }
  }
  throw new Error(`❌ ${name} failed to start on port ${port}`)
}

async function testConnection() {
  console.log('🔍 Starting connection tests...\n')

  // 1. Wait for servers to start
  await waitForServer(BACKEND_PORT, 'Backend')
  await waitForServer(FRONTEND_PORT, 'Frontend')

  // 2. Test frontend proxy to backend
  const healthRes = await fetch(`http://localhost:${FRONTEND_PORT}/api/health`)
  if (!healthRes.ok) {
    throw new Error('❌ Frontend proxy to backend failed')
  }
  const healthData = await healthRes.json()
  console.log('✅ Frontend → Backend proxy working')
  console.log(`   Response: ${JSON.stringify(healthData)}`)

  // 3. Test direct backend access
  const backendRes = await fetch(`http://localhost:${BACKEND_PORT}/api/health`)
  if (!backendRes.ok) {
    throw new Error('❌ Direct backend access failed')
  }
  console.log('✅ Backend direct access working')

  // 4. Detect and test enabled modules
  const fs = await import('fs')
  const modules = []

  if (fs.existsSync('./backend/src/routes/auth.ts')) {
    modules.push('auth')
  }
  if (fs.existsSync('./backend/src/routes/ai.ts')) {
    modules.push('ai')
  }
  if (fs.existsSync('./backend/src/routes/payment.ts')) {
    modules.push('payment')
  }

  for (const mod of modules) {
    await testModule(mod)
  }

  console.log('\n🎉 All connection tests passed!')
}

async function testModule(moduleName) {
  const endpoints = {
    auth: '/api/auth/me',
    ai: '/api/ai/health',
    payment: '/api/payment/health'
  }

  const endpoint = endpoints[moduleName]
  const res = await fetch(`http://localhost:${FRONTEND_PORT}${endpoint}`)

  // 401 also counts as success (route exists, just not authenticated)
  if (res.ok || res.status === 401) {
    console.log(`✅ Module [${moduleName}] routes working`)
  } else {
    throw new Error(`❌ Module [${moduleName}] routes failed: ${res.status}`)
  }
}

testConnection().catch(err => {
  console.error(err.message)
  process.exit(1)
})
