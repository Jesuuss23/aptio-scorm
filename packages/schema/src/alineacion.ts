// HU-1001 · Matriz de alineación pedagógica (M10, PNT-18, CP-083, REQ-042). Calcula sin IA (RN-10-3), desde el documento
// del curso, qué pantallas y preguntas presentan (P), practican (A) y evalúan (E) cada objetivo, con su nivel de Bloom, y
// las alertas de RN-10-2. Lo usan la API (informe y Entrega) y la web. Las alertas no bloquean la entrega.
// HU-1002 · La corrección con IA (IA-17 v2, CP-084): qué rutas puede tocar su patch, cómo se comprueba y cómo se aplica.
import { aplicarPatch, type OperacionPatch } from './patch.js';
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

// ---------- HU-1002 · Corrección con IA (IA-17 v2, CP-084, RN-10-3) ----------

export const TAREA_CORRECCION = 'IA-17';
export type TipoCorreccion = 'nueva-pregunta' | 'nueva-pantalla' | 'ajustar-pregunta' | 'ajustar-objetivo';
export const NOMBRE_CORRECCION: Record<TipoCorreccion, string> = {
  'nueva-pregunta': 'Pregunta nueva', 'nueva-pantalla': 'Pantalla nueva', 'ajustar-pregunta': 'Ajustar pregunta', 'ajustar-objetivo': 'Ajustar objetivo',
};
export interface CambioCorreccion {
  tipo: TipoCorreccion;
  objetivoId: string;
  nivelBloom: NivelBloom;
  motivo: string;
  /** La pantalla que se toca o se crea. */
  pantallaId?: string;
  preguntaId?: string;
}
/** La salida de IA-17: lo que se guarda en la propuesta y se aplica. */
export interface CorreccionAlineacion {
  resumen: string;
  cambios: CambioCorreccion[];
  patch: OperacionPatch[];
}
/** Una pantalla que la corrección crea o cambia: queda en borrador, por revisar. */
export interface PantallaAfectada {
  pantallaId: string;
  numero: number;
  titulo: string;
  nueva: boolean;
}

const RUTA_OBJETIVO = /^\/objetivos\/(0|[1-9]\d*)\/nivelBloom$/;
const RUTA_PANTALLA = /^\/modulos\/(0|[1-9]\d*)\/capsulas\/(0|[1-9]\d*)\/pantallas\/(0|[1-9]\d*|-)(\/.*)?$/;
const RUTA_PREGUNTAS = /^\/bloques\/(0|[1-9]\d*)\/interaccion\/datos\/preguntas(\/.*)?$/;
const FUERA = 'solo se cambian niveles de objetivos, preguntas de las pantallas nombradas en los cambios o pantallas nuevas';
const IA_SIN_REVISAR = () => ({ tipo: 'ia' as const, revisado: false });

type Pregunta = NonNullable<NonNullable<Interaccion['datos']>['preguntas']>[number] & { origen?: unknown };
type Recorrido = { documento: CursoDoc; nuevas: Set<string>; cambiadas: Set<string>; errores: string[] };

/**
 * Aplica el patch operación por operación (las rutas usan posiciones, así que cada una se mira sobre el curso como va
 * quedando) y rechaza lo que sale de lo permitido. Se detiene en el primer error: nada queda a medias.
 */
