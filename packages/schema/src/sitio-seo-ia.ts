/**
 * HU-1513 · SEO para IA del sitio comercial (REQ-072, PNT-30, CP-126, CP-127). Reglas puras que usan la API, `@aptio/db`,
 * el pre-render, la consola web y la simulación de Playwright:
 * - el catálogo de rastreadores de IA que el superadmin permite o bloquea en robots.txt;
 * - el contenido de `/llms.txt` (texto plano) y su armado desde las páginas publicadas e indexables;
 * - las preguntas objetivo, con la marca manual de si cada asistente menciona la marca;
 * - las propuestas de contenido de la IA (IA-19), que solo se vuelven borradores.
 * Todo texto es plano (RN-16-7): el sitio lo escapa o lo sirve como `text/plain`.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';
import { LIMITES_SEO, rutaServida } from './sitio-seo.js';

export const LIMITES_SEO_IA = { llmsTxt: 20_000, pregunta: 200, preguntaMin: 5, preguntas: 50, propuestasPorPedido: 8, respuesta: 800, motivo: 300, titulo: 120 } as const;

// ── Rastreadores de IA (CP-126) ──────────────────────────────────────────────────────────────────────────────────────

/** El catálogo cerrado, en el orden de la pantalla. Todos permitidos por defecto. */
export const RASTREADORES_IA = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot'] as const;
export type RastreadorIa = (typeof RASTREADORES_IA)[number];
export const esRastreadorIa = (v: unknown): v is RastreadorIa => typeof v === 'string' && (RASTREADORES_IA as readonly string[]).includes(v);

/** Los bloqueados que se guardaron, solo los del catálogo, sin repetir y en su orden (lo demás se ignora). */
export function leerBloqueados(v: unknown): RastreadorIa[] {
  const lista = Array.isArray(v) ? v : [];
  return RASTREADORES_IA.filter((r) => lista.includes(r));
}

export interface EstadoRastreador { nombre: RastreadorIa; permitido: boolean }
export const estadoRastreadores = (bloqueados: unknown): EstadoRastreador[] => {
  const b = leerBloqueados(bloqueados);
  return RASTREADORES_IA.map((nombre) => ({ nombre, permitido: !b.includes(nombre) }));
};

/** Aplica `{ GPTBot: false }` (bloquear) o `{ GPTBot: true }` (permitir) a los bloqueados actuales. */
export function aplicarRastreadores(bloqueados: unknown, cambios: unknown): { ok: true; bloqueados: RastreadorIa[] } | { ok: false; errores: ErrorCampo[] } {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return { ok: false, errores: [{ campo: 'rastreadores', mensaje: 'Indica cada rastreador con verdadero (permitir) o falso (bloquear)' }] };
  const errores: ErrorCampo[] = [];
  const actual = new Set<RastreadorIa>(leerBloqueados(bloqueados));
  for (const [nombre, permitido] of Object.entries(cambios)) {
    if (!esRastreadorIa(nombre)) errores.push({ campo: `rastreadores.${nombre}`, mensaje: `${nombre} no es un rastreador del catálogo` });
    else if (typeof permitido !== 'boolean') errores.push({ campo: `rastreadores.${nombre}`, mensaje: `${nombre} va con verdadero (permitir) o falso (bloquear)` });
    else if (permitido) actual.delete(nombre);
    else actual.add(nombre);
  }
  return errores.length ? { ok: false, errores } : { ok: true, bloqueados: RASTREADORES_IA.filter((r) => actual.has(r)) };
}

/** Los bloques de robots.txt de los rastreadores bloqueados: uno por rastreador, con `Disallow: /`. */
export function robotsDeRastreadores(bloqueados: unknown): string {
  return leerBloqueados(bloqueados).map((r) => `User-agent: ${r}\nDisallow: /\n`).join('\n');
}

// ── llms.txt ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 20000 → «20 000». */
export const miles = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');

export type ResultadoLlms = { ok: true; llmsTxt: string } | { ok: false; errores: ErrorCampo[] };

