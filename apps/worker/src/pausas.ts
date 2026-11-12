// HU-0903 · Pausas propuestas por la IA desde la transcripción (IA-09 v2, CP-082, REQ-027): con los segmentos de la
// transcripción del video (material del cliente, HU-0305) dentro de <material_cliente>, los objetivos y los marcadores
// que el video ya tiene, la IA devuelve los cambios de tema y los marcadores que propone. Se valida con Ajv y con
// `erroresPausas` (3 intentos en total) y se guarda como `Propuesta` de tipo `pausas-video` de la pantalla, con la huella
// de la pantalla y la versión base. El curso no cambia hasta que alguien aplica las elegidas. Cola ia, tarea IA-09.
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { type MarcadorVideo, mmss } from '@aptio/schema/marcadores';
import { duracionPropuesta, erroresPausas, normalizarPausas, type PropuestaPausas, type SegmentoPausas, TAREA_PAUSAS } from '@aptio/schema/pausas';
import { huellaPantalla } from '@aptio/schema/propuesta';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';
export const TIPO_PAUSAS = 'pausas-video';

/** Lo que se guarda en `Propuesta.cambios`. */
export interface CambiosPausas {
  bloqueId: string;
  duracionMs: number;
  cambiosTema: PropuestaPausas['cambiosTema'];
  marcadores: MarcadorVideo[];
  observaciones: string[];
  huella: string | null;
}

type BloqueVideo = { id: string; tipo: string; recursoId?: string; marcadores?: MarcadorVideo[] };

const describir = (m: MarcadorVideo) =>
  `${mmss(m.tiempoMs)} ${m.tipo}${m.pregunta ? `: ${m.pregunta.enunciado.es ?? ''}` : m.titulo?.es ? `: ${m.titulo.es}` : ''}`;

export function crearPausas({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function proponerPausas(trabajo: TrabajoEnCola): Promise<{ propuestaId: string }> {
    const { trabajoId, organizacionId, tarea, pantallaId, propuesta: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido || !pantallaId || !pedido.materialId || !pedido.bloqueId) throw new Error('El trabajo no trae la pantalla, el video y la transcripción');
      // El curso y el material se buscan con la organización del trabajo: nunca se propone sobre los de otra.
      const curso = await bd.curso.findFirst({ where: { id: pedido.cursoId, organizacionId } });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      const material = await bd.materialFuente.findFirst({ where: { id: pedido.materialId, proyectoId: curso.proyectoId, proyecto: { organizacionId } } });
      const segmentos = (material?.transcripcion ?? []) as unknown as SegmentoPausas[];
      if (!segmentos.length) throw new Error('El video no tiene transcripción');
      const doc = curso.documento as unknown as CursoDoc;
      const extra = curso.documento as unknown as { recursos?: { id: string; nombre?: string; duracionMs?: number }[]; objetivos?: { id: string; nivelBloom?: string; texto?: { es?: string } }[] };
      const pantalla = pantallasDe(doc).find((p) => p.id === pantallaId);
      const bloque = (pantalla?.bloques as unknown as BloqueVideo[] | undefined)?.find((b) => b.id === pedido.bloqueId && b.tipo === 'video');
      if (!pantalla || !bloque) throw new Error(`La pantalla ${pantallaId} no tiene el video ${pedido.bloqueId}`);
      const recurso = extra.recursos?.find((r) => r.id === bloque.recursoId);
      const duracion = duracionPropuesta(segmentos, recurso?.duracionMs);
      await emitir('EN_CURSO', 10);
      const r = await tareaRegistrada<PropuestaPausas>(
        bd, { organizacionId, proyectoId: curso.proyectoId, trabajoId }, proveedor, TAREA_PAUSAS,
        {
          nombreVideo: neutralizar(recurso?.nombre ?? pantalla.titulo.es ?? pantallaId),
          duracionMs: duracion,
          // La transcripción es texto del cliente: va neutralizada dentro de <material_cliente>.
          transcripcion: segmentos.map((s) => `[${Math.round(s.desde * 1000)}–${Math.round(s.hasta * 1000)} ms] ${neutralizar(s.texto)}`).join('\n'),
          objetivos: (extra.objetivos ?? []).map((o) => `${o.id} (${o.nivelBloom ?? ''}): ${o.texto?.es ?? ''}`).join('; ') || 'sin objetivos',
          marcadoresActuales: (bloque.marcadores ?? []).map(describir).join('; ') || 'ninguno',
        },
        {
          version: VERSION_PROMPT,
          preparar: (d) => normalizarPausas(d as PropuestaPausas),
          validarExtra: (d) => erroresPausas(d as PropuestaPausas, segmentos, duracion),
        },
      );
      await emitir('EN_CURSO', 90);
      const d = r.datos;
      const cambios: CambiosPausas = {
        bloqueId: bloque.id, duracionMs: duracion, cambiosTema: d.cambiosTema, marcadores: d.marcadores, observaciones: d.observaciones ?? [],
        huella: huellaPantalla(doc, pantallaId),
      };
      const p = await bd.propuesta.create({
        data: {
          cursoId: curso.id, pantallaId, tipo: TIPO_PAUSAS,
          titulo: `${d.marcadores.length} pausas propuestas desde la transcripción`,
          descripcion: `${d.cambiosTema.length} cambios de tema: ${d.cambiosTema.map((c) => `${c.tema} (${mmss(c.tiempoMs)})`).join(', ')}.`,
          cambios: cambios as unknown as Prisma.InputJsonValue, versionBase: curso.version, trabajoIAId: trabajoId,
        },
      });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100);
      return { propuestaId: p.id };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId, estado: { not: 'ERROR' } }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