function recorrer(doc: CursoDoc, c: CorreccionAlineacion): Recorrido {
  const nombradas = new Set(c.cambios.map((x) => x.pantallaId).filter((x): x is string => Boolean(x)));
  const r: Recorrido = { documento: doc, nuevas: new Set(), cambiadas: new Set(), errores: [] };
  for (const [i, o] of c.patch.entries()) {
    const n = `Operación ${i + 1}`;
    if (o.op !== 'add' && o.op !== 'replace' && o.op !== 'test') {
      r.errores.push(`${n}: solo se permiten add, replace y test (no «${o.op}»)`);
      return r;
    }
    const pantalla = RUTA_PANTALLA.exec(o.path);
    if (RUTA_OBJETIVO.test(o.path)) {
      // El nivel de un objetivo: lo comprueba el esquema.
    } else if (pantalla && !pantalla[4]) {
      const v = (o as { value?: unknown }).value as { id?: unknown } | undefined;
      if (o.op === 'replace') {
        r.errores.push(`${n}: una pantalla existente no se reemplaza entera; ${FUERA}`);
        return r;
      }
      if (o.op === 'add') {
        if (!v || typeof v !== 'object' || typeof v.id !== 'string') {
          r.errores.push(`${n}: la pantalla nueva necesita un id`);
          return r;
        }
        if (pantallasDeDoc(r.documento).some((p) => p.id === v.id)) {
          r.errores.push(`${n}: ya existe una pantalla con el id ${v.id}`);
          return r;
        }
        r.nuevas.add(v.id);
      }
    } else if (pantalla && pantalla[3] !== '-') {
      const p = r.documento.modulos[Number(pantalla[1])]?.capsulas[Number(pantalla[2])]?.pantallas[Number(pantalla[3])];
      if (!p) {
        r.errores.push(`${n}: la ruta ${o.path} no existe`);
        return r;
      }
      if (!r.nuevas.has(p.id)) {
        if (!nombradas.has(p.id) || !RUTA_PREGUNTAS.test(pantalla[4]!)) {
          r.errores.push(`${n}: la ruta «${o.path}» no se puede cambiar; ${FUERA}`);
          return r;
        }
        if (o.op !== 'test') r.cambiadas.add(p.id);
      }
    } else {
      r.errores.push(`${n}: la ruta «${o.path}» no se puede cambiar; ${FUERA}`);
      return r;
    }
    try {
      r.documento = aplicarPatch(r.documento, [o]);
    } catch (e) {
      r.errores.push(`${n}: ${(e as Error).message.replace(/^Operación \d+: /, '')}`);
      return r;
    }
  }
  return r;
}

const pantallasDeDoc = (doc: CursoDoc) => doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as PantallaAlineada[];
const preguntasDe = (p: PantallaDoc): Pregunta[] => p.bloques.flatMap((b) => (b.interaccion as Interaccion | undefined)?.datos?.preguntas ?? []) as Pregunta[];
const sinOrigen = (x: object) => JSON.stringify({ ...x, origen: undefined });

/** Lo que el patch no puede dejar en una pantalla nueva: la voz ya generada ni los retoques del editor. */
function erroresNueva(p: PantallaAlineada): string[] {
  const x = p as PantallaAlineada & { narracion?: { porIdioma?: unknown }; ajustes?: unknown; extras?: unknown };
  const errores: string[] = [];
  if (x.narracion?.porIdioma) errores.push(`La pantalla nueva ${p.id} no puede traer la voz generada (solo el texto de la narración)`);
  if (x.ajustes !== undefined || x.extras !== undefined) errores.push(`La pantalla nueva ${p.id} no puede traer retoques del editor`);
  return errores;
}

/** Los cambios declarados tienen que corresponder a lo que hace el patch. */
function erroresCambios(antes: CursoDoc, r: Recorrido, c: CorreccionAlineacion): string[] {
  const objetivos = new Set(((antes as unknown as DocAlineacion).objetivos ?? []).map((o) => o.id));
  const existentes = new Set(pantallasDeDoc(antes).map((p) => p.id));
  const despues = new Map(pantallasDeDoc(r.documento).map((p) => [p.id, p]));
  const errores: string[] = [];
  c.cambios.forEach((x, i) => {
    const n = `Cambio ${i + 1}`;
    if (!objetivos.has(x.objetivoId)) errores.push(`${n}: el objetivo ${x.objetivoId} no existe`);
    if (x.tipo === 'ajustar-objetivo') return;
    if (!x.pantallaId) {
      errores.push(`${n}: indica la pantalla (pantallaId)`);
      return;
    }
    if (x.tipo === 'nueva-pantalla' ? !r.nuevas.has(x.pantallaId) : !existentes.has(x.pantallaId)) {
      errores.push(x.tipo === 'nueva-pantalla' ? `${n}: el patch no crea la pantalla ${x.pantallaId}` : `${n}: la pantalla ${x.pantallaId} no existe`);
      return;
    }
    if (x.preguntaId && !preguntasDe(despues.get(x.pantallaId)!).some((q) => q.id === x.preguntaId)) {
      errores.push(`${n}: la pregunta ${x.preguntaId} no está en ${x.pantallaId}`);
    }
  });
  const declaradas = new Set(c.cambios.filter((x) => x.tipo === 'nueva-pantalla').map((x) => x.pantallaId));
  for (const id of r.nuevas) {
    if (!declaradas.has(id)) errores.push(`La pantalla nueva ${id} no figura en los cambios (tipo nueva-pantalla)`);
    errores.push(...erroresNueva(despues.get(id)!));
  }
  return errores;
}