/** Texto plano de hasta 20 000 caracteres, con saltos de línea `\n` y sin espacios al final. Vacío = sin archivo. */
export function validarLlmsTxt(v: string | null | undefined): ResultadoLlms {
  const t = (v ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
  if (t.length > LIMITES_SEO_IA.llmsTxt) return { ok: false, errores: [{ campo: 'llmsTxt', mensaje: `llms.txt admite hasta ${miles(LIMITES_SEO_IA.llmsTxt)} caracteres (tiene ${miles(t.length)})` }] };
  if (!esTextoPlano(t)) return { ok: false, errores: [{ campo: 'llmsTxt', mensaje: 'llms.txt solo admite texto, sin etiquetas HTML' }] };
  return { ok: true, llmsTxt: t };
}

export interface PaginaParaLlms {
  ruta: string;
  idioma: string;
  titulo: string;
  estado: string;
  indexar?: boolean | null;
  metaTitulo?: string | null;
  metaDescripcion?: string | null;
}

const enLinea = (t: string) => t.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim();
const enEnlace = (t: string) => enLinea(t).replace(/[[\]]/g, '');

/**
 * El contenido inicial de llms.txt, sin IA: el nombre del sitio, la descripción del inicio y una línea por cada página
 * publicada e indexable (título, dirección y su meta descripción), primero en español y luego en inglés. Si no cabe en
 * el límite, deja fuera las últimas páginas.
 */
export function armarLlmsTxt(datos: { nombre: string; sitioUrl: string; paginas: readonly PaginaParaLlms[] }): string {
  const base = datos.sitioUrl.replace(/\/+$/, '');
  const visibles = datos.paginas
    .filter((p) => p.estado === 'PUBLICADA' && p.indexar !== false)
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
  const inicio = visibles.find((p) => p.ruta === '/' && p.idioma === 'es') ?? visibles.find((p) => p.ruta === '/');
  const cabeza = [`# ${enLinea(datos.nombre)}`, ...(inicio?.metaDescripcion?.trim() ? ['', `> ${enLinea(inicio.metaDescripcion)}`] : [])];
  const linea = (p: PaginaParaLlms) => {
    const d = p.metaDescripcion?.trim() ? `: ${enLinea(p.metaDescripcion)}` : '';
    return `- [${enEnlace(p.metaTitulo?.trim() || p.titulo)}](${base}${rutaServida(p.ruta, p.idioma)})${d}`;
  };
  const grupos = [['## Páginas', visibles.filter((p) => p.idioma !== 'en')], ['## Pages in English', visibles.filter((p) => p.idioma === 'en')]] as const;
  const lineas = [...cabeza];
  for (const [titulo, paginas] of grupos) {
    if (!paginas.length) continue;
    const seccion = ['', titulo];
    for (const p of paginas) {
      const l = linea(p);
      if ([...lineas, ...seccion, l].join('\n').length > LIMITES_SEO_IA.llmsTxt) break;
      seccion.push(l);
    }
    if (seccion.length > 2) lineas.push(...seccion);
  }
  return lineas.join('\n');
}

// ── Preguntas objetivo y menciones ───────────────────────────────────────────────────────────────────────────────────

export const ASISTENTES_IA = [
  { id: 'chatgpt', nombre: 'ChatGPT' },
  { id: 'claude', nombre: 'Claude' },
  { id: 'gemini', nombre: 'Gemini' },
  { id: 'perplexity', nombre: 'Perplexity' },
] as const;
export type AsistenteIa = (typeof ASISTENTES_IA)[number]['id'];
export const esAsistenteIa = (v: unknown): v is AsistenteIa => ASISTENTES_IA.some((a) => a.id === v);

export const ESTADOS_MENCION = ['sin_revisar', 'si', 'no'] as const;
export type EstadoMencion = (typeof ESTADOS_MENCION)[number];
export const ETIQUETA_MENCION: Record<EstadoMencion, string> = { sin_revisar: 'Sin revisar', si: 'Sí', no: 'No' };
export const esEstadoMencion = (v: unknown): v is EstadoMencion => typeof v === 'string' && (ESTADOS_MENCION as readonly string[]).includes(v);

export interface Mencion { estado: EstadoMencion; revisadoEn: string | null }
export type Menciones = Record<AsistenteIa, Mencion>;

/** Las menciones guardadas, completas: lo que falta o no se entiende queda «sin revisar». */
export function leerMenciones(v: unknown): Menciones {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, { estado?: unknown; revisadoEn?: unknown } | undefined>;
  return Object.fromEntries(ASISTENTES_IA.map((a) => {
    const m = o[a.id];
    const estado = esEstadoMencion(m?.estado) ? m.estado : 'sin_revisar';
    return [a.id, { estado, revisadoEn: estado !== 'sin_revisar' && typeof m?.revisadoEn === 'string' ? m.revisadoEn : null }];
  })) as Menciones;
}

/**
 * Aplica `{ chatgpt: 'si' }` a las menciones: marcar «Sí» o «No» guarda la fecha de la revisión (también al repetir la
 * misma marca: es una revisión nueva); «Sin revisar» la borra.
 */
export function aplicarMenciones(actual: unknown, cambios: unknown, ahora: Date): { ok: true; menciones: Menciones } | { ok: false; errores: ErrorCampo[] } {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return { ok: false, errores: [{ campo: 'menciones', mensaje: 'Indica la marca de cada asistente: si, no o sin_revisar' }] };
  const menciones = leerMenciones(actual);
  const errores: ErrorCampo[] = [];
  for (const [asistente, estado] of Object.entries(cambios)) {
    if (!esAsistenteIa(asistente)) errores.push({ campo: `menciones.${asistente}`, mensaje: `${asistente} no es un asistente de la lista` });
    else if (!esEstadoMencion(estado)) errores.push({ campo: `menciones.${asistente}`, mensaje: 'La marca es si, no o sin_revisar' });
    else menciones[asistente] = { estado, revisadoEn: estado === 'sin_revisar' ? null : ahora.toISOString() };
  }
  return errores.length ? { ok: false, errores } : { ok: true, menciones };
}

const sinDistinguir = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:]/g, '').replace(/\s+/g, ' ').trim();

