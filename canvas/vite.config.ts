/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api/openclaw': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/users': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/settings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/invites': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/onboarding': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/library': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/crm': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
