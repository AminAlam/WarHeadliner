import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: ['war.aminalam.info'],
    proxy: {
      '/api': {
        target: 'https://warapi.aminalam.info',
        changeOrigin: true,
        secure: true
      },
      '/socket.io': {
        target: 'https://warapi.aminalam.info',
        ws: true,
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  // WebSocket configuration
  websocket: {
    hmr: {
      protocol: 'wss',
      host: 'war.aminalam.info',
      clientPort: 443,
      path: ''
    }
  }
}) 