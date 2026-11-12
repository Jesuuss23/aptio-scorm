// HU-0505 · Control de calidad (M05, IA-12 v2, CP-054). Primero recalcula las reglas (accesibilidad, longitud por
// idioma, alineación básica y faltantes, `@aptio/schema/calidad`); después manda la cápsula a IA-12 por lotes de 10
// pantallas, con los textos neutralizados dentro de <material_cliente> y las observaciones de reglas para que no las
// repita. La salida se valida con Ajv (3 intentos). Se guardan como mucho 120 observaciones de IA: una corrida nueva
// reemplaza las de IA abiertas y no vuelve a crear las que una persona descartó. Ninguna de IA bloquea la aprobación.
// Corre en la etapa 10 del generador (ADR-008) y con «✦ Revisar con IA» en Revisión (trabajo IA-12 de la cola ia).
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import { type PrismaClient, recalcularReglas } from '@aptio/db';
import {
  type CategoriaObservacion, LOTE_CALIDAD, type ObservacionRegla, severidadDeGravedad, TAREA_CALIDAD, tipoDeCategoria, TOPE_OBSERVACIONES_IA,
} from '@aptio/schema/calidad';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import { textosDe } from '@aptio/schema/traduccion';
import type { Redis } from 'ioredis';
import type { EjecutorEtapa } from './generar.js';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';

export interface ObservacionIA {
  id: string;
  pantallaId: string;
  tipo: CategoriaObservacion;
  gravedad: 'alta' | 'media' | 'baja';
  mensaje: string;
  sugerencia?: string;
  ruta?: string;
}
export interface SalidaCalidad {
  observaciones: ObservacionIA[];
  resumen: string;
}
export interface ResultadoCalidad {
  reglas: number;
  ia: number;
  lotes: number;
  /** Se llegó al tope de observaciones de IA: las demás no se guardaron. */
  tope: boolean;
}

/** Lo que IA-12 lee de cada pantalla: sus textos (con su ruta, en español y en inglés) y sus objetivos. */
function pantallasParaPrompt(doc: CursoDoc, ids: readonly string[]) {
  const textos = textosDe(doc);
  const porId = new Map(pantallasDe(doc).map((p) => [p.id, p]));
  return ids.map((id) => {
    const p = porId.get(id)!;
    return {
      id, tipo: p.tipo, objetivoIds: p.objetivoIds ?? [],
      textos: textos.filter((t) => t.pantallaId === id).map((t) => ({ ruta: t.ruta, es: t.es, ...(t.en ? { en: t.en } : {}) })),
    };
  });
}

const clave = (pantallaId: string | null, mensaje: string) => `${pantallaId ?? ''}|${mensaje.trim()}`;

/**
 * Revisa un curso: reglas y luego IA-12 por lotes. `llamar` ejecuta IA-12 (registrada en TrabajoIA por quien llama) y
 * `alLote` avisa el avance. Si una llamada falla, no se guarda ninguna observación de IA (las reglas sí quedan al día).
 */
