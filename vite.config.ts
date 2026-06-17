import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const MOCK_PORT = process.env.MOCK_PORT || 3000

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': `http://localhost:${MOCK_PORT}`,
    },
  },
})
