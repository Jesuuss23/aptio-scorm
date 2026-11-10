// HU-0401 y HU-0408 · Orquestador de la generación (cola ia, tarea GENERAR): corre las 11 etapas en orden, salta las
// terminadas (continuar no repite trabajo), revisa la cancelación entre etapas y publica cada cambio por SSE.
// Un error deja la etapa y la generación en ERROR sin relanzar: BullMQ no la reintenta sola, se continúa a mano.
import { type ProveedorTexto, type ResultadoTarea, SalidaNoValida } from '@aptio/ai';
import { type EstadoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { DETALLE_PROXIMAMENTE, ETAPAS, type Etapa, TAREA_GENERAR } from '@aptio/schema/generacion';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export interface ContextoEtapa {
  generacionId: string;
  organizacionId: string;
  proyectoId: string;
  parametros: Record<string, unknown>;
  /** Datos guardados por las etapas ya terminadas de esta generación. */
  anteriores: Partial<Record<Etapa, unknown>>;
  bd: PrismaClient;
  /** Nombre del proveedor de texto (`simulado` responde siempre el caso LOTO). */
  proveedor: string;
  /**
   * Ejecuta una tarea de IA registrada en TrabajoIA y suma su costo a la etapa. Antes de cada llamada revisa si
   * cancelaron la generación: así una etapa larga no sigue gastando (lanza GeneracionCancelada).
   */
  ia<T = unknown>(tarea: string, variables: Record<string, unknown>, opciones?: Parameters<typeof tareaRegistrada>[5]): Promise<ResultadoTarea<T>>;
  /**
   * Guarda un resultado parcial mientras la etapa corre y lo avisa por SSE (CP-043: las pantallas listas se ven sin
   * esperar al resto). Si la etapa ya no está en curso no guarda nada.
   */
  avance(texto: string, datos: unknown): Promise<void>;
  /**
   * Para las llamadas que no son de texto (voz, imagen): revisa si cancelaron la generación antes de gastar y suma su
   * costo a la etapa (lanza GeneracionCancelada si ya no está en curso).
   */
  gastar(usd: number): Promise<void>;
  /** Lanza GeneracionCancelada si la etapa ya no está en curso. */
  comprobar(): Promise<void>;
}

export interface ResultadoEtapa {
  /** Resumen legible para la pantalla de avance. */
  texto: string;
  /** Lo que reciben las etapas siguientes (`anteriores`). */
  datos?: unknown;
}

export class GeneracionCancelada extends Error {
  constructor() {
    super('La generación se canceló');
  }
}

export type EjecutorEtapa = (ctx: ContextoEtapa) => Promise<ResultadoEtapa>;

export interface DependenciasGenerador {
  bd: PrismaClient;
  redis: Redis;
  proveedor: ProveedorTexto;
  ejecutores: Partial<Record<Etapa, EjecutorEtapa>>;
}

const redondear = (usd: number) => Math.round(usd * 10_000) / 10_000;

export function crearGenerador({ bd, redis, proveedor, ejecutores }: DependenciasGenerador) {
  return async function generar(trabajo: TrabajoEnCola): Promise<{ estado: EstadoTrabajo }> {
    const { trabajoId: generacionId, organizacionId } = trabajo.data;
    // La generación se busca con la organización del trabajo: nunca se procesa la de otra.
    const g = await bd.generacion.findFirst({ where: { id: generacionId, organizacionId }, include: { etapas: { orderBy: { orden: 'asc' } } } });
    if (!g) throw new Error(`Generación ${generacionId} no existe en la organización`);

    const avance = async () => {
      const hechas = await bd.generacionEtapa.count({ where: { generacionId, estado: 'COMPLETADO' } });
      return Math.round((hechas / ETAPAS.length) * 100);
    };
    const emitir = async (tarea: string, estado: EstadoTrabajo, mensaje?: string) =>
      publicarEvento(redis, {
        tipo: 'estado', trabajoId: generacionId, organizacionId, cola: 'ia', tarea, estado, progreso: await avance(),
        ...(mensaje ? { mensaje } : {}), en: new Date().toISOString(),
      });

    // Solo arranca si sigue activa: si la cancelaron antes de empezar, no se hace nada. EN_CURSO cubre el reintento de
    // BullMQ cuando el worker se cayó a mitad.
    const arranque = await bd.generacion.updateMany({ where: { id: generacionId, estado: { in: ['EN_COLA', 'EN_CURSO'] } }, data: { estado: 'EN_CURSO' } });
    if (!arranque.count) return { estado: g.estado };
    await emitir(TAREA_GENERAR, 'EN_CURSO');

    /** La etapa cancelada a mitad no guarda su resultado, pero sí lo que ya costó. */
    const cancelada = async (etapaId: string, costo: number) => {
      await bd.generacionEtapa.update({ where: { id: etapaId }, data: { fin: new Date(), costoUsd: costo } });
      return { estado: 'CANCELADO' as const };
    };

    const anteriores: Partial<Record<Etapa, unknown>> = {};
    for (const e of g.etapas) {
      if (e.estado === 'COMPLETADO') anteriores[e.etapa as Etapa] = (e.detalle as { datos?: unknown } | null)?.datos;
    }

    for (const e of g.etapas) {
      if (e.estado === 'COMPLETADO') continue;
      const etapa = e.etapa as Etapa;
      const ejecutor = ejecutores[etapa];
      if (!ejecutor) {
        // Una etapa sin ejecutor (sprint siguiente) queda en cola con el aviso. Si alguna posterior ya existe, la
        // generación sigue con ella (SUP-24: Ilustraciones, del S9, no frena la voz del S4); si no, termina aquí.
        const siguen = g.etapas.some((x) => x.orden > e.orden && x.estado !== 'COMPLETADO' && ejecutores[x.etapa as Etapa]);
        const pendientes = siguen ? [e.id] : g.etapas.filter((x) => x.orden >= e.orden && x.estado !== 'COMPLETADO').map((x) => x.id);
        await bd.generacionEtapa.updateMany({ where: { id: { in: pendientes } }, data: { estado: 'EN_COLA', detalle: { texto: DETALLE_PROXIMAMENTE } } });
        if (siguen) continue;
        break;
      }

      const empezo = await bd.generacionEtapa.updateMany({ where: { id: e.id, estado: { in: ['EN_COLA', 'EN_CURSO'] } }, data: { estado: 'EN_CURSO', inicio: new Date(), fin: null } });
      if (!empezo.count) return { estado: 'CANCELADO' };
      await emitir(etapa, 'EN_CURSO');

      let costo = 0;
      const comprobar = async () => {
        const actual = await bd.generacionEtapa.findUnique({ where: { id: e.id }, select: { estado: true } });
        if (actual?.estado !== 'EN_CURSO') throw new GeneracionCancelada();
      };
      const ctx: ContextoEtapa = {
        generacionId, organizacionId, proyectoId: g.proyectoId, parametros: g.parametros as Record<string, unknown>, anteriores, bd,
        proveedor: proveedor.nombre,
        comprobar,
        async gastar(usd: number) {
          costo = redondear(costo + usd);
          await comprobar();
        },
        async ia<T = unknown>(tarea: string, variables: Record<string, unknown>, opciones?: Parameters<typeof tareaRegistrada>[5]) {
          await comprobar();
          try {
            const r = await tareaRegistrada<T>(bd, { organizacionId, proyectoId: g.proyectoId, generacionId }, proveedor, tarea, variables, opciones);
            costo = redondear(costo + r.costoUsd);
            return r;
          } catch (err) {
            if (err instanceof SalidaNoValida) costo = redondear(costo + err.registro.costoUsd);
            throw err;
          }
        },
        async avance(texto: string, datos: unknown) {
          const r = await bd.generacionEtapa.updateMany({
            where: { id: e.id, estado: 'EN_CURSO' }, data: { costoUsd: costo, detalle: { texto, datos } as Prisma.InputJsonValue },
          });
          if (r.count) await emitir(etapa, 'EN_CURSO', texto);
        },
      };

      let resultado: ResultadoEtapa | undefined;
      let fallo: string | undefined;
      try {
        resultado = await ejecutor(ctx);
      } catch (err) {
        fallo = err instanceof Error ? err.message : String(err);
      }
      // El costo se paga aunque la etapa falle o la cancelen mientras corría.
      if (costo > 0) await bd.generacion.update({ where: { id: generacionId }, data: { costoUsd: { increment: costo } } });

      if (fallo !== undefined) {
        const marcada = await bd.generacionEtapa.updateMany({
          where: { id: e.id, estado: 'EN_CURSO' }, data: { estado: 'ERROR', fin: new Date(), costoUsd: costo, detalle: { texto: fallo } },
        });
        if (!marcada.count) return cancelada(e.id, costo);
        await bd.generacion.updateMany({ where: { id: generacionId, estado: 'EN_CURSO' }, data: { estado: 'ERROR', terminadoEn: new Date() } });
        await bd.proyecto.update({ where: { id: g.proyectoId }, data: { estado: 'BORRADOR' } });
        await emitir(etapa, 'ERROR', fallo);
        await emitir(TAREA_GENERAR, 'ERROR', fallo);
        return { estado: 'ERROR' };
      }

      // CP-045: si la cancelaron mientras corría, la API ya marcó la etapa CANCELADO y su resultado no se guarda.
      const detalle = { texto: resultado!.texto, ...(resultado!.datos !== undefined ? { datos: resultado!.datos } : {}) } as Prisma.InputJsonValue;
      const guardada = await bd.generacionEtapa.updateMany({
        where: { id: e.id, estado: 'EN_CURSO' }, data: { estado: 'COMPLETADO', fin: new Date(), costoUsd: costo, detalle },
      });
      if (!guardada.count) return cancelada(e.id, costo);
      anteriores[etapa] = resultado!.datos;
      await emitir(etapa, 'COMPLETADO');
      await trabajo.updateProgress(await avance());
    }

    const fin = await bd.generacion.updateMany({ where: { id: generacionId, estado: 'EN_CURSO' }, data: { estado: 'COMPLETADO', terminadoEn: new Date() } });
    if (!fin.count) return { estado: 'CANCELADO' };
    // El proyecto pasa a revisión solo con las 11 etapas hechas; si faltan etapas por habilitar, vuelve a borrador.
    const completas = (await avance()) === 100;
    await bd.proyecto.update({ where: { id: g.proyectoId }, data: { estado: completas ? 'REVISION' : 'BORRADOR' } });
    await emitir(TAREA_GENERAR, 'COMPLETADO');
    return { estado: 'COMPLETADO' };
  };
}
