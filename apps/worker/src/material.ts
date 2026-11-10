// HU-0304 · Extrae el texto por página del material del cliente (cola media, tarea EXTRAER_TEXTO).
// El trabajo lleva el id del material: no es un trabajo de IA y no genera costo.
import { pareceInstruccion } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import type { Redis } from 'ioredis';
import { extraerDocx, extraerPptx } from './extraer/ooxml.js';
import { extraerPdf } from './extraer/pdf.js';
import type { Ocr, Pagina } from './extraer/tipos.js';
import type { TrabajoEnCola } from './procesar.js';

export const TAREA_EXTRAER = 'EXTRAER_TEXTO';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface DependenciasMaterial {
  bd: PrismaClient;
  redis: Redis;
  leer: (claveS3: string) => Promise<Uint8Array>;
  ocr: Ocr;
}

export function crearExtractor({ bd, redis, leer, ocr }: DependenciasMaterial) {
  return async function extraer(trabajo: TrabajoEnCola): Promise<{ paginas: number }> {
    const { trabajoId: materialId, organizacionId, tarea } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, {
        tipo: estado === 'EN_CURSO' && progreso > 0 ? 'progreso' : 'estado', trabajoId: materialId, organizacionId, cola: 'media', tarea, estado, progreso,
        ...(mensaje ? { mensaje } : {}), en: new Date().toISOString(),
      });
    // El material se busca con la organización del trabajo: nunca se procesa material de otra.
    const material = await bd.materialFuente.findFirst({ where: { id: materialId, proyecto: { organizacionId } } });
    if (!material?.recursoId) throw new Error(`Material ${materialId} no existe en la organización`);
    const recurso = await bd.recurso.findFirst({ where: { id: material.recursoId, organizacionId } });
    if (!recurso) throw new Error(`El recurso del material ${materialId} ya no existe`);

    await bd.materialFuente.update({ where: { id: materialId }, data: { estado: 'procesando', error: null } });
    await emitir('EN_CURSO', 0);
    try {
      const bytes = await leer(recurso.claveS3);
      let paginas: Pagina[];
      if (recurso.mime === 'application/pdf') {
        paginas = await extraerPdf(bytes, ocr, async (hechas, total) => {
          const progreso = Math.round((hechas / total) * 100);
          await trabajo.updateProgress(progreso);
          if (hechas % 10 === 0 || hechas === total) await emitir('EN_CURSO', progreso);
        });
      } else if (recurso.mime === DOCX) {
        paginas = await extraerDocx(bytes);
      } else if (recurso.mime === PPTX) {
        paginas = await extraerPptx(bytes);
      } else {
        throw new Error(`No se extrae texto de ${recurso.mime}`);
      }
      // CP-102: lo que parece una orden a la IA se marca para que el equipo lo vea; nunca se obedece.
      const conAlertas = paginas.map((p) => (pareceInstruccion(p.texto) ? { ...p, posibleInstruccion: true } : p));
      await bd.materialFuente.update({
        where: { id: materialId },
        data: { estado: 'listo', paginas: conAlertas as unknown as Prisma.InputJsonValue, error: null },
      });
      await emitir('COMPLETADO', 100);
      return { paginas: paginas.length };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.materialFuente.update({ where: { id: materialId }, data: { estado: 'error', error: `No se pudo leer el archivo: ${mensaje}` } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
