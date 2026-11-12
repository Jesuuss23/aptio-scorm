// HU-0802 · «✦ Traducir pendientes» (M08, IA-10 v2, CP-076, CP-077). Traduce al inglés solo los textos en estado
// Pendiente (RN-08-2: lo Revisado nunca se manda a la IA ni se toca), en lotes de hasta 60, con el glosario del cliente
// (RN-08-1). La salida se valida con Ajv y además con las rutas pedidas y `erroresGlosario`; si no cumple se reintenta
// con los errores (3 intentos). Cada lote se guarda entero o no se guarda: una versión nueva del curso con el inglés y
// sus filas en Traducido por IA. El trabajo es el TrabajoIA que creó la API; cada lote registra su propio consumo.
// HU-0803 · Desbordes (RN-08-3, CP-078): cada texto va con su límite de caracteres. Lo que se guarda y no cabe queda en
// Desborde con el inglés completo en el curso, y una segunda pasada de IA-10 propone la versión corta (`propuesta`).
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import {
  aplicarTraducciones, desborda, erroresLimite, erroresLote, type EstadoTraduccion, huellaTexto, LOTE_TRADUCCION, sincronizarFilas, TAREA_TRADUCIR, type TextoCurso,
  textosDe,
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
  const { crear, reiniciar, borrar, desbordar } = sincronizarFilas(textos, filas.map((f) => ({ ...f, estado: f.estado as EstadoTraduccion })));
  if (borrar.length) await bd.traduccion.deleteMany({ where: { id: { in: borrar } } });
  if (crear.length) await bd.traduccion.createMany({ data: crear.map((c) => ({ cursoId, idioma: IDIOMA, ...c })), skipDuplicates: true });
  for (const r of reiniciar) await bd.traduccion.update({ where: { id: r.id }, data: { textoOrigenHash: r.textoOrigenHash, estado: 'PENDIENTE', propuesta: null } });
  if (desbordar.length) await bd.traduccion.updateMany({ where: { id: { in: desbordar } }, data: { estado: 'DESBORDE' } });
}

