// HU-0404 · Etapa 3 «Storyboard y guion» (IA-05 v2): por cada pantalla de la estructura, título, texto corto en pantalla,
// narración del personaje, visual, actividad y origen con su página. Más de 30 palabras en pantalla (o 45 de narración)
// no rechaza el guion: queda con advertencia para el diseñador (CP-040).
import { textoSeguro } from '@aptio/ai';
import {
  advertenciasDeLongitud, contarPalabras, type EstructuraCurso, type GuionCurso, type PantallaGuion, type PantallaEstructura, type ResumenMaterial,
} from '@aptio/schema/generacion';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';

export const VERSION_PROMPT = 'v2';
type SalidaIa = { capsulaId: string; pantallas: Omit<PantallaGuion, 'tipo' | 'palabras'>[] };
type Documento = ResumenMaterial['documentos'][number];

/** Supuesto SUP-27: sin personaje en el kit del cliente, la narración la dice una guía neutra. */
export const PERSONAJE_POR_DEFECTO = { nombre: 'Guía', rol: 'guía del curso' };

/**
 * Documento al que apunta un origen. Con un solo documento es ese, diga lo que diga la IA (el simulado trae el id del
 * caso LOTO); con varios, el id debe ser uno de ellos.
 */
function documentoDe(documentos: Documento[], id: string | undefined): Documento | undefined {
  return documentos.length === 1 ? documentos[0] : documentos.find((d) => d.materialId === id);
}

