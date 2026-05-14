import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Socket.IO uses /ws for both HTTP polling and WebSocket upgrade.
      // ws: true enables WebSocket proxying; the polling requests are
      // plain HTTP and are handled automatically by the same rule.
      '/ws': {
        target:       'http://localhost:8000',
        ws:           true,
        changeOrigin: true,
      },
      // REST API routes
      '/auth':      { target: 'http://localhost:8000', changeOrigin: true },
      '/incidents': { target: 'http://localhost:8000', changeOrigin: true },
      '/webhooks':  { target: 'http://localhost:8000', changeOrigin: true },
      '/dashboard': { target: 'http://localhost:8000', changeOrigin: true },
      '/health':    { target: 'http://localhost:8000', changeOrigin: true },
      '/metrics':   { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
