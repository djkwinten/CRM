/**
 * Unified storage abstraction layer
 * - Development: Local file system
 * - Production: Cloudflare R2
 */

const LOCAL_UPLOAD_DIR = './uploads'

export interface StorageBinding {
  STORAGE?: R2Bucket
}

// Dev-only: dynamic import for fs/path
async function getFs() {
  const fs = await import('fs')
  const path = await import('path')
  return { fs: fs.default, path: path.default }
}

function ensureLocalDir(filePath: string) {
  const fs = require('fs')
  const path = require('path')
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Upload file to storage
 */
export async function uploadFile(
  env: StorageBinding | null,
  key: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType?: string
): Promise<{ success: boolean; key: string }> {
  if (env?.STORAGE) {
    await env.STORAGE.put(key, data, {
      httpMetadata: contentType ? { contentType } : undefined
    })
    return { success: true, key }
  } else {
    const { fs, path } = await getFs()
    const filePath = path.join(LOCAL_UPLOAD_DIR, key)
    ensureLocalDir(filePath)
    if (typeof data === 'string') {
      fs.writeFileSync(filePath, data)
    } else {
      fs.writeFileSync(filePath, Buffer.from(data as ArrayBuffer))
    }
    return { success: true, key }
  }
}

/**
 * Get file from storage
 */
export async function getFile(
  env: StorageBinding | null,
  key: string
): Promise<ArrayBuffer | null> {
  if (env?.STORAGE) {
    const object = await env.STORAGE.get(key)
    if (!object) return null
    return object.arrayBuffer()
  } else {
    const { fs, path } = await getFs()
    const filePath = path.join(LOCAL_UPLOAD_DIR, key)
    if (!fs.existsSync(filePath)) return null
    const buffer = fs.readFileSync(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }
}

/**
 * Delete file from storage
 */
export async function deleteFile(
  env: StorageBinding | null,
  key: string
): Promise<boolean> {
  if (env?.STORAGE) {
    await env.STORAGE.delete(key)
    return true
  } else {
    const { fs, path } = await getFs()
    const filePath = path.join(LOCAL_UPLOAD_DIR, key)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return true
  }
}

/**
 * Check if file exists
 */
export async function fileExists(
  env: StorageBinding | null,
  key: string
): Promise<boolean> {
  if (env?.STORAGE) {
    const object = await env.STORAGE.head(key)
    return object !== null
  } else {
    const { fs, path } = await getFs()
    const filePath = path.join(LOCAL_UPLOAD_DIR, key)
    return fs.existsSync(filePath)
  }
}
