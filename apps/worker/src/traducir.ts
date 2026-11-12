// HU-0802 · «✦ Traducir pendientes» (M08, IA-10 v2, CP-076, CP-077). Traduce al inglés solo los textos en estado
// Pendiente (RN-08-2: lo Revisado nunca se manda a la IA ni se toca), en lotes de hasta 60, con el glosario del cliente
// (RN-08-1). La salida se valida con Ajv y además con las rutas pedidas y `erroresGlosario`; si no cumple se reintenta
// con los errores (3 intentos). Cada lote se guarda entero o no se guarda: una versión nueva del curso con el inglés y
// sus filas en Traducido por IA. El trabajo es el TrabajoIA que creó la API; cada lote registra su propio consumo.
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import {
  aplicarTraducciones, erroresLote, type EstadoTraduccion, huellaTexto, LOTE_TRADUCCION, sincronizarFilas, TAREA_TRADUCIR, type TextoCurso, textosDe,
} from '@aptio/schema/traduccion';
import type { TerminoGlosario } from '@aptio/schema/voz';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';
const IDIOMA = 'en';

type Salida = { idiomaDestino: string; traducciones: { ruta: string; texto: string }[] };
type Cliente = PrismaClient | Prisma.TransactionClient;

/** Pone las filas de Traduccion al día con los textos del curso (lo mismo que hace la API al listar). */
export async function sincronizarTraducciones(bd: Cliente, cursoId: string, textos: readonly TextoCurso[]) {
  const filas = await bd.traduccion.findMany({ where: { cursoId, idioma: IDIOMA }, select: { id: true, ruta: true, textoOrigenHash: true, estado: true } });
  const { crear, reiniciar, borrar } = sincronizarFilas(textos, filas.map((f) => ({ ...f, estado: f.estado as EstadoTraduccion })));
  if (borrar.length) await bd.traduccion.deleteMany({ where: { id: { in: borrar } } });
  if (crear.length) await bd.traduccion.createMany({ data: crear.map((c) => ({ cursoId, idioma: IDIOMA, ...c })), skipDuplicates: true });
  for (const r of reiniciar) await bd.traduccion.update({ where: { id: r.id }, data: { textoOrigenHash: r.textoOrigenHash, estado: 'PENDIENTE' } });
}

export function crearTraductor({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function traducir(trabajo: TrabajoEnCola): Promise<{ traducidos: number; lotes: number }> {
    const { trabajoId, organizacionId, traduccion: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea: TAREA_TRADUCIR, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido) throw new Error('El trabajo no trae el curso a traducir');
      // El curso se busca con la organización del trabajo: nunca se traduce el de otra.
      const curso = await bd.curso.findFirst({
        where: { id: pedido.cursoId, organizacionId },
        include: { proyecto: { include: { cliente: { include: { glosario: { orderBy: { termino: 'asc' } } } } } } },
      });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      const glosario: TerminoGlosario[] = curso.proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir }));
      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'EN_CURSO' } });
      await emitir('EN_CURSO', 0);

      const textos = textosDe(curso.documento);
      await sincronizarTraducciones(bd, curso.id, textos);
      const pendientes = new Set((await bd.traduccion.findMany({ where: { cursoId: curso.id, idioma: IDIOMA, estado: 'PENDIENTE' }, select: { ruta: true } })).map((f) => f.ruta));
      const aTraducir = textos.filter((t) => pendientes.has(t.ruta));
      const lotes: TextoCurso[][] = [];
      for (let i = 0; i < aTraducir.length; i += LOTE_TRADUCCION) lotes.push(aTraducir.slice(i, i + LOTE_TRADUCCION));

      let traducidos = 0;
      for (const [n, lote] of lotes.entries()) {
        const pedidos = lote.map((t) => ({ ruta: t.ruta, es: t.es }));
        const r = await tareaRegistrada<Salida>(
          bd, { organizacionId, proyectoId: curso.proyectoId }, proveedor, TAREA_TRADUCIR,
          {
            idiomaDestino: IDIOMA,
            // Los textos salen del documento del cliente: van neutralizados dentro de <material_cliente>.
            textos: neutralizar(JSON.stringify(pedidos.map((p) => ({ ruta: p.ruta, texto: p.es })), null, 2)),
            glosario, cliente: { nombre: curso.proyecto.cliente.nombre },
          },
          { version: VERSION_PROMPT, validarExtra: (d) => erroresLote(pedidos, d as Salida, glosario) },
        );
        traducidos += await guardarLote(bd, curso.id, lote, r.datos.traducciones);
        const progreso = Math.round(((n + 1) / lotes.length) * 100);
        await trabajo.updateProgress(progreso);
        if (n + 1 < lotes.length) await emitir('EN_CURSO', progreso, `Lote ${n + 1} de ${lotes.length} traducido`);
      }
      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'COMPLETADO' } });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100, traducidos ? `${traducidos} textos traducidos` : 'No había textos pendientes');
      return { traducidos, lotes: lotes.length };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}

/**
 * Guarda un lote en una transacción: aplica el inglés solo a los textos que siguen Pendientes y con el mismo español
 * que se mandó (si alguien los revisó o cambió mientras la IA traducía, gana la persona), crea la versión del curso y
 * pasa sus filas a Traducido por IA. Si otra escritura cambió la versión del curso, vuelve a leerlo y reintenta.
 */
async function guardarLote(bd: PrismaClient, cursoId: string, lote: readonly TextoCurso[], traducciones: Salida['traducciones']): Promise<number> {
  const enviados = new Map(lote.map((t) => [t.ruta, huellaTexto(t.es)]));
  for (let intento = 1; intento <= 3; intento++) {
    const r = await bd.$transaction(async (tx) => {
      const actual = await tx.curso.findUniqueOrThrow({ where: { id: cursoId } });
      const vigentes = new Map(textosDe(actual.documento).map((t) => [t.ruta, huellaTexto(t.es)]));
      const filas = await tx.traduccion.findMany({ where: { cursoId, idioma: IDIOMA, ruta: { in: [...enviados.keys()] } } });
      const siguen = new Set(filas.filter((f) => f.estado === 'PENDIENTE' && f.textoOrigenHash === enviados.get(f.ruta) && vigentes.get(f.ruta) === enviados.get(f.ruta)).map((f) => f.ruta));
      const cambios = Object.fromEntries(traducciones.filter((t) => siguen.has(t.ruta)).map((t) => [t.ruta, t.texto]));
      if (!Object.keys(cambios).length) return 0;
      const doc = aplicarTraducciones(actual.documento, cambios);
      const errores = erroresCurso(doc);
      if (errores.length) throw new Error(`La traducción deja el curso inválido: ${errores.slice(0, 3).join('; ')}`);
      const version = actual.version + 1;
      const hecho = await tx.curso.updateMany({ where: { id: cursoId, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version } });
      if (hecho.count === 0) return null;
      await tx.cursoVersion.create({ data: { cursoId, version, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'traducción' } });
      await tx.traduccion.updateMany({ where: { cursoId, idioma: IDIOMA, ruta: { in: Object.keys(cambios) } }, data: { estado: 'TRADUCIDA_IA' } });
      return Object.keys(cambios).length;
    });
    if (r !== null) return r;
  }
  throw new Error('El curso cambió tres veces mientras se guardaba la traducción: vuelve a intentarlo');
}
