import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3001,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/thumbnails': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/videos': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
