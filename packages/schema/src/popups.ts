/**
 * HU-1603 · Popups del sitio (REQ-076, PNT-31, RN-17-3, CP-131, CP-132). Reglas puras que comparten la API, el sitio
 * y la web: el catálogo de tipos, disparadores y acciones, la validación de un popup, la coincidencia de páginas (rutas
 * exactas y `/blog/*`), la exclusión del pago y `debeMostrarse`, que decide si un visitante ve el popup. El script del
 * sitio (`_popups.js`, en `@aptio/sitio`) aplica estas mismas reglas en el navegador.
 */
import { etiquetaOrigen } from './leads.js';

export const TIPOS_POPUP = ['modal', 'deslizable', 'barra'] as const;
export type TipoPopup = (typeof TIPOS_POPUP)[number];
export const ETIQUETA_TIPO_POPUP: Record<TipoPopup, string> = { modal: 'Modal', deslizable: 'Deslizable', barra: 'Barra' };

export const DISPARADORES_POPUP = ['al_cargar', 'tiempo', 'desplazamiento', 'intencion_salida', 'clic_elemento'] as const;
export type DisparadorPopup = (typeof DISPARADORES_POPUP)[number];
export const ETIQUETA_DISPARADOR: Record<DisparadorPopup, string> = {
  al_cargar: 'Al cargar', tiempo: 'Tiempo', desplazamiento: 'Desplazamiento', intencion_salida: 'Intención de salida', clic_elemento: 'Clic en elemento',
};
/** Los disparadores que llevan un número: segundos o porcentaje de la página. */
export const UNIDAD_DISPARADOR: Partial<Record<DisparadorPopup, { unidad: string; min: number; max: number }>> = {
  tiempo: { unidad: 's', min: 1, max: 600 },
  desplazamiento: { unidad: '%', min: 1, max: 100 },
};

export const ACCIONES_POPUP = ['pedir_correo', 'enlace_interno'] as const;
export type AccionPopup = (typeof ACCIONES_POPUP)[number];
export const ETIQUETA_ACCION: Record<AccionPopup, string> = { pedir_correo: 'Pedir el correo', enlace_interno: 'Abrir un enlace del sitio' };

export const IDIOMAS_POPUP = ['es', 'en'] as const;
export type IdiomaPopup = (typeof IDIOMAS_POPUP)[number];

/** RN-17-3 · Un popup se muestra una vez por visitante cada 7 días como mínimo. */
export const FRECUENCIA_MINIMA_DIAS = 7;
export const DIA_MS = 86_400_000;
export const LIMITES_POPUP = { nombre: 80, titulo: 120, texto: 400, boton: 40, paginas: 20, ruta: 200, frecuenciaMaxDias: 365 } as const;
/** El ancla que abre un popup desde el contenido («Clic en elemento»): `#popup-<id>`. */
export const PREFIJO_ANCLA_POPUP = 'popup-';
/** Las rutas reservadas para el pago (S13): nunca muestran popups (RN-17-3). */
export const PREFIJO_PAGO = '/pago';
/** Los eventos que cuenta `POST /s/_popup`. */
export const EVENTOS_POPUP = ['impresion', 'conversion'] as const;
export type EventoPopup = (typeof EVENTOS_POPUP)[number];

export const esTipoPopup = (v: unknown): v is TipoPopup => typeof v === 'string' && (TIPOS_POPUP as readonly string[]).includes(v);
export const esDisparadorPopup = (v: unknown): v is DisparadorPopup => typeof v === 'string' && (DISPARADORES_POPUP as readonly string[]).includes(v);
export const esAccionPopup = (v: unknown): v is AccionPopup => typeof v === 'string' && (ACCIONES_POPUP as readonly string[]).includes(v);
export const esEventoPopup = (v: unknown): v is EventoPopup => typeof v === 'string' && (EVENTOS_POPUP as readonly string[]).includes(v);