export async function revisarCurso(
  bd: PrismaClient,
  cursoId: string,
  llamar: (variables: Record<string, unknown>) => Promise<SalidaCalidad>,
  alLote: (hechos: number, total: number) => Promise<void> = async () => undefined,
): Promise<ResultadoCalidad> {
  const curso = await bd.curso.findUniqueOrThrow({
    where: { id: cursoId },
    include: { proyecto: { include: { cliente: { include: { glosario: { orderBy: { termino: 'asc' } } } } } } },
  });
  const doc = curso.documento as unknown as CursoDoc;
  const objetivos = ((curso.documento as { objetivos?: { id: string; texto: { es?: string }; nivelBloom?: string }[] }).objetivos ?? []);
  const reglas: ObservacionRegla[] = await bd.$transaction((tx) => recalcularReglas(tx, cursoId, curso.documento));

  const ids = pantallasDe(doc).map((p) => p.id);
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += LOTE_CALIDAD) lotes.push(ids.slice(i, i + LOTE_CALIDAD));
  const descartadas = new Set((await bd.observacion.findMany({ where: { cursoId, origen: 'ia', resuelta: true }, select: { pantallaId: true, mensaje: true } }))
    .map((o) => clave(o.pantallaId, o.mensaje)));
  // Lo que las reglas ya marcaron en una pantalla no se repite con otra palabra.
  const deReglas = new Set(reglas.map((o) => `${o.pantallaId ?? ''}|${o.categoria}`));
  const variables = {
    cliente: { nombre: curso.proyecto.cliente.nombre },
    glosario: curso.proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
    objetivos: JSON.stringify(objetivos.map((o) => ({ id: o.id, texto: o.texto.es, nivelBloom: o.nivelBloom }))),
  };

  const nuevas: (ObservacionIA & { sugerencia?: string })[] = [];
  const vistas = new Set<string>();
  let tope = false;
  for (const [n, lote] of lotes.entries()) {
    const enLote = new Set(lote);
    const salida = await llamar({
      ...variables,
      // Los textos salen del documento del cliente: van neutralizados dentro de <material_cliente>.
      pantallas: neutralizar(JSON.stringify(pantallasParaPrompt(doc, lote), null, 2)),
      observacionesReglas: JSON.stringify(reglas.filter((o) => o.pantallaId && enLote.has(o.pantallaId)).map((o) => ({ pantallaId: o.pantallaId, categoria: o.categoria, mensaje: o.mensaje }))),
    });
    for (const o of salida.observaciones) {
      const k = clave(o.pantallaId, o.mensaje);
      if (!enLote.has(o.pantallaId) || deReglas.has(`${o.pantallaId}|${o.tipo}`) || descartadas.has(k) || vistas.has(k)) continue;
      if (nuevas.length >= TOPE_OBSERVACIONES_IA) {
        tope = true;
        break;
      }
      vistas.add(k);
      nuevas.push(o);
    }
    await alLote(n + 1, lotes.length);
  }

  await bd.$transaction(async (tx) => {
    await tx.observacion.deleteMany({ where: { cursoId, origen: 'ia', resuelta: false } });
    if (nuevas.length) {
      await tx.observacion.createMany({
        data: nuevas.map((o) => ({
          cursoId, pantallaId: o.pantallaId, tipo: tipoDeCategoria(o.tipo), severidad: severidadDeGravedad(o.gravedad), categoria: o.tipo,
          mensaje: o.mensaje.trim(), sugerencia: o.sugerencia?.trim() || null, ruta: o.ruta ?? null, origen: 'ia',
        })),
      });
    }
  });
  return { reglas: reglas.length, ia: nuevas.length, lotes: lotes.length, tope };
}

/** Resumen legible del resultado (etapa 10 y evento del trabajo). */
export function textoCalidad(r: ResultadoCalidad): string {
  const ia = r.ia === 1 ? '1 observación de la IA' : `${r.ia} observaciones de la IA`;
  const reglas = r.reglas === 1 ? '1 de reglas' : `${r.reglas} de reglas`;
  return `${ia} · ${reglas}${r.tope ? ` · se llegó al tope de ${TOPE_OBSERVACIONES_IA}: revisa estas y vuelve a correr` : ''}`;
}

/** Etapa 10 del generador: el control de calidad del curso que dejó la etapa 4, con la IA de la generación. */
export const controlCalidad: EjecutorEtapa = async (ctx) => {
  const curso = await ctx.bd.curso.findUnique({ where: { proyectoId: ctx.proyectoId }, select: { id: true } });
  if (!curso) throw new Error('La etapa 4 (Pantallas con el kit) debe terminar antes');
  const r = await revisarCurso(
    ctx.bd, curso.id,
    async (variables) => (await ctx.ia<SalidaCalidad>(TAREA_CALIDAD, variables, { version: VERSION_PROMPT })).datos,
    (hechos, total) => (hechos < total ? ctx.avance(`Lote ${hechos} de ${total} revisado`, { lotes: hechos }) : Promise.resolve()),
  );
  return { texto: textoCalidad(r), datos: r };
};

/** «✦ Revisar con IA» (trabajo IA-12 de la cola ia): el TrabajoIA lo creó la API; cada lote registra su consumo. */
export function crearRevisorCalidad({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function revisar(trabajo: TrabajoEnCola): Promise<ResultadoCalidad> {
    const { trabajoId, organizacionId, calidad: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea: TAREA_CALIDAD, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido) throw new Error('El trabajo no trae el curso a revisar');
      // El curso se busca con la organización del trabajo: nunca se revisa el de otra.
      const curso = await bd.curso.findFirst({ where: { id: pedido.cursoId, organizacionId }, select: { id: true, proyectoId: true } });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'EN_CURSO' } });
      await emitir('EN_CURSO', 0);
      const contexto = { organizacionId, proyectoId: curso.proyectoId };
      const r = await revisarCurso(
        bd, curso.id,
        async (variables) => (await tareaRegistrada<SalidaCalidad>(bd, contexto, proveedor, TAREA_CALIDAD, variables, { version: VERSION_PROMPT })).datos,
        async (hechos, total) => {
          const progreso = Math.round((hechos / total) * 100);
          await trabajo.updateProgress(progreso);
          if (hechos < total) await emitir('EN_CURSO', progreso, `Lote ${hechos} de ${total} revisado`);
        },
      );
      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'COMPLETADO' } });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100, textoCalidad(r));
      return r;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
