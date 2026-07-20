/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// App version shown in the rail footer. Read from package.json at build time:
// the webapp builds in an isolated Docker context (the Dockerfile COPYs only
// webapp/), so package.json is the one version source always present in the
// build — bump it when cutting a release. (The parent's pyproject/release-please
// can't reach across the submodule boundary, so there is no cross-repo auto-sync
// here the way docs seds pyproject in the parent checkout.)
const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).version as string

// Dev-mode mirror of the nginx reverse proxy (see webapp/nginx.conf):
// /api/* -> FastAPI backend on :8000. The client is always same-origin,
// so there is zero CORS in dev and in prod alike.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