/** Los datos que el superadmin edita. */
export interface DatosPopup {
  nombre: string;
  tipo: TipoPopup;
  idioma: IdiomaPopup;
  disparador: DisparadorPopup;
  valorDisparador: number | null;
  paginas: string[];
  titulo: string;
  texto: string;
  boton: string;
  accion: AccionPopup;
  enlaceDestino: string | null;
  frecuenciaDias: number;
  visible: boolean;
  ficticio: boolean;
}

/** Lo que el sitio recibe de cada popup activo (`GET /s/_popups.json`): sin nombre interno ni resultados. */
export interface PopupPublico {
  id: string;
  tipo: TipoPopup;
  idioma: IdiomaPopup;
  disparador: DisparadorPopup;
  valorDisparador: number | null;
  paginas: string[];
  titulo: string;
  texto: string;
  boton: string;
  accion: AccionPopup;
  enlaceDestino: string | null;
  frecuenciaDias: number;
}

export interface ErrorCampoPopup { campo: string; mensaje: string }

export const POPUP_NUEVO: DatosPopup = {
  nombre: 'Nuevo popup', tipo: 'modal', idioma: 'es', disparador: 'tiempo', valorDisparador: 15, paginas: ['*'], titulo: 'Título', texto: '', boton: 'Enviar',
  accion: 'pedir_correo', enlaceDestino: null, frecuenciaDias: FRECUENCIA_MINIMA_DIAS, visible: false, ficticio: false,
};

const SEGMENTO = /^[a-z0-9][a-z0-9._~-]*$/i;
const CONTROL = (s: string) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
};

/**
 * Una ruta interna del sitio: empieza con una sola `/`, sin esquema, dominio, consulta ni caracteres raros. Admite un
 * ancla final (`/demo#agenda`). Devuelve la ruta sin la barra final, o null.
 */
export function rutaInterna(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || s.length > LIMITES_POPUP.ruta || CONTROL(s) || s.includes('?')) return null;
  const [camino = '', ancla, ...resto] = s.split('#');
  if (resto.length || (ancla !== undefined && !/^[a-z0-9_-]{1,60}$/i.test(ancla))) return null;
  const partes = camino.split('/').slice(1);
  if (camino !== '/' && partes.some((p, i) => !(SEGMENTO.test(p) && p !== '.' && p !== '..') && !(p === '' && i === partes.length - 1))) return null;
  const limpia = camino.length > 1 ? camino.replace(/\/$/, '') : camino;
  return ancla !== undefined ? `${limpia}#${ancla}` : limpia;
}

/** Un patrón de páginas: `*` (todo el sitio), una ruta exacta (`/precios`) o una ruta con comodín final (`/blog/*`). */
export function patronPaginas(v: unknown): string | null {
  if (v === '*') return '*';
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.endsWith('/*')) {
    const base = s.slice(0, -2) || '/';
    const r = rutaInterna(base);
    return r && !r.includes('#') ? `${r === '/' ? '' : r}/*` : null;
  }
  const r = rutaInterna(s);
  return r && !r.includes('#') ? r : null;
}

/** Quita la barra final (salvo en `/`) para comparar rutas. */
const normal = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';

/** ¿La página coincide con el patrón? `/blog/*` incluye `/blog` y todo lo que cuelga de él. */
export function rutaCoincide(patron: string, pagina: string): boolean {
  const p = normal(pagina);
  if (patron === '*') return true;
  if (patron.endsWith('/*')) {
    const base = patron.slice(0, -2);
    return base === '' || p === base || p.startsWith(`${base}/`);
  }
  return normal(patron) === p;
}

export const coincidePaginas = (paginas: readonly string[], pagina: string): boolean => paginas.some((x) => rutaCoincide(x, pagina));

/** RN-17-3 · `/pago*`: las rutas reservadas para el pago (S13) nunca muestran popups. */
export const esRutaPago = (pagina: string): boolean => normal(pagina).startsWith(PREFIJO_PAGO);

/**
 * CP-131 y CP-132 · ¿Se le muestra el popup a este visitante en esta página? No, si está apagado, si es la página de
 * pago, si la página no está entre las del popup, si el visitante ya dejó su correo en él o si lo vio hace menos de
 * `frecuenciaDias` días (nunca menos de 7). `ultimaVez` y `ahora` en milisegundos.
 */
