import { defineConfig } from 'vitest/config';

// Las pruebas de etapas del generador (voz, boca, subtítulos) corren la etapa entera contra PostgreSQL, Redis y S3:
// solas tardan de 2 a 3 s, pero en el CI `pnpm -r test` corre la API y el worker a la vez sobre la misma base y
// pasaban el límite de 5 s por defecto. 15 s deja margen sin ocultar una prueba colgada.
export default defineConfig({
  test: { testTimeout: 15_000 },
});
