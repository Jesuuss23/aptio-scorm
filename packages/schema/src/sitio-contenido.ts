/**
 * Contenido administrable del sitio comercial (HU-1504, REQ-066, PNT-27): las 7 colecciones con sus campos cerrados,
 * la validación de texto plano (RN-16-7) y qué elementos ve el público en cada bloque (RN-16-4). El orden reutiliza
 * las funciones de `sitio-bloques`, acotadas a una colección.
 */
import { bloquesPublicos, type BloqueOrdenable } from './sitio-bloques.js';

export interface CampoContenido {
  clave: string;
  etiqueta: string;
  /** Largo máximo en caracteres (en `entero`, el valor máximo). */
  max: number;
  /** `entero` va de `min` a `max`. */
  tipo?: 'texto' | 'parrafo' | 'lista' | 'entero' | 'ruta';
  min?: number;
  opcional?: boolean;
}

export const COLECCIONES_CONTENIDO = {
  cifras: {
    nombre: 'Cifras', singular: 'cifra',
    campos: [
      { clave: 'valor', etiqueta: 'Valor', max: 20 },
      { clave: 'etiqueta', etiqueta: 'Etiqueta', max: 120 },
    ],
  },
  testimonios: {
    nombre: 'Testimonios', singular: 'testimonio',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', max: 80 },
      { clave: 'cargo', etiqueta: 'Cargo', max: 80 },
      { clave: 'empresa', etiqueta: 'Empresa', max: 80 },
      { clave: 'sector', etiqueta: 'Sector', max: 60, opcional: true },
      { clave: 'texto', etiqueta: 'Testimonio', max: 400, tipo: 'parrafo' },
      { clave: 'estrellas', etiqueta: 'Estrellas', tipo: 'entero', min: 1, max: 5 },
      { clave: 'desde', etiqueta: 'Cliente desde', max: 30, opcional: true },
    ],
  },
  logos: {
    nombre: 'Logos', singular: 'logo',
    campos: [{ clave: 'nombre', etiqueta: 'Nombre', max: 80 }],
  },
  funcionalidades: {
    nombre: 'Funcionalidades', singular: 'funcionalidad',
    campos: [
      { clave: 'etiqueta', etiqueta: 'Etiqueta', max: 40 },
      { clave: 'titulo', etiqueta: 'Título', max: 100 },
      { clave: 'texto', etiqueta: 'Texto', max: 400, tipo: 'parrafo' },
      { clave: 'vinetas', etiqueta: 'Viñetas (una por línea)', max: 600, tipo: 'lista', opcional: true },
    ],
  },
  pasos: {
    nombre: 'Pasos', singular: 'paso',
    campos: [
      { clave: 'titulo', etiqueta: 'Título', max: 80 },
      { clave: 'texto', etiqueta: 'Texto', max: 300, tipo: 'parrafo' },
    ],
  },
  lms: {
    nombre: 'LMS', singular: 'LMS',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', max: 80 },
      { clave: 'nota', etiqueta: 'Nota', max: 120, opcional: true },
    ],
  },
  preguntas: {
    nombre: 'Preguntas', singular: 'pregunta',
    campos: [
      { clave: 'pregunta', etiqueta: 'Pregunta', max: 200 },
      { clave: 'respuesta', etiqueta: 'Respuesta', max: 800, tipo: 'parrafo' },
      { clave: 'pagina', etiqueta: 'Página (vacío: todas)', max: 200, tipo: 'ruta', opcional: true },
    ],
  },
} as const satisfies Record<string, { nombre: string; singular: string; campos: readonly CampoContenido[] }>;

export type Coleccion = keyof typeof COLECCIONES_CONTENIDO;
export const COLECCIONES = Object.keys(COLECCIONES_CONTENIDO) as Coleccion[];

export function esColeccion(c: unknown): c is Coleccion {
  return typeof c === 'string' && Object.hasOwn(COLECCIONES_CONTENIDO, c);
}

export function camposDe(c: Coleccion): readonly CampoContenido[] {
  return COLECCIONES_CONTENIDO[c].campos;
}

/** Nombre corto de un elemento para listas y avisos: su primer campo o, si falta, el nombre singular de la colección. */
export function nombreElemento(coleccion: string, datos: unknown): string {
  if (!esColeccion(coleccion)) return coleccion;
  const v = (datos as Record<string, unknown> | null)?.[camposDe(coleccion)[0]!.clave];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : COLECCIONES_CONTENIDO[coleccion].singular;
}

/** Bloque del sitio → colección de la que toma sus elementos. */
export const COLECCION_DE_BLOQUE: Readonly<Record<string, Coleccion>> = {
  metricas: 'cifras',
  testimonios: 'testimonios',
  logos: 'logos',
  funcionalidades: 'funcionalidades',
  pasos: 'pasos',
  lms: 'lms',
  faq: 'preguntas',
};

