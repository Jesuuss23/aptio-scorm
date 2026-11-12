// HU-1104 · Patrón de navegación recomendado o creado con IA (IA-14 v2, CP-088, REQ-048): con el contexto del curso
// (duración, público, dispositivo, actividades, gamificación y estaciones) y, al crear, la descripción de la persona
// dentro de <material_cliente>, la IA propone un patrón. Se valida con Ajv y con `erroresPatron` (3 intentos en total;
// antes se recorta el nombre a 60 caracteres) y se guarda como `Propuesta` de tipo `patron` del curso entero con la
// versión base. El curso no cambia hasta que alguien la aplica. Cola ia, tarea IA-14.
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { contextoPatron, erroresPatron, type ModoPatron, MODOS_PATRON, normalizarPatron, type PropuestaPatron, TAREA_PATRON } from '@aptio/schema/navegacion';
import type { CursoDoc } from '@aptio/schema/revision';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';
export const TIPO_PATRON = 'patron';
const NOMBRE: Record<string, string> = {
  clasico: 'Clásico', historias: 'Historias', vertical: 'Desplazamiento vertical', mapa: 'Mapa de misiones',
  hub: 'Menú de temas', ramificado: 'Ramificado', inmersivo: 'Inmersivo', personalizado: 'Personalizado',
};

/** Lo que se guarda en `Propuesta.cambios`. */
export interface CambiosPatron {
  modo: ModoPatron;
  navegacion: PropuestaPatron['navegacion'];
  recomendado: PropuestaPatron['recomendado'];
  alternativa: PropuestaPatron['alternativa'];
  descripcion: string | null;
  huella: null;
}

export function crearPatrones({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function proponerPatron(trabajo: TrabajoEnCola): Promise<{ propuestaId: string }> {
    const { trabajoId, organizacionId, tarea, propuesta: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido) throw new Error('El trabajo no trae el pedido del patrón');
      const modo = pedido.modo as ModoPatron;
      if (!(MODOS_PATRON as readonly string[]).includes(modo)) throw new Error(`Modo de patrón desconocido: ${String(pedido.modo)}`);
      const descripcion = pedido.texto?.trim() ?? '';
      if (modo === 'crear' && !descripcion) throw new Error('Falta la descripción del patrón');
      // El curso se busca con la organización del trabajo: nunca se propone sobre el de otra.
      const curso = await bd.curso.findFirst({ where: { id: pedido.cursoId, organizacionId } });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      const doc = curso.documento as unknown as CursoDoc & { navegacion?: { patron?: string; patronPersonalizado?: { nombre?: string } } };
      // El proyecto aún no guarda el dispositivo principal: se usa el celular (decisión 10, SUP-105).
      const ctx = contextoPatron(doc);
      await emitir('EN_CURSO', 10);
      const actual = doc.navegacion?.patron ?? 'clasico';
      const r = await tareaRegistrada<PropuestaPatron>(
        bd, { organizacionId, proyectoId: curso.proyectoId, trabajoId }, proveedor, TAREA_PATRON,
        {
          tipo: modo,
          duracion: ctx.duracionMin,
          dispositivoPrincipal: ctx.dispositivoPrincipal,
          publico: neutralizar(ctx.publico),
          numeroPantallas: ctx.numeroPantallas,
          numeroActividades: ctx.numeroActividades,
          gamificacion: ctx.gamificacion,
          estaciones: ctx.estaciones,
          patronActual: actual === 'personalizado' ? `personalizado («${neutralizar(doc.navegacion?.patronPersonalizado?.nombre ?? '')}»)` : actual,
          // Lo que escribe la persona es texto libre: va neutralizado dentro de <material_cliente>.
          descripcion: neutralizar(descripcion),
        },
        { version: VERSION_PROMPT, preparar: normalizarPatron, validarExtra: (d) => erroresPatron(modo, d) },
      );
      await emitir('EN_CURSO', 90);
      const d = r.datos;
      const titulo = modo === 'crear'
        ? `Patrón nuevo: ${d.navegacion.patronPersonalizado!.nombre}`
        : `Recomendado: ${NOMBRE[d.recomendado.patron] ?? d.recomendado.patron}`;
      const cambios: CambiosPatron = { modo, navegacion: d.navegacion, recomendado: d.recomendado, alternativa: d.alternativa, descripcion: descripcion || null, huella: null };
      const p = await bd.propuesta.create({
        data: {
          cursoId: curso.id, pantallaId: null, tipo: TIPO_PATRON, titulo, descripcion: d.recomendado.motivo,
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
