import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cloudBase = String(env.VITE_CLOUD_API_BASE_URL || '').trim().replace(/\/$/, '')
  const localApi = 'http://localhost:8787'

  const proxy: Record<string, ProxyOptions> = {
    '/api/workflow': { target: localApi, changeOrigin: true },
    '/user-data': { target: localApi, changeOrigin: true },
  }

  if (cloudBase) {
    const cloudOpts: ProxyOptions = {
      target: cloudBase,
      changeOrigin: true,
      secure: false,
    }
    proxy['/api'] = cloudOpts
    proxy['/dl'] = cloudOpts
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

