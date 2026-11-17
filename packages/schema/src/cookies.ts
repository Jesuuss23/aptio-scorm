/**
 * HU-1606 · Consentimiento de cookies del sitio comercial (REQ-079, RN-17-6, CP-137, Ley 29733). Reglas puras: las usan
 * el pre-render (`@aptio/sitio`), la API (la CSP de cada versión), la consola web y las pruebas. `_cookies.js` aplica en
 * el navegador las mismas reglas; si cambias una, cambia la otra.
 *
 * Categorías: `necesarias` (siempre activas: el sitio no usa cookies propias), `analitica` (GA4 y Tag Manager) y
 * `publicidad` (Meta Pixel). Una etiqueta solo se carga con la decisión vigente que acepta su categoría.
 */

export const CATEGORIAS_COOKIES = ['necesarias', 'analitica', 'publicidad'] as const;
export type CategoriaCookies = (typeof CATEGORIAS_COOKIES)[number];
/** Las que el visitante puede aceptar o rechazar. */
export type CategoriaOpcional = Exclude<CategoriaCookies, 'necesarias'>;
export const CATEGORIAS_OPCIONALES: readonly CategoriaOpcional[] = ['analitica', 'publicidad'];

export const ETIQUETA_CATEGORIA: Record<'es' | 'en', Record<CategoriaCookies, string>> = {
  es: { necesarias: 'Necesarias', analitica: 'Analítica', publicidad: 'Publicidad' },
  en: { necesarias: 'Necessary', analitica: 'Analytics', publicidad: 'Advertising' },
};

export const ETIQUETAS_COOKIES = ['ga4', 'gtm', 'metaPixel'] as const;
export type EtiquetaCookies = (typeof ETIQUETAS_COOKIES)[number];
/** La categoría de cada etiqueta. Tag Manager cuenta como analítica (SUP-263): lo que cargue su contenedor es de quien lo configura. */
export const CATEGORIA_ETIQUETA: Record<EtiquetaCookies, CategoriaOpcional> = { ga4: 'analitica', gtm: 'analitica', metaPixel: 'publicidad' };
export const NOMBRE_ETIQUETA: Record<EtiquetaCookies, string> = { ga4: 'Google Analytics 4', gtm: 'Google Tag Manager', metaPixel: 'Meta Pixel' };

/** Dónde el navegador guarda la decisión (`localStorage`, nunca una cookie). */
export const CLAVE_COOKIES = 'aptio.cookies';
/** La decisión vale 12 meses; después se vuelve a preguntar. */
export const VIGENCIA_MESES = 12;

/** Lo que sale al sitio en la versión publicada: solo con el banner encendido y al menos un ID. */
export interface CookiesPublicadas {
  version: number;
  etiquetas: Partial<Record<EtiquetaCookies, string>>;
}

/** La decisión guardada en `aptio.cookies`. `ofrecidas` son las categorías que tenía el banner al decidir. */
export interface DecisionCookies {
  necesarias: true;
  analitica: boolean;
  publicidad: boolean;
  /** ISO 8601 */
  fecha: string;
  versionPolitica: number;
  ofrecidas: CategoriaOpcional[];
}

/** Lo publicado a partir de los ajustes: null con el banner apagado o sin IDs (entonces no hay banner ni etiquetas). */
export function cookiesPublicadas(a: { visible: boolean; version: number }, analitica: Partial<Record<EtiquetaCookies, string | null>>): CookiesPublicadas | null {
  if (!a.visible) return null;
  const etiquetas: CookiesPublicadas['etiquetas'] = {};
  for (const e of ETIQUETAS_COOKIES) {
    const v = analitica[e];
    if (typeof v === 'string' && v) etiquetas[e] = v;
  }
  return Object.keys(etiquetas).length ? { version: a.version, etiquetas } : null;
}

/** Las categorías que el banner ofrece: las de las etiquetas configuradas, en el orden del catálogo. */
export function categoriasOfrecidas(c: CookiesPublicadas | null): CategoriaOpcional[] {
  if (!c) return [];
  return CATEGORIAS_OPCIONALES.filter((cat) => ETIQUETAS_COOKIES.some((e) => c.etiquetas[e] && CATEGORIA_ETIQUETA[e] === cat));
}