export type ResultadoPregunta = { ok: true; pregunta: string } | { ok: false; codigo: 'NO_VALIDO' | 'PREGUNTA_REPETIDA' | 'LIMITE_PREGUNTAS'; errores: ErrorCampo[] };

/** Una pregunta objetivo: una línea de texto plano de 5 a 200 caracteres, que no repite otra (sin tildes ni mayúsculas). */
export function validarPreguntaObjetivo(v: unknown, otras: readonly string[]): ResultadoPregunta {
  const mal = (codigo: 'NO_VALIDO' | 'PREGUNTA_REPETIDA' | 'LIMITE_PREGUNTAS', mensaje: string): ResultadoPregunta => ({ ok: false, codigo, errores: [{ campo: 'pregunta', mensaje }] });
  const t = (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
  if (t.length < LIMITES_SEO_IA.preguntaMin) return mal('NO_VALIDO', `La pregunta lleva al menos ${LIMITES_SEO_IA.preguntaMin} caracteres`);
  if (t.length > LIMITES_SEO_IA.pregunta) return mal('NO_VALIDO', `La pregunta admite hasta ${LIMITES_SEO_IA.pregunta} caracteres (tiene ${t.length})`);
  if (!esTextoPlano(t)) return mal('NO_VALIDO', 'La pregunta solo admite texto, sin etiquetas HTML');
  if (otras.some((o) => sinDistinguir(o) === sinDistinguir(t))) return mal('PREGUNTA_REPETIDA', 'Esa pregunta ya está en la lista');
  if (otras.length >= LIMITES_SEO_IA.preguntas) return mal('LIMITE_PREGUNTAS', `La lista admite hasta ${LIMITES_SEO_IA.preguntas} preguntas objetivo`);
  return { ok: true, pregunta: t };
}

// ── Propuestas de la IA (IA-19, CP-127) ──────────────────────────────────────────────────────────────────────────────

export const TAREA_SEO_IA = 'IA-19';
export const TIPOS_PROPUESTA_IA = ['pagina', 'pregunta'] as const;
export type TipoPropuestaIa = (typeof TIPOS_PROPUESTA_IA)[number];
export const ESTADOS_PROPUESTA_IA = ['pendiente', 'borrador_creado', 'descartada'] as const;
export type EstadoPropuestaIa = (typeof ESTADOS_PROPUESTA_IA)[number];

export interface PropuestaPaginaIa { tipo: 'pagina'; titulo: string; ruta: string; metaTitulo: string; metaDescripcion: string; motivo: string }
export interface PropuestaPreguntaIa { tipo: 'pregunta'; pregunta: string; respuesta: string; pagina?: string; motivo: string }
export type PropuestaIa = PropuestaPaginaIa | PropuestaPreguntaIa;
export interface SalidaPropuestasIa { propuestas: PropuestaIa[]; observaciones?: string[] }

const RUTA = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

/** Limpia los espacios de cada texto antes de validar: lo que se valida es lo que se guarda. */
export function prepararPropuestasIa(salida: unknown): unknown {
  const o = salida as { propuestas?: unknown } | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.propuestas)) return salida;
  return {
    ...o,
    propuestas: o.propuestas.map((p: unknown) => (p && typeof p === 'object'
      ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'string' ? (k === 'respuesta' ? v.trim() : v.replace(/\s+/g, ' ').trim()) : v]))
      : p)),
  };
}

