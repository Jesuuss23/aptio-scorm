// Procesa un trabajo de cualquier cola: lo marca en curso, informa el avance y guarda el resultado.
// En el S0 solo existe el modo simulado (salidas grabadas del caso LOTO); los proveedores reales
// llegan con sus historias (S2 en adelante) y pasan por packages/ai.
import { leerSalidaSimulada } from '@aptio/ai';
import { type DatosTrabajo, type EstadoTrabajo, type EventoTrabajo, type NombreCola, publicarEvento } from '@aptio/colas';
import type { PrismaClient } from '@aptio/db';
import type { Redis } from 'ioredis';

export interface TrabajoEnCola {
  data: DatosTrabajo;
  queueName: string;
  updateProgress(progreso: number): Promise<void>;
}

export interface Dependencias {
  bd: PrismaClient;
  redis: Redis;
  /** Demora total simulada, para que el avance se vea en la web. 0 en pruebas. */
  demoraMs: number;
  modo: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function crearProcesador({ bd, redis, demoraMs, modo }: Dependencias) {
  return async function procesar(trabajo: TrabajoEnCola): Promise<{ archivo: string }> {
    const { trabajoId, organizacionId, tarea } = trabajo.data;
    const cola = trabajo.queueName as NombreCola;
    const emitir = (tipo: EventoTrabajo['tipo'], estado: EstadoTrabajo, progreso: number, mensaje?: string) =>
      publicarEvento(redis, {
        tipo, trabajoId, organizacionId, cola, tarea, estado, progreso,
        ...(mensaje ? { mensaje } : {}),
        en: new Date().toISOString(),
      });

    const inicio = Date.now();
    // updateMany con organizacionId: un trabajo nunca se procesa con datos de otra organización.
    const marcado = await bd.trabajoIA.updateMany({
      where: { id: trabajoId, organizacionId },
      data: { estado: 'EN_CURSO', intentos: { increment: 1 } },
    });
    if (marcado.count === 0) throw new Error(`Trabajo ${trabajoId} no existe en la organización`);
    await emitir('estado', 'EN_CURSO', 0);

    try {
      if (modo !== 'simulado') throw new Error(`Modo de proveedores no disponible en el S0: ${modo}`);
      for (const progreso of [25, 50, 75]) {
        await espera(demoraMs / 4);
        await trabajo.updateProgress(progreso);
        await emitir('progreso', 'EN_CURSO', progreso);
      }
      await espera(demoraMs / 4);
      const salida = leerSalidaSimulada(tarea);
      await bd.trabajoIA.update({
        where: { id: trabajoId },
        data: {
          estado: 'COMPLETADO',
          proveedor: 'simulado',
          modelo: `caso-loto/${salida.archivo}`,
          costoUsd: 0,
          error: null,
          duracionMs: Date.now() - inicio,
        },
      });
      await trabajo.updateProgress(100);
      await emitir('estado', 'COMPLETADO', 100);
      return { archivo: salida.archivo };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'ERROR', error: mensaje, duracionMs: Date.now() - inicio } });
      await emitir('estado', 'ERROR', 0, mensaje);
      throw e;
    }
  };
}