export function debeMostrarse(
  popup: { visible: boolean; paginas: readonly string[]; frecuenciaDias: number },
  pagina: string,
  ultimaVez: number | null,
  yaConvirtio: boolean,
  ahora: number,
): boolean {
  if (!popup.visible) return false;
  if (esRutaPago(pagina)) return false;
  if (!coincidePaginas(popup.paginas, pagina)) return false;
  if (yaConvirtio) return false;
  const dias = Math.max(FRECUENCIA_MINIMA_DIAS, popup.frecuenciaDias);
  return ultimaVez === null || !Number.isFinite(ultimaVez) || ahora - ultimaVez >= dias * DIA_MS;
}

const texto = (e: Record<string, unknown>, campo: keyof typeof LIMITES_POPUP & keyof DatosPopup, etiqueta: string, errores: ErrorCampoPopup[], obligatorio = true): string => {
  const v = e[campo];
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (v !== undefined && v !== null && typeof v !== 'string') errores.push({ campo, mensaje: `${etiqueta} es texto` });
  else if (obligatorio && !s) errores.push({ campo, mensaje: `Escribe ${etiqueta.toLowerCase()}` });
  else if (s.length > LIMITES_POPUP[campo]) errores.push({ campo, mensaje: `${etiqueta} tiene hasta ${LIMITES_POPUP[campo]} caracteres` });
  else if (CONTROL(s)) errores.push({ campo, mensaje: `${etiqueta} no puede llevar caracteres de control` });
  return s;
};

/**
 * Valida un popup completo (en un PATCH, la API mezcla primero el popup guardado con los cambios). Todo texto se guarda
 * plano: el sitio lo pone con `textContent`, nunca como HTML.
 */
