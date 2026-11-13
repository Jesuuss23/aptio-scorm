import { defineConfig } from 'vitest/config';

// Las pruebas de copia comparten la base y LocalStack: una a la vez.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], fileParallelism: false } });
