// Worker de Aptio SCORM: un consumidor por cola (ia, voz, media, export).
// Variables del worker y, como respaldo, las de packages/db (DATABASE_URL), igual que la API.
import { config } from 'dotenv';
config({ path: ['.env', '../../packages/db/.env'], quiet: true });
import { COLAS, crearRedis, type DatosTrabajo, opcionesRedis, prefijoColas } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { Worker } from 'bullmq';
import { crearProcesador } from './procesar.js';

const redis = crearRedis();
const procesar = crearProcesador({
  bd: prisma,
  redis,
  demoraMs: Number(process.env.SIMULADO_DEMORA_MS ?? 2000),
  modo: process.env.PROVEEDORES_MODO ?? 'simulado',
});

const trabajadores = COLAS.map(
  (cola) =>
    new Worker<DatosTrabajo>(cola, procesar, {
      connection: opcionesRedis(),
      prefix: prefijoColas(),
      concurrency: Number(process.env.WORKER_CONCURRENCIA ?? 2),
    }),
);
for (const t of trabajadores) {
  t.on('failed', (job, err) => console.error(`[${t.name}] trabajo ${job?.data.trabajoId} falló: ${err.message}`));
}
console.log(`Worker escuchando las colas ${COLAS.join(', ')} en ${opcionesRedis().host}:${opcionesRedis().port}`);

async function cerrar() {
  await Promise.all(trabajadores.map((t) => t.close()));
  redis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
