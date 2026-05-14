import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Nxcode Element Inspector: 仅在开发模式下注入源码位置属性
const nxcodeBabelPlugins = process.env.NODE_ENV !== 'production'
  ? [[path.resolve(__dirname, './babel-plugin-nxcode-source.cjs'), { rootDir: __dirname }]]
  : []

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: nxcodeBabelPlugins
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
