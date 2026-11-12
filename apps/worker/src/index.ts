// Worker de Aptio SCORM: un consumidor por cola (ia, voz, media, export).
// Variables del worker y, como respaldo, las de packages/db (DATABASE_URL), igual que la API.
import { config } from 'dotenv';
config({ path: ['.env', '../../packages/db/.env'], quiet: true });
import { COLAS, crearRedis, type DatosTrabajo, opcionesRedis, prefijoColas, TAREA_EXPORTAR } from '@aptio/colas';
import { proveedorDesdeEntorno, proveedorSimulado, sintetizadorDesdeEntorno, transcriptorDesdeEntorno } from '@aptio/ai';
import { Almacen } from '@aptio/almacen';
import { prisma } from '@aptio/db';
import { TAREA_CASCADA, TAREA_GENERAR } from '@aptio/schema/generacion';
import { Queue, Worker } from 'bullmq';
import { crearCascada } from './cascada.js';
import { crearPropuestas } from './propuesta.js';
import { crearTraductor } from './traducir.js';
import { TAREA_TRADUCIR } from '@aptio/schema/traduccion';
import { TAREA_PROPUESTA } from '@aptio/schema/propuesta';
import { EJECUTORES } from './etapas/index.js';
import { crearEtapaVoz } from './etapas/voz.js';
import { crearEtapaSubtitulos } from './etapas/subtitulos.js';
import { crearEtapaBoca } from './etapas/boca.js';
import { calculadorBocasDesdeEntorno } from './extraer/rhubarb.js';
import { cerrarOcr, ocrTesseract } from './extraer/ocr.js';
import { crearGenerador } from './generar.js';
import { mediosFfmpeg } from './extraer/medios.js';
import { crearExtractor, TAREA_EXTRAER } from './material.js';
import { crearExportador } from './exportar.js';
import { crearProcesador, type TrabajoEnCola } from './procesar.js';
import { crearTranscriptor, TAREA_TRANSCRIBIR } from './transcribir.js';
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
// Video y audio del cliente (HU-0305): transcripción con marcas de tiempo.
const transcribir = crearTranscriptor({ bd: prisma, redis, leer: (clave) => almacen.leer(clave), medios: mediosFfmpeg, proveedor: transcriptorDesdeEntorno(process.env) });
// Generación de un proyecto (HU-0401): las 11 etapas en orden con el proveedor de texto del entorno.
// La etapa 6 (HU-0701) necesita la voz del entorno y el almacenamiento para guardar los audios.
const vozEs = crearEtapaVoz({ sintetizar: sintetizadorDesdeEntorno(process.env), subir: (clave, cuerpo, mime) => almacen.subir(clave, cuerpo, mime) });
// La etapa 7 (HU-0702) lee cada audio y calcula su boca con Rhubarb (modo real) o por letras (simulado).
const boca = crearEtapaBoca({ calcular: calculadorBocasDesdeEntorno(process.env), leer: (clave) => almacen.leer(clave) });
// La etapa 8 (HU-0801) escribe un WebVTT por narración y lo guarda en el almacenamiento.
const subtitulos = crearEtapaSubtitulos({ subir: (clave, cuerpo, mime) => almacen.subir(clave, cuerpo, mime) });
const generar = crearGenerador({
  bd: prisma, redis, proveedor: proveedorDesdeEntorno(process.env, () => proveedorSimulado()), ejecutores: { ...EJECUTORES, VOZ_ES: vozEs, BOCA: boca, SUBTITULOS: subtitulos },
});
// La regeneración en cascada (HU-0503) corre las etapas 6, 7 y 8 de una sola pantalla, fuera de la generación.
const cascada = crearCascada({ bd: prisma, voz: vozEs, boca, subtitulos });
// Las propuestas de la IA (HU-0504) usan el mismo proveedor de texto que la generación.
const proponer = crearPropuestas({ bd: prisma, redis, proveedor: proveedorDesdeEntorno(process.env, () => proveedorSimulado()) });
const traducir = crearTraductor({ bd: prisma, redis, proveedor: proveedorDesdeEntorno(process.env, () => proveedorSimulado()) });
// La exportación SCORM 1.2 (HU-1202) lee los recursos del almacenamiento y guarda el ZIP como recurso PAQUETE.
const exportar = crearExportador({ bd: prisma, redis, leer: (clave) => almacen.leer(clave), subir: (clave, cuerpo, mime) => almacen.subir(clave, cuerpo, mime) });
const despachar = (trabajo: TrabajoEnCola) => {
  if (trabajo.data.tarea === TAREA_EXPORTAR) return exportar(trabajo);
  if (trabajo.data.tarea === TAREA_EXTRAER) return extraer(trabajo);
  if (trabajo.data.tarea === TAREA_TRANSCRIBIR) return transcribir(trabajo);
  if (trabajo.data.tarea === TAREA_GENERAR) return generar(trabajo);
  if (trabajo.data.tarea === TAREA_CASCADA) return cascada(trabajo);
  if (trabajo.data.tarea === TAREA_PROPUESTA) return proponer(trabajo);
  if (trabajo.data.tarea === TAREA_TRADUCIR && trabajo.data.traduccion) return traducir(trabajo);
  return procesar(trabajo);
};

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
