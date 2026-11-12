// HU-1001 · Matriz de alineación pedagógica (M10, PNT-18, CP-083, REQ-042). Calcula sin IA (RN-10-3), desde el documento
// del curso, qué pantallas y preguntas presentan (P), practican (A) y evalúan (E) cada objetivo, con su nivel de Bloom, y
// las alertas de RN-10-2. Lo usan la API (informe y Entrega) y la web. Las alertas no bloquean la entrega.
import type { CursoDoc, PantallaDoc } from './revision.js';

export const NIVELES_BLOOM = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'] as const;
export type NivelBloom = (typeof NIVELES_BLOOM)[number];
export const NOMBRE_BLOOM: Record<NivelBloom, string> = {
  recordar: 'Recordar', comprender: 'Comprender', aplicar: 'Aplicar', analizar: 'Analizar', evaluar: 'Evaluar', crear: 'Crear',
};

export type RolAlineacion = 'P' | 'A' | 'E';
export const NOMBRE_ROL: Record<RolAlineacion, string> = { P: 'Presenta', A: 'Practica', E: 'Evalúa' };

/** Pantallas que no presentan, practican ni evalúan (RN-10-1). */
const EXCLUIDAS = new Set(['portada', 'objetivos', 'seccion', 'resultados', 'cierre']);
/** Nivel por disposición cuando la pantalla o la pregunta no lo tiene escrito (tabla del prototipo, SUP-91). */
export const NIVEL_DISPOSICION: Record<string, NivelBloom> = {
  memoria: 'recordar', quiz: 'recordar', dato: 'recordar', lista: 'recordar', resumen: 'recordar',
  clasificar: 'comprender', vf: 'comprender', hotspot: 'comprender', idea: 'comprender', personaje: 'comprender', video: 'comprender',
  ordenar: 'aplicar', decision: 'aplicar',
};
/** La disposición de una interacción, para las pantallas sin `disposicion`. */
const DISPOSICION_INTERACCION: Record<string, string> = {
  'INT-01': 'memoria', 'INT-02': 'clasificar', 'INT-03': 'ordenar', 'INT-04': 'lista', 'INT-05': 'quiz', 'INT-06': 'hotspot', 'INT-07': 'vf', 'INT-08': 'decision',
};
const NIVEL_POR_OMISION: NivelBloom = 'comprender';

export interface ElementoAlineacion {
  pantallaId: string;
  /** Número de la pantalla en el curso (1 = la primera). */
  numero: number;
  titulo: string;
  /** Solo en una actividad sumativa: cada pregunta cuenta con su objetivo. */
  preguntaId?: string;
  rol: RolAlineacion;
  nivelBloom: NivelBloom;
  /** El nivel está escrito en la pantalla o la pregunta (si no, sale de la disposición). */
  nivelEscrito: boolean;
  objetivoIds: string[];
}
export interface ObjetivoAlineacion {
  id: string;
  texto: string;
  nivelBloom: NivelBloom;
  presenta: ElementoAlineacion[];
  practica: ElementoAlineacion[];
  evalua: ElementoAlineacion[];
  alertas: string[];
}
export interface InformeAlineacion {
  objetivos: ObjetivoAlineacion[];
  totalAlertas: number;
  indicadores: {
    objetivosAlineados: number;
    /** Pantallas o preguntas que cuentan pero no tienen objetivo. */
    elementosSinObjetivo: number;
    equilibrio: { presenta: number; practica: number; evalua: number };
  };
}

type Interaccion = { tipo: string; modo?: string; datos?: { preguntas?: { id: string; objetivoId?: string; nivelBloom?: NivelBloom; enunciado?: { es?: string } }[] } };
type PantallaAlineada = PantallaDoc & { nivelBloom?: NivelBloom };
type DocAlineacion = Omit<CursoDoc, 'objetivos'> & { objetivos?: { id: string; texto: { es?: string; en?: string }; nivelBloom: NivelBloom }[] };

const esNivel = (v: unknown): v is NivelBloom => typeof v === 'string' && (NIVELES_BLOOM as readonly string[]).includes(v);
const rango = (n: NivelBloom) => NIVELES_BLOOM.indexOf(n);
const interaccionDe = (p: PantallaDoc) => p.bloques.find((b) => b.interaccion)?.interaccion as Interaccion | undefined;

/** Nivel de la pantalla: el escrito o el de su disposición (o el de su interacción). */
function nivelDePantalla(p: PantallaAlineada, interaccion?: Interaccion): { nivel: NivelBloom; escrito: boolean } {
  if (esNivel(p.nivelBloom)) return { nivel: p.nivelBloom, escrito: true };
  const disposicion = p.disposicion ?? (interaccion ? DISPOSICION_INTERACCION[interaccion.tipo] : p.tipo === 'video' ? 'video' : undefined);
  return { nivel: (disposicion && NIVEL_DISPOSICION[disposicion]) || NIVEL_POR_OMISION, escrito: false };
}

