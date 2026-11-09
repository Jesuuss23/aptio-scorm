import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La API se sirve bajo el mismo origen (/api) para que la cookie de sesión sea de primera parte.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:3000',
    },
  },
})