export function validarPopup(entrada: unknown): { ok: true; datos: DatosPopup } | { ok: false; errores: ErrorCampoPopup[] } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, errores: [{ campo: 'popup', mensaje: 'El popup es un objeto' }] };
  const e = entrada as Record<string, unknown>;
  const errores: ErrorCampoPopup[] = [];
  const nombre = texto(e, 'nombre', 'El nombre', errores);
  const titulo = texto(e, 'titulo', 'El título', errores);
  const cuerpo = texto(e, 'texto', 'El texto', errores, false);
  const boton = texto(e, 'boton', 'El botón', errores);

  const tipo = e.tipo;
  if (!esTipoPopup(tipo)) errores.push({ campo: 'tipo', mensaje: `El tipo es uno de: ${TIPOS_POPUP.join(', ')}` });
  const idioma = e.idioma === undefined ? 'es' : e.idioma;
  if (idioma !== 'es' && idioma !== 'en') errores.push({ campo: 'idioma', mensaje: 'El idioma es es o en' });
  const disparador = e.disparador;
  if (!esDisparadorPopup(disparador)) errores.push({ campo: 'disparador', mensaje: `El disparador es uno de: ${DISPARADORES_POPUP.join(', ')}` });
  else if (tipo === 'barra' && disparador !== 'al_cargar') errores.push({ campo: 'disparador', mensaje: 'La barra solo se muestra «Al cargar»' });

  let valorDisparador: number | null = null;
  const unidad = esDisparadorPopup(disparador) ? UNIDAD_DISPARADOR[disparador] : undefined;
  if (unidad) {
    const v = e.valorDisparador;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < unidad.min || v > unidad.max) {
      errores.push({ campo: 'valorDisparador', mensaje: disparador === 'tiempo' ? `Los segundos van de ${unidad.min} a ${unidad.max}` : `El porcentaje va de ${unidad.min} a ${unidad.max}` });
    } else valorDisparador = v;
  }

  const paginas: string[] = [];
  const brutas = e.paginas === undefined ? ['*'] : e.paginas;
  if (!Array.isArray(brutas) || brutas.length === 0) errores.push({ campo: 'paginas', mensaje: 'Elige al menos una página (o «*» para todo el sitio)' });
  else if (brutas.length > LIMITES_POPUP.paginas) errores.push({ campo: 'paginas', mensaje: `Hasta ${LIMITES_POPUP.paginas} páginas por popup` });
  else {
    for (const b of brutas) {
      const p = patronPaginas(b);
      if (!p) errores.push({ campo: 'paginas', mensaje: `«${String(b).slice(0, 60)}» no es una ruta del sitio: usa /precios, /blog/* o *` });
      else if (esRutaPago(p === '*' ? '/' : p.replace(/\/\*$/, '') || '/')) errores.push({ campo: 'paginas', mensaje: 'Las páginas de pago nunca muestran popups' });
      else if (!paginas.includes(p)) paginas.push(p);
    }
  }

  const accion = e.accion;
  let enlaceDestino: string | null = null;
  if (!esAccionPopup(accion)) errores.push({ campo: 'accion', mensaje: `La acción es una de: ${ACCIONES_POPUP.join(', ')}` });
  else if (accion === 'enlace_interno') {
    enlaceDestino = rutaInterna(e.enlaceDestino);
    if (!enlaceDestino) errores.push({ campo: 'enlaceDestino', mensaje: 'El enlace es una ruta del sitio que empieza con /, por ejemplo /demo' });
  }

  const f = e.frecuenciaDias === undefined ? FRECUENCIA_MINIMA_DIAS : e.frecuenciaDias;
  if (typeof f !== 'number' || !Number.isInteger(f) || f < FRECUENCIA_MINIMA_DIAS || f > LIMITES_POPUP.frecuenciaMaxDias) {
    errores.push({ campo: 'frecuenciaDias', mensaje: `La frecuencia va de ${FRECUENCIA_MINIMA_DIAS} a ${LIMITES_POPUP.frecuenciaMaxDias} días (RN-17-3)` });
  }
  for (const c of ['visible', 'ficticio'] as const) {
    if (e[c] !== undefined && typeof e[c] !== 'boolean') errores.push({ campo: c, mensaje: `${c} es verdadero o falso` });
  }

  if (errores.length) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      nombre, tipo: tipo as TipoPopup, idioma: idioma as IdiomaPopup, disparador: disparador as DisparadorPopup, valorDisparador, paginas, titulo, texto: cuerpo, boton,
      accion: accion as AccionPopup, enlaceDestino, frecuenciaDias: f as number, visible: e.visible === true, ficticio: e.ficticio === true,
    },
  };
}

/** «Tiempo · 10 s», «Desplazamiento · 50 %», «Intención de salida». */
export function textoDisparador(d: DisparadorPopup, valor: number | null): string {
  const u = UNIDAD_DISPARADOR[d];
  return u && valor !== null ? `${ETIQUETA_DISPARADOR[d]} · ${valor} ${u.unidad}` : ETIQUETA_DISPARADOR[d];
}

/** «Todo el sitio» o las rutas separadas por comas. */
export const textoPaginas = (paginas: readonly string[]): string => (paginas.includes('*') ? 'Todo el sitio' : paginas.join(', '));

/** Conversiones sobre impresiones, en porcentaje con un decimal; null sin impresiones. */
export const tasaConversion = (impresiones: number, conversiones: number): number | null =>
  impresiones > 0 ? Math.round((Math.min(conversiones, impresiones) / impresiones) * 1000) / 10 : null;

/** El origen con que entran a Leads los correos de un popup (RN-17-1). */
export const ORIGEN_POPUP = etiquetaOrigen('popup');

/** Lo que el sitio recibe de un popup. */
export const aPopupPublico = (p: PopupPublico & Record<string, unknown>): PopupPublico => ({
  id: p.id, tipo: p.tipo, idioma: p.idioma, disparador: p.disparador, valorDisparador: p.valorDisparador, paginas: p.paginas, titulo: p.titulo, texto: p.texto,
  boton: p.boton, accion: p.accion, enlaceDestino: p.enlaceDestino, frecuenciaDias: p.frecuenciaDias,
});
