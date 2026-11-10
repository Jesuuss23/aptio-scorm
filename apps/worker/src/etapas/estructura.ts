// HU-0403 · Etapa 2 «Objetivos y estructura» (IA-04 v2): objetivos con verbo y nivel de Bloom y la lista de pantallas
// con su tipo, objetivo, fragmentos y actividad sugerida, con el número de pantallas y el % de actividades pedidos (CP-039).
import { textoSeguro } from '@aptio/ai';
import { conActividad, type EstructuraCurso, type PantallaEstructura, type ResumenMaterial } from '@aptio/schema/generacion';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';

type SalidaIa = Omit<EstructuraCurso, 'actividades' | 'supuestos' | 'modulos'> & {
  supuestos?: string[];
  modulos: (Omit<EstructuraCurso['modulos'][number], 'capsulas'> & {
    capsulas: (Omit<EstructuraCurso['modulos'][number]['capsulas'][number], 'pantallas'> & { pantallas: Omit<PantallaEstructura, 'paginas'>[] })[];
  })[];
};

export const VERSION_PROMPT = 'v2';
const pantallasDe = (s: SalidaIa) => s.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

/** Pantallas con actividad pedidas: el % del proyecto sobre el total, redondeado hacia arriba (30 × 40 % = 12). */
export const actividadesMinimas = (pantallas: number | null, porcentaje: number) => (pantallas ? Math.ceil((pantallas * porcentaje) / 100) : null);

/** Reglas propias además del esquema (solo con un proveedor real: el simulado responde siempre el caso LOTO). */
export function revisarEstructura(p: { pantallas: number | null; minimas: number | null; fragmentos: Set<string> }) {
  return (datos: unknown): string[] => {
    const s = datos as SalidaIa;
    const lista = pantallasDe(s);
    const errores: string[] = [];
    if (p.pantallas && lista.length !== p.pantallas) errores.push(`Debe haber exactamente ${p.pantallas} pantallas y hay ${lista.length}`);
    const actividades = lista.filter(conActividad);
    if (p.minimas && actividades.length < p.minimas) errores.push(`Debe haber al menos ${p.minimas} pantallas con actividad y hay ${actividades.length}`);
    const objetivos = new Set(s.objetivos.map((o) => o.id));
    lista.forEach((x, i) => {
      const esperado = `p${String(i + 1).padStart(2, '0')}`;
      if (x.id !== esperado) errores.push(`La pantalla ${i + 1} debe tener el id ${esperado} (tiene ${x.id})`);
      const ajenos = x.objetivoIds.filter((o) => !objetivos.has(o));
      if (ajenos.length) errores.push(`La pantalla ${x.id} usa objetivos que no existen: ${ajenos.join(', ')}`);
      const sinFuente = x.fragmentoIds.filter((f) => !p.fragmentos.has(f));
      if (sinFuente.length) errores.push(`La pantalla ${x.id} usa fragmentos que no existen: ${sinFuente.join(', ')}`);
      if (conActividad(x) && !x.objetivoIds.length) errores.push(`La pantalla ${x.id} tiene actividad y no está ligada a un objetivo`);
    });
    for (const o of s.objetivos) {
      if (!actividades.some((x) => x.objetivoIds.includes(o.id))) errores.push(`El objetivo ${o.id} no tiene ninguna actividad`);
    }
    return errores;
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const estructurarCurso: EjecutorEtapa = async (ctx: ContextoEtapa) => {
  const resumen = ctx.anteriores.RESUMEN_MATERIAL as ResumenMaterial | undefined;
  if (!resumen) throw new Error('Falta el resultado de la etapa 1 (Leer y resumir el material)');
  const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
    where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
    include: { cliente: { include: { glosario: { orderBy: { termino: 'asc' } } } } },
  });
  const { parametros } = ctx;
  const pantallas = typeof parametros.pantallas === 'number' ? parametros.pantallas : null;
  const porcentaje = typeof parametros.porcentajeActividades === 'number' ? parametros.porcentajeActividades : 40;
  const minimas = actividadesMinimas(pantallas, porcentaje);
  const tema = resumen.tema ? `${proyecto.nombre} (${resumen.tema})` : proyecto.nombre;

  const r = await ctx.ia<SalidaIa>('IA-04', {
    cliente: { nombre: proyecto.cliente.nombre },
    glosario: proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
    proyecto: {
      tema: textoSeguro(tema),
      publico: typeof parametros.publico === 'string' ? textoSeguro(parametros.publico) : null,
      nivel: null, metaMinutos: resumen.metaMinutos, objetivos: null,
      pantallasMeta: pantallas ?? '(propón la extensión según el material)', porcentajeActividades: porcentaje, actividadesMinimas: minimas,
    },
    // Las ideas vienen del documento del cliente: van neutralizadas, como el resto del material.
    fragmentos: resumen.ideas.map((i) => `${i.id} · ${i.tipo} · p. ${i.paginas.join(', ')} · ${textoSeguro(i.texto)}`).join('\n'),
    gamificacion: null,
  }, {
    version: VERSION_PROMPT,
    ...(ctx.proveedor !== 'simulado' ? { validarExtra: revisarEstructura({ pantallas, minimas, fragmentos: new Set(resumen.ideas.map((i) => i.id)) }) } : {}),
  });

  const paginasDe = new Map(resumen.ideas.map((i) => [i.id, i.paginas]));
  const estructura: EstructuraCurso = {
    objetivos: r.datos.objetivos,
    modulos: r.datos.modulos.map((m) => ({
      ...m,
      capsulas: m.capsulas.map((c) => ({
        ...c,
        pantallas: c.pantallas.map((x) => ({ ...x, paginas: [...new Set(x.fragmentoIds.flatMap((f) => paginasDe.get(f) ?? []))].sort((a, b) => a - b) })),
      })),
    })),
    supuestos: r.datos.supuestos ?? [],
    actividades: { minimas, total: pantallasDe(r.datos).filter(conActividad).length },
  };
  const total = pantallasDe(r.datos).length;
  return {
    texto: `${plural(estructura.objetivos.length, 'objetivo', 'objetivos')} con nivel de Bloom · ${plural(estructura.modulos.length, 'módulo', 'módulos')} · ${plural(total, 'pantalla', 'pantallas')} · ${estructura.actividades.total} con actividad`,
    datos: estructura,
  };
};
