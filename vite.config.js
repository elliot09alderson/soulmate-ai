import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/deepgram': {
        target: 'https://api.deepgram.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepgram/, ''),
        secure: true,
      }
    }
  }
})