/**
 * Las reglas que el esquema JSON no cubre (la salida ya tiene la forma de IA-19): texto plano y rutas con la forma de
 * las del sitio. Devuelve los errores para reintentar con ellos; vacío si todo está bien.
 */
export function erroresPropuestasIa(salida: SalidaPropuestasIa): string[] {
  const errores: string[] = [];
  salida.propuestas.forEach((p, i) => {
    const en = `/propuestas/${i}`;
    for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && !esTextoPlano(v)) errores.push(`${en}/${k} solo admite texto, sin etiquetas HTML`);
    if (p.tipo === 'pagina' && (!RUTA.test(p.ruta) || p.ruta === '/' || p.ruta.length > LIMITES_SEO.ruta)) errores.push(`${en}/ruta debe ser una ruta nueva en minúsculas, como /scorm-vs-cmi5`);
    if (p.tipo === 'pregunta' && p.pagina !== undefined && !RUTA.test(p.pagina)) errores.push(`${en}/pagina debe ser una ruta del sitio, como /precios, o no ir`);
  });
  return errores;
}

/**
 * De una salida válida, solo lo nuevo: sin las páginas cuya ruta ya existe (o ya está propuesta) ni las preguntas que
 * ya están en las preguntas frecuentes (o ya propuestas), y sin repetidos dentro de la misma respuesta. Una pregunta
 * que apunta a una página que no existe queda como general. Así pedir propuestas dos veces no duplica nada.
 */
export function propuestasNuevas(salida: SalidaPropuestasIa, contexto: { rutas: readonly string[]; rutasPropuestas?: readonly string[]; preguntas?: readonly string[] }): PropuestaIa[] {
  const rutas = new Set(contexto.rutas);
  const ocupadas = new Set([...contexto.rutas, ...(contexto.rutasPropuestas ?? [])]);
  const preguntas = new Set((contexto.preguntas ?? []).map(sinDistinguir));
  const nuevas: PropuestaIa[] = [];
  for (const p of salida.propuestas) {
    if (p.tipo === 'pagina') {
      if (ocupadas.has(p.ruta)) continue;
      ocupadas.add(p.ruta);
      nuevas.push(p);
    } else {
      const clave = sinDistinguir(p.pregunta);
      if (preguntas.has(clave)) continue;
      preguntas.add(clave);
      const { pagina, ...resto } = p;
      nuevas.push(pagina !== undefined && rutas.has(pagina) ? p : resto);
    }
  }
  return nuevas;
}

/** El nombre corto de una propuesta para las listas y la auditoría. */
export const nombrePropuestaIa = (p: PropuestaIa): string => (p.tipo === 'pagina' ? p.titulo : p.pregunta);