export function crearTraductor({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function traducir(trabajo: TrabajoEnCola): Promise<{ traducidos: number; lotes: number; desbordes: number; propuestas: number }> {
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

      const contexto = { organizacionId, proyectoId: curso.proyectoId };
      const cursoId = curso.id;
      const variables = { idiomaDestino: IDIOMA, glosario, cliente: { nombre: curso.proyecto.cliente.nombre } };
      let traducidos = 0;
      let desbordes = 0;
      let propuestas = 0;
      /** Rutas cuya versión corta ya se pidió en este trabajo: no se piden dos veces. */
      const pedidas = new Set<string>();
      for (const [n, lote] of lotes.entries()) {
        const pedidos = lote.map((t) => ({ ruta: t.ruta, es: t.es }));
        const r = await tareaRegistrada<Salida>(
          bd, contexto, proveedor, TAREA_TRADUCIR,
          // Los textos salen del documento del cliente: van neutralizados dentro de <material_cliente>, con su límite.
          { ...variables, textos: paraPrompt(lote.map((t) => ({ ruta: t.ruta, texto: t.es, limite: t.limite }))) },
          { version: VERSION_PROMPT, validarExtra: (d) => erroresLote(pedidos, d as Salida, glosario) },
        );
        const guardado = await guardarLote(bd, curso.id, lote, r.datos.traducciones);
        traducidos += guardado.traducidos;
        desbordes += guardado.largos.length;
        propuestas += await proponerCortas(guardado.largos);
        const progreso = Math.round(((n + 1) / lotes.length) * 100);
        await trabajo.updateProgress(progreso);
        if (n + 1 < lotes.length) await emitir('EN_CURSO', progreso, `Lote ${n + 1} de ${lotes.length} traducido`);
      }
      // Los Desbordes que aún no tienen versión corta (de antes, o de una edición a mano) también se proponen.
      const sinPropuesta = await bd.traduccion.findMany({ where: { cursoId: curso.id, idioma: IDIOMA, estado: 'DESBORDE', propuesta: null }, select: { ruta: true } });
      const actual = textosDe((await bd.curso.findUniqueOrThrow({ where: { id: curso.id } })).documento);
      const porRuta = new Map(actual.map((t) => [t.ruta, t]));
      const previos = sinPropuesta.filter((f) => !pedidas.has(f.ruta)).map((f) => porRuta.get(f.ruta))
        .filter((t): t is TextoCurso => Boolean(t?.en && desborda(t.en, t.limite)));
      propuestas += await proponerCortas(previos);

      await bd.trabajoIA.update({ where: { id: trabajoId }, data: { estado: 'COMPLETADO' } });
      await trabajo.updateProgress(100);
      const resumen = traducidos ? `${traducidos} textos traducidos` : previos.length ? 'Versiones cortas propuestas' : 'No había textos pendientes';
      await emitir('COMPLETADO', 100, desbordes ? `${resumen}; ${desbordes} no caben en su espacio` : resumen);
      return { traducidos, lotes: lotes.length, desbordes: desbordes + previos.length, propuestas };

      /**
       * HU-0803 · Versión corta de los textos que no caben: IA-10 con el español, la traducción que no cupo y el límite;
       * la salida además debe caber. Se guarda en `propuesta` solo si el texto sigue en Desborde con el mismo inglés.
       * Si la IA no lo logra en 3 intentos, el Desborde queda sin propuesta y la traducción sigue guardada.
       */
      async function proponerCortas(largos: readonly TextoCurso[]): Promise<number> {
        let hechas = 0;
        for (const t of largos) pedidas.add(t.ruta);
        for (let i = 0; i < largos.length; i += LOTE_TRADUCCION) {
          const tramo = largos.slice(i, i + LOTE_TRADUCCION);
          const pedidos = tramo.map((t) => ({ ruta: t.ruta, es: t.es, limite: t.limite }));
          let salida: Salida;
          try {
            salida = (await tareaRegistrada<Salida>(
              bd, contexto, proveedor, TAREA_TRADUCIR,
              { ...variables, textos: paraPrompt(tramo.map((t) => ({ ruta: t.ruta, texto: t.es, limite: t.limite, actual: t.en }))) },
              { version: VERSION_PROMPT, validarExtra: (d) => [...erroresLote(pedidos, d as Salida, glosario), ...erroresLimite(pedidos, d as Salida)] },
            )).datos;
          } catch {
            continue;
          }
          for (const t of salida.traducciones) {
            const texto = tramo.find((x) => x.ruta === t.ruta);
            if (!texto?.en) continue;
            const hecho = await bd.traduccion.updateMany({
              where: { cursoId, idioma: IDIOMA, ruta: t.ruta, estado: 'DESBORDE', textoOrigenHash: huellaTexto(texto.es) },
              data: { propuesta: t.texto.trim() },
            });
            hechas += hecho.count;
          }
        }
        return hechas;
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}

/** La lista de textos para el prompt: JSON neutralizado, sin el límite cuando el texto no lo tiene. */
const paraPrompt = (textos: { ruta: string; texto: string; limite?: number | null | undefined; actual?: string | null | undefined }[]) =>
  neutralizar(JSON.stringify(textos.map(({ limite, actual, ...t }) => ({ ...t, ...(limite ? { limite } : {}), ...(actual ? { actual } : {}) })), null, 2));

/**
 * Guarda un lote en una transacción: aplica el inglés solo a los textos que siguen Pendientes y con el mismo español
 * que se mandó (si alguien los revisó o cambió mientras la IA traducía, gana la persona), crea la versión del curso y
 * pasa sus filas a Traducido por IA. Si otra escritura cambió la versión del curso, vuelve a leerlo y reintenta.
 */
async function guardarLote(bd: PrismaClient, cursoId: string, lote: readonly TextoCurso[], traducciones: Salida['traducciones']): Promise<{ traducidos: number; largos: TextoCurso[] }> {
  const enviados = new Map(lote.map((t) => [t.ruta, huellaTexto(t.es)]));
  for (let intento = 1; intento <= 3; intento++) {
    const r = await bd.$transaction(async (tx) => {
      const actual = await tx.curso.findUniqueOrThrow({ where: { id: cursoId } });
      const vigentes = new Map(textosDe(actual.documento).map((t) => [t.ruta, huellaTexto(t.es)]));
      const filas = await tx.traduccion.findMany({ where: { cursoId, idioma: IDIOMA, ruta: { in: [...enviados.keys()] } } });
      const siguen = new Set(filas.filter((f) => f.estado === 'PENDIENTE' && f.textoOrigenHash === enviados.get(f.ruta) && vigentes.get(f.ruta) === enviados.get(f.ruta)).map((f) => f.ruta));
      const cambios = Object.fromEntries(traducciones.filter((t) => siguen.has(t.ruta)).map((t) => [t.ruta, t.texto]));
      if (!Object.keys(cambios).length) return { traducidos: 0, largos: [] };
      const doc = aplicarTraducciones(actual.documento, cambios);
      const errores = erroresCurso(doc);
      if (errores.length) throw new Error(`La traducción deja el curso inválido: ${errores.slice(0, 3).join('; ')}`);
      const version = actual.version + 1;
      const hecho = await tx.curso.updateMany({ where: { id: cursoId, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version } });
      if (hecho.count === 0) return null;
      await tx.cursoVersion.create({ data: { cursoId, version, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'traducción' } });
      // RN-08-3: lo que no cabe en su componente queda en Desborde, con el inglés completo en el curso.
      const largos = lote.filter((t) => t.ruta in cambios && desborda(cambios[t.ruta], t.limite)).map((t) => ({ ...t, en: cambios[t.ruta]! }));
      const rutasLargas = largos.map((t) => t.ruta);
      await tx.traduccion.updateMany({ where: { cursoId, idioma: IDIOMA, ruta: { in: Object.keys(cambios).filter((r) => !rutasLargas.includes(r)) } }, data: { estado: 'TRADUCIDA_IA', propuesta: null } });
      if (largos.length) await tx.traduccion.updateMany({ where: { cursoId, idioma: IDIOMA, ruta: { in: rutasLargas } }, data: { estado: 'DESBORDE', propuesta: null } });
      return { traducidos: Object.keys(cambios).length, largos };
    });
    if (r !== null) return r;
  }
  throw new Error('El curso cambió tres veces mientras se guardaba la traducción: vuelve a intentarlo');
}