const RUTA = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
/** Algo con forma de etiqueta HTML o comentario: `<a`, `</p`, `<!--`, `<?`. */
const ETIQUETA = /<\s*[a-zA-Z!/?]/;
/** Caracteres de control, salvo tabulador (9), salto de línea (10) y retorno (13). */
const tieneControl = (s: string) => [...s].some((ch) => {
  const n = ch.charCodeAt(0);
  return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127;
});

/** RN-16-7 · Texto plano: sin etiquetas HTML ni caracteres de control (salvo salto de línea y tabulador). */
export function esTextoPlano(s: string): boolean {
  return !ETIQUETA.test(s) && !tieneControl(s);
}

export type DatosContenido = Record<string, string | number>;
export interface ErrorCampo { campo: string; mensaje: string }
export type ResultadoDatos = { ok: true; datos: DatosContenido } | { ok: false; errores: ErrorCampo[] };

/**
 * Valida y normaliza los datos de un elemento: solo los campos de su colección, recortados, con su largo y tipo. Un
 * campo opcional vacío se quita. Con `parcial`, solo revisa los campos presentes (para mezclar con lo guardado).
 */
export function validarDatos(coleccion: Coleccion, entrada: unknown, parcial = false): ResultadoDatos {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { ok: false, errores: [{ campo: 'datos', mensaje: 'datos debe ser un objeto' }] };
  }
  const datos = entrada as Record<string, unknown>;
  const campos = camposDe(coleccion);
  const errores: ErrorCampo[] = [];
  const limpio: DatosContenido = {};
  for (const clave of Object.keys(datos)) {
    if (!campos.some((c) => c.clave === clave)) errores.push({ campo: clave, mensaje: `${clave} no es un campo de ${COLECCIONES_CONTENIDO[coleccion].nombre}` });
  }
  for (const c of campos) {
    const valor = datos[c.clave];
    if (valor === undefined) {
      if (!c.opcional && !parcial) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} es obligatorio` });
      continue;
    }
    if (valor === null || (typeof valor === 'string' && valor.trim() === '')) {
      if (!c.opcional) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} es obligatorio` });
      else if (parcial) limpio[c.clave] = '';
      continue;
    }
    if (c.tipo === 'entero') {
      const n = typeof valor === 'number' ? valor : Number.NaN;
      if (!Number.isInteger(n) || n < (c.min ?? 0) || n > c.max) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} va de ${c.min ?? 0} a ${c.max}` });
      else limpio[c.clave] = n;
      continue;
    }
    if (typeof valor !== 'string') {
      errores.push({ campo: c.clave, mensaje: `${c.etiqueta} debe ser texto` });
      continue;
    }
    const base = valor.replace(/\r\n?/g, '\n');
    const texto = c.tipo === 'lista' ? base.split('\n').map((l) => l.trim()).filter(Boolean).join('\n') : base.trim();
    if (texto.length > c.max) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} admite hasta ${c.max} caracteres` });
    else if (!esTextoPlano(texto)) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} solo admite texto, sin etiquetas HTML` });
    else if (c.tipo !== 'parrafo' && c.tipo !== 'lista' && texto.includes('\n')) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} va en una sola línea` });
    else if (c.tipo === 'ruta' && !RUTA.test(texto)) errores.push({ campo: c.clave, mensaje: `${c.etiqueta} es una ruta como /precios` });
    else limpio[c.clave] = texto;
  }
  return errores.length ? { ok: false, errores } : { ok: true, datos: limpio };
}

/** Mezcla un cambio parcial ya validado con lo guardado; un opcional vaciado se quita. */
export function mezclarDatos(actual: DatosContenido, cambio: DatosContenido): DatosContenido {
  const r: DatosContenido = { ...actual };
  for (const [k, v] of Object.entries(cambio)) {
    if (v === '') delete r[k];
    else r[k] = v;
  }
  return r;
}

export interface ElementoOrdenable extends BloqueOrdenable {
  coleccion: string;
  datos: unknown;
}

/**
 * Elementos que ve el público en un bloque visible de una página publicada (RN-16-4): los visibles de su colección, en
 * orden. En Preguntas, las generales (sin página) más las de esa ruta y las de `otrasRutas` (HU-1514: una landing de
 * sector suma las del inicio).
 */
export function elementosDeBloque<T extends ElementoOrdenable>(tipoBloque: string, rutaPagina: string, elementos: readonly T[], otrasRutas: readonly string[] = []): T[] | null {
  const coleccion = COLECCION_DE_BLOQUE[tipoBloque];
  if (!coleccion) return null;
  const propios = elementos.filter((e) => e.coleccion === coleccion);
  const visibles = bloquesPublicos(propios);
  if (coleccion !== 'preguntas') return visibles;
  return visibles.filter((e) => {
    const pagina = (e.datos as { pagina?: unknown } | null)?.pagina;
    return typeof pagina !== 'string' || pagina === '' || pagina === rutaPagina || otrasRutas.includes(pagina);
  });
}
