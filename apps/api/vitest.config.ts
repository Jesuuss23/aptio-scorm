import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite los metadatos de decoradores que necesita la inyección de dependencias de NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // Las pruebas ingresan muchas veces por minuto desde la misma IP: el límite de ingreso (M1) se prueba aparte.
  // Cada archivo cuenta los límites por IP con su propio prefijo en Redis (test/limites-por-archivo.ts).
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'], env: { LIMITE_INGRESO_POR_MINUTO: '100000' }, setupFiles: ['test/limites-por-archivo.ts'] },
});