/** Reglas propias además del esquema (solo con un proveedor real: el simulado responde siempre el caso LOTO). */
export function revisarGuion(p: { capsulaId: string; pantallas: PantallaEstructura[]; documentos: Documento[] }) {
  return (datos: unknown): string[] => {
    const s = datos as SalidaIa;
    const errores: string[] = [];
    if (s.capsulaId !== p.capsulaId) errores.push(`capsulaId debe ser "${p.capsulaId}"`);
    const esperados = p.pantallas.map((x) => x.id);
    const recibidos = s.pantallas.map((x) => x.id);
    if (esperados.join() !== recibidos.join()) {
      errores.push(`Las pantallas deben ser exactamente ${esperados.join(', ')}, en ese orden (llegaron ${recibidos.join(', ')})`);
    }
    const porId = new Map(p.pantallas.map((x) => [x.id, x]));
    for (const x of s.pantallas) {
      const sugerida = porId.get(x.id)?.actividadSugerida;
      if (sugerida && x.actividad?.tipo !== sugerida) errores.push(`La pantalla ${x.id} debe llevar la actividad ${sugerida} que sugiere la estructura`);
      if (x.origen.tipo !== 'documento') continue;
      const d = documentoDe(p.documentos, x.origen.documentoId);
      if (!d) {
        errores.push(p.documentos.length
          ? `La pantalla ${x.id} cita un documento que no existe: ${x.origen.documentoId ?? '(sin id)'}`
          : `La pantalla ${x.id} no puede tener origen documento: el proyecto no tiene documentos`);
        continue;
      }
      const fuera = (x.origen.paginas ?? []).filter((n) => n < 1 || n > d.totalPaginas);
      if (fuera.length) errores.push(`La pantalla ${x.id} cita páginas que no existen en ${d.nombre}: ${fuera.join(', ')}`);
    }
    return errores;
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function textoGuion(g: GuionCurso): string {
  const pantallas = g.capsulas.reduce((n, c) => n + c.pantallas.length, 0);
  const base = `${plural(pantallas, 'pantalla', 'pantallas')} con texto en pantalla y narración`;
  const largas = (campo: string) => new Set(g.advertencias.filter((a) => a.campo === campo).map((a) => a.pantallaId)).size;
  const avisos = [
    largas('textoPantalla') ? `${plural(largas('textoPantalla'), 'pantalla supera', 'pantallas superan')} 30 palabras en pantalla` : '',
    largas('narracion') ? `${plural(largas('narracion'), 'narración supera', 'narraciones superan')} 45 palabras` : '',
  ].filter(Boolean);
  return avisos.length ? `${base} · ${avisos.join(' · ')}` : `${base} · todas dentro del límite de palabras`;
}

export const escribirGuion: EjecutorEtapa = async (ctx: ContextoEtapa) => {
  const estructura = ctx.anteriores.OBJETIVOS_ESTRUCTURA as EstructuraCurso | undefined;
  if (!estructura) throw new Error('Falta el resultado de la etapa 2 (Objetivos y estructura)');
  const resumen = (ctx.anteriores.RESUMEN_MATERIAL as ResumenMaterial | undefined) ?? { documentos: [], ideas: [] };
  const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
    where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
    include: { cliente: { include: { glosario: { orderBy: { termino: 'asc' } }, kit: true } } },
  });
  const { parametros } = ctx;
  const delKit = proyecto.cliente.kit?.personaje as { nombre?: string; rol?: string } | null | undefined;
  const personaje = { nombre: textoSeguro(delKit?.nombre ?? PERSONAJE_POR_DEFECTO.nombre), rol: textoSeguro(delKit?.rol ?? PERSONAJE_POR_DEFECTO.rol) };
  const tono = proyecto.tono ?? (typeof parametros.tono === 'string' ? parametros.tono : 'cercano');
  const publico = typeof parametros.publico === 'string' ? parametros.publico : proyecto.publico;
  const ideas = new Map(resumen.ideas.map((i) => [i.id, i]));

  const capsulas: GuionCurso['capsulas'] = [];
  for (const m of estructura.modulos) {
    for (const c of m.capsulas) {
      // Solo las ideas que usa la cápsula, con el documento al que pertenecen; el texto del cliente va neutralizado.
      const usadas = [...new Set(c.pantallas.flatMap((x) => x.fragmentoIds))].flatMap((id) => ideas.get(id) ?? []);
      const r = await ctx.ia<SalidaIa>('IA-05', {
        cliente: { nombre: proyecto.cliente.nombre },
        glosario: proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
        proyecto: { publico: publico ? textoSeguro(publico) : null },
        personaje, tono: textoSeguro(tono),
        capsula: { id: c.id },
        estructura: c.pantallas.map(({ paginas: _p, ...x }) => x),
        fragmentos: usadas.map((i) => `${i.id} · documento ${i.materialId} · p. ${i.paginas.join(', ')} · ${textoSeguro(i.texto)}`).join('\n'),
      }, {
        version: VERSION_PROMPT,
        ...(ctx.proveedor !== 'simulado' ? { validarExtra: revisarGuion({ capsulaId: c.id, pantallas: c.pantallas, documentos: resumen.documentos }) } : {}),
      });
      capsulas.push({
        id: c.id, moduloId: m.id, titulo: c.titulo,
        pantallas: r.datos.pantallas.map((x, i) => {
          // El origen apunta al material real con su archivo. Un origen documento sin documento (solo en modo simulado:
          // el real se rechaza en revisarGuion) no se puede trazar y queda como agregado por la IA.
          const d = x.origen.tipo === 'documento' ? documentoDe(resumen.documentos, x.origen.documentoId) : undefined;
          const origen = d ? { ...x.origen, documentoId: d.materialId, archivo: d.nombre } : x.origen.tipo === 'documento' ? { tipo: 'ia' as const, revisado: false } : x.origen;
          return {
            ...x,
            tipo: (c.pantallas.find((e) => e.id === x.id) ?? c.pantallas[i])?.tipo ?? 'contenido',
            origen,
            palabras: { textoPantalla: contarPalabras(x.textoPantalla), narracion: contarPalabras(x.narracion) },
          };
        }),
      });
    }
  }
  const guion: GuionCurso = { capsulas, advertencias: advertenciasDeLongitud(capsulas.flatMap((c) => c.pantallas)) };
  return { texto: textoGuion(guion), datos: guion };
};
