import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { hashearClave, verificarClave } from './clave.js';

// Una sola instancia por proceso (API o worker).
const global = globalThis as unknown as { __aptioPrisma?: PrismaClient };
export const prisma: PrismaClient = global.__aptioPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__aptioPrisma = prisma;
export { recalcularReglas } from './observaciones.js';
export { publicarProgramadas, RUTA_SITIO, rutaSitioValida } from './sitio.js';
