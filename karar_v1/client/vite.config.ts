import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const clientDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(clientDirectory, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, '')
  const pfxPath = env.KARAR_TLS_PFX_PATH
    ? path.resolve(projectDirectory, env.KARAR_TLS_PFX_PATH)
    : ''

  if (env.KARAR_LOCAL_AUTH === 'true' && (!pfxPath || !existsSync(pfxPath) || !env.KARAR_TLS_PFX_PASSWORD)) {
    throw new Error('Local account mode requires a readable KARAR_TLS_PFX_PATH and KARAR_TLS_PFX_PASSWORD in the server .env file.')
  }

  const configureProxy = (proxy: { on: (event: string, listener: (proxyRequest: { setHeader: (name: string, value: string) => void }, request: { socket: { remoteAddress?: string; encrypted?: boolean } }) => void) => void }) => {
    proxy.on('proxyReq', (proxyRequest, request) => {
      if (request.socket.remoteAddress) proxyRequest.setHeader('X-Forwarded-For', request.socket.remoteAddress)
      proxyRequest.setHeader('X-Forwarded-Proto', pfxPath ? 'https' : request.socket.encrypted ? 'https' : 'http')
    })
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_KARAR_LOCAL_AUTH': JSON.stringify(env.KARAR_LOCAL_AUTH === 'true' ? 'true' : 'false'),
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      strictPort: true,
      ...(pfxPath ? {
        https: {
          pfx: readFileSync(pfxPath),
          passphrase: env.KARAR_TLS_PFX_PASSWORD,
        },
      } : {}),
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          ...(pfxPath ? { headers: { 'X-Forwarded-Proto': 'https' } } : {}),
          configure: configureProxy,
        },
        '/health': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          ...(pfxPath ? { headers: { 'X-Forwarded-Proto': 'https' } } : {}),
          configure: configureProxy,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    }
  }
})
