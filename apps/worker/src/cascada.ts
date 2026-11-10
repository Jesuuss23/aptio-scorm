// HU-0503 · Regeneración en cascada: al cambiar la narración de una pantalla, su voz, su boca y sus subtítulos se
// rehacen solos, solo para esa pantalla (CP-050). Es un trabajo propio en la cola `voz`, fuera de la generación, que
// corre las mismas etapas 6, 7 y 8 limitadas a esa pantalla (SUP-38): el hash RN-07-1 decide si hace falta otra voz y
// el costo queda en TrabajoIA con el proyecto. Si hay una generación en curso, espera a que termine para no escribir
// el mismo curso a la vez. Si algo falla, la narración queda en ERROR para que Revisión lo muestre.
import type { EstadoTrabajo } from '@aptio/colas';
import type { PrismaClient } from '@aptio/db';
import type { ContextoEtapa, EjecutorEtapa } from './generar.js';
import type { TrabajoEnCola } from './procesar.js';

const ACTIVAS = ['EN_COLA', 'EN_CURSO'] as const;

export interface DependenciasCascada {
  bd: PrismaClient;
  voz: EjecutorEtapa;
  boca: EjecutorEtapa;
  subtitulos: EjecutorEtapa;
  /** Cada cuánto se vuelve a mirar si terminó la generación en curso (5 s; en pruebas, menos). */
  esperaMs?: number;
  /** Cuánto se espera como máximo a una generación en curso antes de rendirse (30 min). */
  esperaMaximaMs?: number;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function crearCascada({ bd, voz, boca, subtitulos, esperaMs = 5000, esperaMaximaMs = 30 * 60_000 }: DependenciasCascada) {
  return async function cascada(trabajo: TrabajoEnCola): Promise<{ estado: EstadoTrabajo }> {
    const { trabajoId: cursoId, organizacionId, pantallaId } = trabajo.data;
    if (!pantallaId) throw new Error('La cascada necesita la pantalla');
    // El curso se busca con la organización del trabajo: nunca se procesa el de otra.
    const curso = await bd.curso.findFirst({ where: { id: cursoId, organizacionId }, select: { id: true, proyectoId: true } });
    if (!curso) throw new Error(`Curso ${cursoId} no existe en la organización`);

    // Con una generación en curso, la cascada espera: las dos escribirían el mismo curso.
    const limite = Date.now() + esperaMaximaMs;
    while (await bd.generacion.count({ where: { proyectoId: curso.proyectoId, organizacionId, estado: { in: [...ACTIVAS] } } })) {
      if (Date.now() > limite) throw new Error('La generación del proyecto sigue en curso; la cascada se reintentará');
      await dormir(esperaMs);
    }

    const ctx: ContextoEtapa = {
      generacionId: '',
      organizacionId,
      proyectoId: curso.proyectoId,
      parametros: { regenerarVoz: { pantallaIds: [pantallaId] } },
      anteriores: {},
      bd,
      proveedor: 'cascada',
      ia: () => Promise.reject(new Error('La cascada no usa tareas de texto')),
      avance: async () => undefined,
      gastar: async () => undefined,
      comprobar: async () => undefined,
    };
    try {
      await voz(ctx);
      await boca(ctx);
      await subtitulos(ctx);
      return { estado: 'COMPLETADO' };
    } catch (e) {
      await bd.narracion.updateMany({ where: { cursoId: curso.id, pantallaId, idioma: 'es' }, data: { estado: 'ERROR' } });
      throw e;
    }
  };
}