/**
 * Lo que la corrección crea o cambia queda en borrador y marcado como propuesta de la IA sin revisar (trazabilidad):
 * en una pantalla nueva, todos sus textos y preguntas; en una que cambia, las preguntas nuevas o reescritas.
 */
function marcar(antes: CursoDoc, r: Recorrido): { documento: CursoDoc; afectadas: PantallaAfectada[] } {
  const previas = new Map(pantallasDeDoc(antes).map((p) => [p.id, p]));
  const afectadas: PantallaAfectada[] = [];
  pantallasDeDoc(r.documento).forEach((p, i) => {
    const nueva = r.nuevas.has(p.id);
    if (!nueva && !r.cambiadas.has(p.id)) return;
    const previa = previas.get(p.id);
    const antesPreguntas = new Map((previa ? preguntasDe(previa) : []).map((q) => [q.id, sinOrigen(q)]));
    for (const q of preguntasDe(p)) {
      if (nueva || antesPreguntas.get(q.id) !== sinOrigen(q)) q.origen = IA_SIN_REVISAR();
    }
    const antesBloques = new Map((previa?.bloques ?? []).map((b) => [b.id, sinOrigen(b)]));
    for (const b of p.bloques as (PantallaDoc['bloques'][number] & { origen?: unknown })[]) {
      if (b.tipo === 'texto' && (nueva || antesBloques.get(b.id) !== sinOrigen(b))) b.origen = IA_SIN_REVISAR();
    }
    p.estado = 'borrador';
    afectadas.push({ pantallaId: p.id, numero: i + 1, titulo: p.titulo.es ?? p.titulo.en ?? p.id, nueva });
  });
  return { documento: r.documento, afectadas };
}

/**
 * Aplica la corrección sobre una copia del curso (no modifica `doc`). Lanza un error en palabras si el patch toca algo
 * fuera de lo permitido o no se aplica. Las pantallas nuevas o cambiadas quedan en borrador, por revisar.
 */
export function aplicarCorreccion(doc: CursoDoc, c: CorreccionAlineacion): { documento: CursoDoc; afectadas: PantallaAfectada[] } {
  const r = recorrer(doc, c);
  if (r.errores.length) throw new Error(r.errores.join('; '));
  return marcar(doc, r);
}

/**
 * Errores de una corrección antes de guardarla como propuesta (IA-17 v2): rutas fuera de lo permitido, cambios que no
 * corresponden al patch, un curso que deja de validar (`erroresEsquema`, que pasa el que llama para que la web no cargue
 * Ajv) o un objetivo tratado que sigue con alertas.
 */
export function erroresCorreccion(doc: CursoDoc, c: CorreccionAlineacion, erroresEsquema: (documento: unknown) => string[]): string[] {
  const r = recorrer(doc, c);
  if (r.errores.length) return r.errores;
  const cambios = erroresCambios(doc, r, c);
  if (cambios.length) return cambios;
  const { documento } = marcar(doc, r);
  const esquema = erroresEsquema(documento).slice(0, 10).map((e) => `el curso queda inválido: ${e}`);
  if (esquema.length) return esquema;
  const tratados = new Set(c.cambios.map((x) => x.objetivoId));
  return informeAlineacion(documento).objetivos
    .filter((o) => tratados.has(o.id) && o.alertas.length)
    .map((o) => `${o.id} sigue con alertas tras aplicar: ${o.alertas.join('; ')}`);
}
