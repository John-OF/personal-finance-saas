import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the API runs in `wrangler dev`; in production both share the same origin.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
