// HU-0402 · Etapa 1 «Leer y resumir el material» (IA-01, IA-02, IA-03 e IA-13): mapa de temas por documento, propuesta
// conservar/complementario/omitir, ideas clave con su página de origen y acta de temas omitidos con motivo (CP-038).
// El material del cliente va escapado dentro de <material_cliente> (HU-1402); nada de lo que diga se obedece.
import { type PaginaMaterial, paginasParaPrompt, textoSeguro } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import type { ActaOmitidos, DecisionTema, IdeaClave, ResumenMaterial, TemaMaterial } from '@aptio/schema/generacion';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';

interface TemaIa {
  id: string;
  titulo: string;
  resumen: string;
  paginas: number[];
  peso: number;
  tipoContenido: string;
}
interface MapaIa {
  documentoId: string;
  totalPaginas: number;
  temas: TemaIa[];
  observaciones?: string[];
}
interface ClasificacionIa {
  metaMinutos: number;
  minutosEstimados: number;
  clasificacion: { temaId: string; decision: DecisionTema; motivo: string }[];
  observaciones?: string[];
}
interface ResumenIa {
  temaId: string;
  fragmentos: Omit<IdeaClave, 'temaId' | 'materialId' | 'archivo'>[];
}

/** Resúmenes por tema en paralelo, sin saturar al proveedor. */
const PARALELO = 4;

// ---------- Reglas propias además del esquema (solo con un proveedor real: el simulado responde siempre el caso LOTO) ----------

/** CP-038: cada tema cita páginas que existen en el documento. */
export function revisarMapa(documentoId: string, paginas: Set<number>) {
  return (datos: unknown): string[] => {
    const m = datos as MapaIa;
    const errores: string[] = [];
    if (m.documentoId !== documentoId) errores.push(`documentoId debe ser "${documentoId}"`);
    const ids = new Set<string>();
    for (const t of m.temas) {
      if (ids.has(t.id)) errores.push(`El id de tema ${t.id} está repetido`);
      ids.add(t.id);
      const fuera = t.paginas.filter((p) => !paginas.has(p));
      if (fuera.length) errores.push(`El tema ${t.id} cita páginas que no existen en el documento: ${fuera.join(', ')}`);
    }
    return errores;
  };
}

/** Cada tema se clasifica una vez y ninguno de peso 5 se omite. */
export function revisarClasificacion(temas: TemaIa[]) {
  return (datos: unknown): string[] => {
    const c = datos as ClasificacionIa;
    const errores: string[] = [];
    const vistos = new Map<string, number>();
    for (const x of c.clasificacion) vistos.set(x.temaId, (vistos.get(x.temaId) ?? 0) + 1);
    for (const t of temas) {
      const n = vistos.get(t.id) ?? 0;
      if (n !== 1) errores.push(n ? `El tema ${t.id} está clasificado ${n} veces` : `Falta clasificar el tema ${t.id}`);
      if (t.peso === 5 && c.clasificacion.some((x) => x.temaId === t.id && x.decision === 'omitir')) errores.push(`El tema ${t.id} tiene peso 5 y no se puede omitir`);
    }
    for (const id of vistos.keys()) if (!temas.some((t) => t.id === id)) errores.push(`El tema ${id} no está en el mapa`);
    return errores;
  };
}

/** Las ideas de un tema salen de sus páginas. */
export function revisarResumen(tema: TemaIa) {
  return (datos: unknown): string[] => {
    const r = datos as ResumenIa;
    const errores: string[] = [];
    if (r.temaId !== tema.id) errores.push(`temaId debe ser "${tema.id}"`);
    for (const f of r.fragmentos) {
      const fuera = f.paginas.filter((p) => !tema.paginas.includes(p));
      if (fuera.length) errores.push(`El fragmento ${f.id} cita páginas fuera del tema (${tema.paginas.join(', ')}): ${fuera.join(', ')}`);
    }
    return errores;
  };
}

