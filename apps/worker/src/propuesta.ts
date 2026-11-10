// HU-0504 · Propuestas de la IA (IA-16 v2, SUP-39): calcula un cambio a una pantalla del curso y lo guarda como
// `Propuesta`; el curso no cambia hasta que alguien la aplica. Cola ia, tarea IA-16; el trabajo es el TrabajoIA que
// creó la API. La salida se valida con Ajv y además se comprueba que el patch respete las rutas protegidas, se
// aplique y deje el curso válido; si no, se reintenta con los errores (3 intentos en total).
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import type { OperacionPatch } from '@aptio/schema/patch';
import { cursoConPropuesta, erroresRutas, huellaPantalla, pantallaParaPrompt, TAREA_PROPUESTA, type TipoPropuesta, type Variante } from '@aptio/schema/propuesta';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';

type Salida = { tipo: string; titulo: string; resumen: string; patch?: OperacionPatch[]; variantes?: (Variante & { campos: unknown })[] };

/** Reglas propias de IA-16 sobre una salida que ya validó contra el esquema. */
export function erroresPropuesta(doc: CursoDoc, pantallaId: string, tipo: TipoPropuesta, datos: unknown): string[] {
  const s = datos as Salida;
  if (s.tipo !== tipo) return [`El pedido es «${tipo}» y la respuesta es «${s.tipo}»`];
  if (tipo === 'variantes' ? !s.variantes : !s.patch) return [tipo === 'variantes' ? 'Entrega las 3 variantes' : 'Entrega un patch, no variantes'];
  const patches = s.variantes ? s.variantes.map((v) => v.patch) : [s.patch!];
  const errores: string[] = [];
  patches.forEach((patch, i) => {
    const donde = s.variantes ? `Variante ${i + 1}: ` : '';
    const rutas = erroresRutas(patch);
    if (rutas.length) {
      errores.push(...rutas.map((e) => donde + e));
      return;
    }
    try {
      errores.push(...erroresCurso(cursoConPropuesta(doc, pantallaId, patch)).slice(0, 10).map((e) => `${donde}el curso queda inválido: ${e}`));
    } catch (e) {
      errores.push(`${donde}el patch no se aplica: ${(e as Error).message}`);
    }
  });
  return errores;
}

export function crearPropuestas({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function proponer(trabajo: TrabajoEnCola): Promise<{ propuestaId: string }> {
    const { trabajoId, organizacionId, tarea, pantallaId, propuesta: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido || !pantallaId) throw new Error('El trabajo no trae el pedido de la propuesta');
      // El curso se busca con la organización del trabajo: nunca se propone sobre el de otra.
      const curso = await bd.curso.findFirst({
        where: { id: pedido.cursoId, organizacionId },
        include: { proyecto: { include: { cliente: { include: { kit: { include: { pantallasModelo: { where: { activa: true } } } } } } } } },
      });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      const doc = curso.documento as unknown as CursoDoc & { objetivos?: { id: string; texto?: { es?: string } }[] };
      const pantalla = pantallasDe(doc).find((p) => p.id === pantallaId);
      if (!pantalla) throw new Error(`El curso no tiene la pantalla ${pantallaId}`);
      await emitir('EN_CURSO', 0);
      const kit = curso.proyecto.cliente.kit;
      const disposiciones = [...new Set([...(kit?.pantallasModelo ?? []).map((m) => m.disposicion), ...pantallasDe(doc).map((p) => p.disposicion).filter(Boolean)])];
      const personaje = (kit?.personaje as { nombre?: string } | null)?.nombre ?? 'sin personaje';
      const objetivo = (doc.objetivos ?? []).filter((o) => pantalla.objetivoIds?.includes(o.id)).map((o) => o.texto?.es).filter(Boolean).join(' · ') || 'el de la cápsula';
      const tipo = pedido.tipo as TipoPropuesta;
      const r = await tareaRegistrada<Salida>(
        bd, { organizacionId, proyectoId: curso.proyectoId, trabajoId }, proveedor, TAREA_PROPUESTA,
        {
          // El texto de la pantalla sale del documento del cliente: va neutralizado dentro de <material_cliente>.
          pantalla: neutralizar(JSON.stringify(pantallaParaPrompt(pantalla), null, 2)), pantallaId: pantalla.id,
          versionBase: curso.version, objetivo, personaje,
          pedido: { tipo, texto: pedido.texto?.trim() || '(sin texto)' },
          kit: { nombre: curso.proyecto.cliente.nombre, disposiciones: disposiciones.join(', ') },
        },
        { version: VERSION_PROMPT, validarExtra: (d) => erroresPropuesta(doc, pantallaId, tipo, d) },
      );
      const cambios = {
        ...(r.datos.variantes ? { variantes: r.datos.variantes.map(({ nombre, disposicion, patch }) => ({ nombre, disposicion, patch })) } : { patch: r.datos.patch }),
        huella: huellaPantalla(doc, pantallaId),
      };
      const p = await bd.propuesta.create({
        data: {
          cursoId: curso.id, pantallaId, tipo, titulo: r.datos.titulo, descripcion: r.datos.resumen,
          cambios: cambios as unknown as Prisma.InputJsonValue, versionBase: curso.version, trabajoIAId: trabajoId,
        },
      });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100);
      return { propuestaId: p.id };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // tareaRegistrada ya guardó el error de la IA; esto cubre lo que falla antes (curso o pantalla inexistentes).
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId, estado: { not: 'ERROR' } }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
