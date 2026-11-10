// Worker de Aptio SCORM: un consumidor por cola (ia, voz, media, export).
// Variables del worker y, como respaldo, las de packages/db (DATABASE_URL), igual que la API.
import { config } from 'dotenv';
config({ path: ['.env', '../../packages/db/.env'], quiet: true });
import { COLAS, crearRedis, type DatosTrabajo, opcionesRedis, prefijoColas } from '@aptio/colas';
import { Almacen } from '@aptio/almacen';
import { prisma } from '@aptio/db';
import { Queue, Worker } from 'bullmq';
import { cerrarOcr, ocrTesseract } from './extraer/ocr.js';
import { crearExtractor, TAREA_EXTRAER } from './material.js';
import { crearProcesador, type TrabajoEnCola } from './procesar.js';
import { borrarDocumentosVencidos, COLA_MANTENIMIENTO, PATRON_BORRADO, TAREA_BORRADO } from './retencion.js';

const redis = crearRedis();
const procesar = crearProcesador({
  bd: prisma,
  redis,
  demoraMs: Number(process.env.SIMULADO_DEMORA_MS ?? 2000),
  modo: process.env.PROVEEDORES_MODO ?? 'simulado',
});

// Material del cliente (HU-0304): texto por página con OCR para las escaneadas.
const almacen = new Almacen();
const extraer = crearExtractor({ bd: prisma, redis, leer: (clave) => almacen.leer(clave), ocr: ocrTesseract });
const despachar = (trabajo: TrabajoEnCola) => (trabajo.data.tarea === TAREA_EXTRAER ? extraer(trabajo) : procesar(trabajo));

const trabajadores = COLAS.map(
  (cola) =>
    new Worker<DatosTrabajo>(cola, despachar, {
      connection: opcionesRedis(),
      prefix: prefijoColas(),
      concurrency: Number(process.env.WORKER_CONCURRENCIA ?? 2),
    }),
);

// Mantenimiento: borrado diario de documentos del cliente vencidos (HU-1404). Fuera de COLAS: no es un trabajo de IA.
const mantenimiento = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
await mantenimiento.upsertJobScheduler(TAREA_BORRADO, { pattern: PATRON_BORRADO, tz: 'America/Lima' }, { name: TAREA_BORRADO });
const mantenedor = new Worker(
  COLA_MANTENIMIENTO,
  async () => {
    const r = await borrarDocumentosVencidos(prisma, almacen);
    if (r.documentos > 0) console.log(`Borrados ${r.documentos} documentos vencidos de ${r.proyectos} proyectos`);
    return r;
  },
  { connection: opcionesRedis(), prefix: prefijoColas() },
);
mantenedor.on('failed', (_job, err) => console.error(`[${COLA_MANTENIMIENTO}] borrado de documentos falló: ${err.message}`));

for (const t of trabajadores) {
  t.on('failed', (job, err) => console.error(`[${t.name}] trabajo ${job?.data.trabajoId} falló: ${err.message}`));
}
console.log(`Worker escuchando las colas ${COLAS.join(', ')} en ${opcionesRedis().host}:${opcionesRedis().port}`);

async function cerrar() {
  await Promise.all([...trabajadores.map((t) => t.close()), mantenedor.close(), mantenimiento.close()]);
  await cerrarOcr();
  redis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