/** El acta lista exactamente los temas omitidos. */
export function revisarActa(omitidos: string[]) {
  return (datos: unknown): string[] => {
    const ids = (datos as ActaOmitidos).temas.map((t) => t.temaId);
    const faltan = omitidos.filter((id) => !ids.includes(id));
    const sobran = ids.filter((id) => !omitidos.includes(id));
    return [
      ...(faltan.length ? [`Faltan en el acta los temas omitidos ${faltan.join(', ')}`] : []),
      ...(sobran.length ? [`El acta incluye temas que no se omitieron: ${sobran.join(', ')}`] : []),
    ];
  };
}

// ---------- Ejecutor ----------

async function enParalelo<E, R>(lista: E[], n: number, hacer: (e: E) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array<R>(lista.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await hacer(lista[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabajador));
  return salida;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const resumirMaterial: EjecutorEtapa = async (ctx: ContextoEtapa) => {
  const { bd, parametros } = ctx;
  const estricto = ctx.proveedor !== 'simulado';
  const proyecto = await bd.proyecto.findFirstOrThrow({
    where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
    include: { cliente: { include: { glosario: { orderBy: { termino: 'asc' } } } } },
  });
  const materiales = await bd.materialFuente.findMany({ where: { proyectoId: proyecto.id, estado: 'listo' }, orderBy: { creadoEn: 'asc' } });
  const recursos = await bd.recurso.findMany({
    where: { id: { in: materiales.flatMap((m) => (m.recursoId ? [m.recursoId] : [])) }, organizacionId: ctx.organizacionId },
    select: { id: true, nombre: true },
  });
  const documentos = materiales
    .map((m) => ({ m, paginas: (m.paginas as PaginaMaterial[] | null) ?? [], nombre: recursos.find((r) => r.id === m.recursoId)?.nombre ?? 'documento' }))
    .filter((d) => d.paginas.length);
  const temaEscrito = materiales.filter((m) => m.tipo === 'TEMA' && m.tema).map((m) => m.tema!).join(' · ') || null;

  const pantallas = typeof parametros.pantallas === 'number' ? parametros.pantallas : null;
  const metaMinutos = pantallas ? Math.max(3, Math.round(pantallas / 2)) : null;
  const comunes = {
    cliente: { nombre: proyecto.cliente.nombre },
    glosario: proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
  };
  const datosProyecto = {
    titulo: textoSeguro(proyecto.nombre),
    tema: textoSeguro(temaEscrito ? `${proyecto.nombre} (${temaEscrito})` : proyecto.nombre),
    publico: typeof parametros.publico === 'string' ? textoSeguro(parametros.publico) : null,
    metaMinutos, objetivos: null,
  };

  if (!documentos.length) {
    const vacio: ResumenMaterial = { tema: temaEscrito, documentos: [], temas: [], metaMinutos, minutosEstimados: null, ideas: [], acta: null, observaciones: [] };
    return { texto: `Sin documento: la estructura parte del tema «${temaEscrito ?? proyecto.nombre}»`, datos: vacio };
  }

  // 1 · IA-01: mapa de temas de cada documento. Con varios documentos, los ids llevan el prefijo del documento.
  const observaciones: string[] = [];
  const temas: (TemaIa & { materialId: string })[] = [];
  for (const [k, d] of documentos.entries()) {
    const { rango, texto } = paginasParaPrompt(d.paginas);
    const r = await ctx.ia<MapaIa>('IA-01', {
      ...comunes, proyecto: datosProyecto,
      documento: { id: d.m.id, nombre: textoSeguro(d.nombre), rango, texto_por_pagina: texto },
    }, estricto ? { validarExtra: revisarMapa(d.m.id, new Set(d.paginas.map((p) => p.n))) } : {});
    const prefijo = documentos.length > 1 ? `d${k + 1}-` : '';
    temas.push(...r.datos.temas.map((t) => ({ ...t, id: `${prefijo}${t.id}`, materialId: d.m.id })));
    observaciones.push(...(r.datos.observaciones ?? []));
  }

  // 2 · IA-02: qué entra en la cápsula, con motivo.
  const mapa = temas.map(({ materialId: _m, ...t }) => t);
  const c = await ctx.ia<ClasificacionIa>('IA-02', { ...comunes, proyecto: datosProyecto, mapaTemas: mapa }, estricto ? { validarExtra: revisarClasificacion(mapa) } : {});
  observaciones.push(...(c.datos.observaciones ?? []));
  const clasificados: TemaMaterial[] = temas.map((t) => {
    const x = c.datos.clasificacion.find((y) => y.temaId === t.id);
    return {
      id: t.id, materialId: t.materialId, titulo: t.titulo, resumen: t.resumen, paginas: t.paginas, peso: t.peso, tipoContenido: t.tipoContenido,
      decision: x?.decision ?? 'conservar', motivo: x?.motivo ?? 'Sin clasificar: se conserva por prudencia',
    };
  });

  // 3 · IA-03: ideas clave de cada tema conservado, solo con las páginas del tema.
  const conservados = clasificados.filter((t) => t.decision === 'conservar');
  const resumenes = await enParalelo(conservados, PARALELO, async (t) => {
    const d = documentos.find((x) => x.m.id === t.materialId)!;
    const { rango, texto } = paginasParaPrompt(d.paginas.filter((p) => t.paginas.includes(p.n)));
    const r = await ctx.ia<ResumenIa>('IA-03', {
      ...comunes, tema: { id: t.id, titulo: textoSeguro(t.titulo), paginas: t.paginas },
      documento: { id: d.m.id, nombre: textoSeguro(d.nombre), rango, texto_por_pagina: texto },
    }, estricto ? { validarExtra: revisarResumen(t) } : {});
    return r.datos.fragmentos.map((f): IdeaClave => ({ ...f, temaId: t.id, materialId: t.materialId, archivo: d.nombre }));
  });
  const ideas = resumenes.flat();

  // 4 · IA-13: acta de temas omitidos y complementarios. Es una propuesta: el diseñador la revisa antes de enviarla.
  const omitidos = clasificados.filter((t) => t.decision === 'omitir');
  let acta: ActaOmitidos;
  if (omitidos.length || clasificados.some((t) => t.decision === 'complementario')) {
    const a = await ctx.ia<ActaOmitidos>('IA-13', {
      ...comunes, proyecto: datosProyecto,
      clasificacion: clasificados.map(({ id, decision, motivo }) => ({ temaId: id, decision, motivo })),
      mapaTemas: mapa,
    }, estricto ? { validarExtra: revisarActa(omitidos.map((t) => t.id)) } : {});
    acta = a.datos;
  } else {
    acta = { titulo: `Acta de temas omitidos · ${proyecto.nombre}`, temas: [], textoActa: 'Se conservaron todos los temas del material; no hay temas omitidos.' };
  }

  // El mapa con su decisión queda también en cada material (docs/14-modulos.md, M03).
  for (const d of documentos) {
    const propios = clasificados.filter((t) => t.materialId === d.m.id).map(({ materialId: _m, ...t }) => t);
    await bd.materialFuente.update({ where: { id: d.m.id }, data: { mapaTemas: propios as unknown as Prisma.InputJsonValue } });
  }

  const totalPaginas = documentos.reduce((n, d) => n + d.paginas.length, 0);
  const resumen: ResumenMaterial = {
    tema: temaEscrito,
    documentos: documentos.map((d) => ({ materialId: d.m.id, nombre: d.nombre, totalPaginas: d.paginas.length })),
    temas: clasificados, metaMinutos: c.datos.metaMinutos ?? metaMinutos, minutosEstimados: c.datos.minutosEstimados, ideas, acta, observaciones,
  };
  return {
    texto: `${plural(totalPaginas, 'página', 'páginas')} → ${plural(ideas.length, 'idea clave', 'ideas clave')} · ${plural(omitidos.length, 'tema omitido', 'temas omitidos')} con motivo`,
    datos: resumen,
  };
};
