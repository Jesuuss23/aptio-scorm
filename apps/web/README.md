# apps/web · Interfaz de Aptio SCORM

React + Vite. Los tokens, la escala tipográfica y la estructura (barra lateral cobalto y barra superior con ruta) vienen de `@aptio/ui`; las reglas visuales están en `docs/diseno/DESIGN.md`.

```bash
pnpm --filter web dev        # http://localhost:5173 (las llamadas a /api van a la API en :3000)
pnpm --filter web typecheck
pnpm --filter web e2e        # Playwright: auditoría visual (CP-013 a CP-015) y flujo de acceso
```

Las pruebas de Playwright simulan la API con `page.route`, así que no necesitan base de datos. `API_URL` cambia el destino del proxy de desarrollo.
