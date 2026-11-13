import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La API se sirve bajo el mismo origen (/api) para que la cookie de sesión sea de primera parte.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:3000',
      // HU-1508 · El sitio público pre-renderizado lo sirve la API fuera de su prefijo.
      '/s/': process.env.API_URL ?? 'http://localhost:3000',
      '^/s$': process.env.API_URL ?? 'http://localhost:3000',
    },
  },
})