/** Las pantallas y preguntas que cuentan para la alineación, con su rol y su nivel (RN-10-1). */
export function elementosAlineacion(doc: CursoDoc): ElementoAlineacion[] {
  const pantallas = doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as PantallaAlineada[];
  const elementos: ElementoAlineacion[] = [];
  pantallas.forEach((p, i) => {
    if (p.tipo === 'portada' || p.tipo === 'cierre' || EXCLUIDAS.has(p.disposicion ?? '')) return;
    const interaccion = interaccionDe(p);
    const base = { pantallaId: p.id, numero: i + 1, titulo: p.titulo.es ?? p.titulo.en ?? p.id };
    const objetivoIds = p.objetivoIds ?? [];
    const { nivel, escrito } = nivelDePantalla(p, interaccion);
    if (interaccion?.modo === 'sumativa' && interaccion.datos?.preguntas?.length) {
      for (const q of interaccion.datos.preguntas) {
        const propio = esNivel(q.nivelBloom);
        elementos.push({
          ...base, preguntaId: q.id, rol: 'E', nivelBloom: propio ? q.nivelBloom! : nivel, nivelEscrito: propio || escrito,
          objetivoIds: q.objetivoId ? [q.objetivoId] : objetivoIds,
        });
      }
      return;
    }
    const rol: RolAlineacion = interaccion ? (interaccion.modo === 'sumativa' ? 'E' : 'A') : 'P';
    elementos.push({ ...base, rol, nivelBloom: nivel, nivelEscrito: escrito, objetivoIds });
  });
  return elementos;
}

const lista = (niveles: NivelBloom[]) => [...new Set(niveles)].sort((a, b) => rango(a) - rango(b)).map((n) => `«${n}»`).join(', ');

/** Las alertas de un objetivo (RN-10-2): sin P, A o E, o ninguna A o E llega a su nivel. */
export function alertasObjetivo(nivel: NivelBloom, presenta: ElementoAlineacion[], practica: ElementoAlineacion[], evalua: ElementoAlineacion[]): string[] {
  const alertas: string[] = [];
  const llega = (xs: ElementoAlineacion[]) => xs.some((x) => rango(x.nivelBloom) >= rango(nivel));
  if (!presenta.length) alertas.push('No se presenta');
  if (!practica.length) alertas.push('No tiene práctica');
  else if (!llega(practica)) alertas.push(`La práctica no llega a «${nivel}»`);
  if (!evalua.length) alertas.push('No se evalúa');
  else if (!llega(evalua)) alertas.push(`Se evalúa solo en ${lista(evalua.map((x) => x.nivelBloom))}, menor que «${nivel}»`);
  return alertas;
}

/** El informe de alineación del curso (`GET /cursos/{id}/alineacion`). */
export function informeAlineacion(doc: CursoDoc): InformeAlineacion {
  const elementos = elementosAlineacion(doc);
  const objetivos = ((doc as unknown as DocAlineacion).objetivos ?? []).map((o): ObjetivoAlineacion => {
    const nivel = esNivel(o.nivelBloom) ? o.nivelBloom : NIVEL_POR_OMISION;
    const mios = elementos.filter((x) => x.objetivoIds.includes(o.id));
    const presenta = mios.filter((x) => x.rol === 'P');
    const practica = mios.filter((x) => x.rol === 'A');
    const evalua = mios.filter((x) => x.rol === 'E');
    return { id: o.id, texto: o.texto.es ?? o.texto.en ?? o.id, nivelBloom: nivel, presenta, practica, evalua, alertas: alertasObjetivo(nivel, presenta, practica, evalua) };
  });
  const ids = new Set(objetivos.map((o) => o.id));
  return {
    objetivos,
    totalAlertas: objetivos.reduce((n, o) => n + o.alertas.length, 0),
    indicadores: {
      objetivosAlineados: objetivos.filter((o) => !o.alertas.length).length,
      elementosSinObjetivo: elementos.filter((x) => !x.objetivoIds.some((id) => ids.has(id))).length,
      equilibrio: {
        presenta: elementos.filter((x) => x.rol === 'P').length,
        practica: elementos.filter((x) => x.rol === 'A').length,
        evalua: elementos.filter((x) => x.rol === 'E').length,
      },
    },
  };
}

/** Un cambio de nivel (`PATCH /cursos/{id}/alineacion`): de un objetivo, una pantalla o una pregunta. */
export type CambioNivel = { objetivoId: string; nivelBloom: NivelBloom } | { pantallaId: string; preguntaId?: string; nivelBloom: NivelBloom };

/**
 * Aplica los cambios de nivel sobre el documento (lo modifica). Devuelve el primer error en palabras si un objetivo, una
 * pantalla o una pregunta no existe; así nada se guarda a medias.
 */
export function aplicarNiveles(doc: CursoDoc, cambios: CambioNivel[]): string | null {
  const d = doc as unknown as DocAlineacion;
  const pantallas = doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as PantallaAlineada[];
  for (const c of cambios) {
    if (!esNivel(c.nivelBloom)) return `Nivel de Bloom no válido: ${String(c.nivelBloom)}`;
    if ('objetivoId' in c) {
      const o = d.objetivos?.find((x) => x.id === c.objetivoId);
      if (!o) return `El objetivo ${c.objetivoId} no existe`;
      o.nivelBloom = c.nivelBloom;
      continue;
    }
    const p = pantallas.find((x) => x.id === c.pantallaId);
    if (!p) return `La pantalla ${c.pantallaId} no existe`;
    if (c.preguntaId) {
      const q = interaccionDe(p)?.datos?.preguntas?.find((x) => x.id === c.preguntaId);
      if (!q) return `La pregunta ${c.preguntaId} no existe en ${c.pantallaId}`;
      q.nivelBloom = c.nivelBloom;
    } else {
      p.nivelBloom = c.nivelBloom;
    }
  }
  return null;
}
