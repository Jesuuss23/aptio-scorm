// HU-0305 · Transcribe el video o audio del cliente con marcas de tiempo (cola media, tarea TRANSCRIBIR). El trabajo lleva
// el id del material; el costo del proveedor queda en TrabajoIA del proyecto (HU-1301).
import { costoTranscripcion, pareceInstruccion, type ProveedorTranscripcion, SEGUNDOS_POR_TRAMO, type SegmentoTranscripcion } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import type { Redis } from 'ioredis';
import type { Medios } from './extraer/medios.js';
import type { TrabajoEnCola } from './procesar.js';
import { vigilarLimite } from './conexiones.js';

export const TAREA_TRANSCRIBIR = 'TRANSCRIBIR';
/** Idioma por defecto del reconocimiento: el del cliente si es inglés, si no español (SUP-28). */
const IDIOMA: Record<string, string> = { es: 'es-US', en: 'en-US' };

export interface DependenciasTranscripcion {
  bd: PrismaClient;
  redis: Redis;
  leer: (claveS3: string) => Promise<Uint8Array>;
  medios: Medios;
  proveedor: ProveedorTranscripcion;
}

export function crearTranscriptor({ bd, redis, leer, medios, proveedor }: DependenciasTranscripcion) {
  return async function transcribir(trabajo: TrabajoEnCola): Promise<{ segmentos: number; duracionS: number }> {
    const { trabajoId: materialId, organizacionId, tarea } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, {
        tipo: estado === 'EN_CURSO' && progreso > 0 ? 'progreso' : 'estado', trabajoId: materialId, organizacionId, cola: 'media', tarea, estado, progreso,
        ...(mensaje ? { mensaje } : {}), en: new Date().toISOString(),
      });
    // El material se busca con la organización del trabajo: nunca se procesa material de otra.
    const material = await bd.materialFuente.findFirst({ where: { id: materialId, proyecto: { organizacionId } }, include: { proyecto: { include: { cliente: true } } } });
    if (!material?.recursoId) throw new Error(`Material ${materialId} no existe en la organización`);
    const recurso = await bd.recurso.findFirst({ where: { id: material.recursoId, organizacionId } });
    if (!recurso) throw new Error(`El recurso del material ${materialId} ya no existe`);

    await bd.materialFuente.update({ where: { id: materialId }, data: { estado: 'procesando', error: null } });
    await emitir('EN_CURSO', 0);
    const inicio = Date.now();
    let duracionS = 0;
    const registro = await bd.trabajoIA.create({
      data: { organizacionId, proyectoId: material.proyectoId, tarea: 'TRANSCRIPCION', tipo: 'TRANSCRIPCION', proveedor: proveedor.nombre, modelo: proveedor.modelo, estado: 'EN_CURSO' },
    });
    try {
      // HU-1304 · El límite de gasto mensual de la transcripción se revisa antes de llamar al proveedor (CP-100).
      await vigilarLimite(bd, organizacionId, 'TRANSCRIPCION', { proyectoId: material.proyectoId });
      const corte = await medios.tramos(await leer(recurso.claveS3), SEGUNDOS_POR_TRAMO);
      duracionS = corte.duracionS;
      const idioma = IDIOMA[material.proyecto.idiomas[0] ?? 'es'] ?? 'es-US';
      const segmentos: SegmentoTranscripcion[] = [];
      for (const [i, tramo] of corte.tramos.entries()) {
        segmentos.push(...await proveedor.transcribir(tramo, idioma));
        const progreso = Math.round(((i + 1) / corte.tramos.length) * 100);
        await trabajo.updateProgress(progreso);
        if (i + 1 < corte.tramos.length) await emitir('EN_CURSO', progreso);
      }
      // CP-102: lo que parece una orden a la IA se marca para que el equipo lo vea; nunca se obedece.
      const conAlertas = segmentos.map((s) => (pareceInstruccion(s.texto) ? { ...s, posibleInstruccion: true } : s));
      const metadatos = { ...((recurso.metadatos as Record<string, unknown> | null) ?? {}), duracionS: Math.round(duracionS * 10) / 10 };
      await bd.$transaction([
        bd.recurso.update({ where: { id: recurso.id }, data: { metadatos } }),
        bd.materialFuente.update({ where: { id: materialId }, data: { estado: 'listo', transcripcion: conAlertas as unknown as Prisma.InputJsonValue, error: null } }),
        bd.trabajoIA.update({
          where: { id: registro.id },
          data: { estado: 'COMPLETADO', intentos: 1, segundosAudio: Math.ceil(duracionS), costoUsd: costoTranscripcion(proveedor.nombre, duracionS), duracionMs: Date.now() - inicio },
        }),
      ]);
      await emitir('COMPLETADO', 100);
      return { segmentos: conAlertas.length, duracionS };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.materialFuente.update({ where: { id: materialId }, data: { estado: 'error', error: `No se pudo transcribir el archivo: ${mensaje}` } });
      await bd.trabajoIA.update({ where: { id: registro.id }, data: { estado: 'ERROR', intentos: 1, error: mensaje, duracionMs: Date.now() - inicio } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