/** Lee lo guardado en `aptio.cookies` (texto JSON u objeto); null si falta o no tiene la forma esperada. */
export function leerDecision(v: unknown): DecisionCookies | null {
  let o: unknown = v;
  if (typeof v === 'string') {
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const d = o as Record<string, unknown>;
  if (d.necesarias !== true || typeof d.analitica !== 'boolean' || typeof d.publicidad !== 'boolean') return null;
  if (typeof d.fecha !== 'string' || Number.isNaN(Date.parse(d.fecha))) return null;
  if (!Number.isInteger(d.versionPolitica) || (d.versionPolitica as number) < 1) return null;
  const ofrecidas = Array.isArray(d.ofrecidas) ? d.ofrecidas.filter((x): x is CategoriaOpcional => (CATEGORIAS_OPCIONALES as readonly unknown[]).includes(x)) : [];
  return { necesarias: true, analitica: d.analitica, publicidad: d.publicidad, fecha: d.fecha, versionPolitica: d.versionPolitica as number, ofrecidas };
}

/** La fecha en que vence una decisión: 12 meses después (el mismo día del mes, o el último si no existe). */
export function venceEn(fecha: Date): Date {
  const v = new Date(fecha.getTime());
  const dia = v.getUTCDate();
  v.setUTCDate(1);
  v.setUTCMonth(v.getUTCMonth() + VIGENCIA_MESES);
  const ultimo = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + 1, 0)).getUTCDate();
  v.setUTCDate(Math.min(dia, ultimo));
  return v;
}

export type MotivoPreguntar = 'sin_decision' | 'vencida' | 'version' | 'categoria_nueva';

/** Por qué hay que volver a preguntar, o null si la decisión sigue vigente. */
export function motivoParaPreguntar(d: DecisionCookies | null, c: CookiesPublicadas | null, ahora: Date): MotivoPreguntar | null {
  if (!d) return 'sin_decision';
  if (venceEn(new Date(d.fecha)).getTime() <= ahora.getTime()) return 'vencida';
  if (c && d.versionPolitica !== c.version) return 'version';
  if (categoriasOfrecidas(c).some((cat) => !d.ofrecidas.includes(cat))) return 'categoria_nueva';
  return null;
}

/** ¿El sitio muestra el banner? Solo con algo publicado y sin una decisión vigente. */
export function debePreguntar(d: DecisionCookies | null, c: CookiesPublicadas | null, ahora: Date): boolean {
  return categoriasOfrecidas(c).length > 0 && motivoParaPreguntar(d, c, ahora) !== null;
}

/** Las etiquetas que se cargan: las configuradas cuya categoría acepta la decisión vigente (CP-137: rechazar = ninguna). */
export function etiquetasACargar(c: CookiesPublicadas | null, d: DecisionCookies | null, ahora: Date): EtiquetaCookies[] {
  if (!c || !d || motivoParaPreguntar(d, c, ahora) !== null) return [];
  return ETIQUETAS_COOKIES.filter((e) => c.etiquetas[e] && d[CATEGORIA_ETIQUETA[e]]);
}

/** La decisión que guarda cada botón del banner o el diálogo. */
export function nuevaDecision(c: CookiesPublicadas, eleccion: Partial<Record<CategoriaOpcional, boolean>>, ahora: Date): DecisionCookies {
  const ofrecidas = categoriasOfrecidas(c);
  return {
    necesarias: true,
    analitica: ofrecidas.includes('analitica') && eleccion.analitica === true,
    publicidad: ofrecidas.includes('publicidad') && eleccion.publicidad === true,
    fecha: ahora.toISOString(),
    versionPolitica: c.version,
    ofrecidas,
  };
}

/**
 * Los orígenes que cada etiqueta necesita en la CSP de la página (según la guía de CSP de Google para GA4 y Tag Manager,
 * y la del Meta Pixel). Solo se agregan los de las etiquetas publicadas (SUP-264).
 */
export const DOMINIOS_ETIQUETA: Record<EtiquetaCookies, { script: string[]; connect: string[]; img: string[] }> = {
  ga4: {
    script: ['https://www.googletagmanager.com'],
    connect: ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
    img: ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com'],
  },
  gtm: {
    script: ['https://www.googletagmanager.com'],
    connect: ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
    img: ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com'],
  },
  metaPixel: {
    script: ['https://connect.facebook.net'],
    connect: ['https://connect.facebook.net', 'https://www.facebook.com'],
    img: ['https://www.facebook.com'],
  },
};

/** Los orígenes extra de la CSP para lo publicado, sin repetir y en orden estable. */
export function dominiosCsp(c: CookiesPublicadas | null): { script: string[]; connect: string[]; img: string[] } {
  const r = { script: new Set<string>(), connect: new Set<string>(), img: new Set<string>() };
  if (c) {
    for (const e of ETIQUETAS_COOKIES) {
      if (!c.etiquetas[e]) continue;
      const d = DOMINIOS_ETIQUETA[e];
      d.script.forEach((x) => r.script.add(x));
      d.connect.forEach((x) => r.connect.add(x));
      d.img.forEach((x) => r.img.add(x));
    }
  }
  return { script: [...r.script], connect: [...r.connect], img: [...r.img] };
}
