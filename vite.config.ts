import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const localApi = 'http://localhost:8787'

  const proxy: Record<string, ProxyOptions> = {
    '/api': { target: localApi, changeOrigin: true },
    '/user-data': { target: localApi, changeOrigin: true },
  }

  return {
    plugins: [react()],
    server: {
      proxy,
    },
    preview: {
      proxy,
    },
  }
})

