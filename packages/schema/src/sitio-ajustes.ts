/**
 * HU-1509 · Ajustes del sitio comercial (REQ-073, PNT-38): dominio, marca, analítica, WhatsApp, correo de leads y modo
 * mantenimiento. Una sola fila por plataforma. Nombre, dominio, logo, favicon y WhatsApp entran en la versión al
 * publicar (`ajustesPublicados`); el mantenimiento y el correo de leads valen al instante. Lo usan la API, `@aptio/db`,
 * el pre-render y la consola web.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

export type MimeMarca = 'image/svg+xml' | 'image/png';
export const TIPOS_MARCA = ['logo', 'favicon'] as const;
export type TipoMarca = (typeof TIPOS_MARCA)[number];
/** Un archivo de marca subido: su nombre publicado lleva el hash (`logo-1a2b3c4d.svg`) y no cambia nunca. */
export interface ArchivoMarca { archivo: string; mime: MimeMarca }

export interface AjustesSitio {
  /** Dominio sin protocolo ni ruta (`aptioscorm.com`); null = el de `SITIO_URL`. */
  dominio: string | null;
  nombre: string;
  logo: ArchivoMarca | null;
  favicon: ArchivoMarca | null;
  /** IDs guardados; se activan en el sitio con el banner de cookies (SUP-200). */
  analitica: { ga4: string | null; gtm: string | null; metaPixel: string | null };
  whatsapp: { visible: boolean; numero: string | null; mensaje: string | null };
  correoLeads: string | null;
  mantenimiento: { activo: boolean; mensaje: string | null; desde: string | null };
}

export const NOMBRE_POR_DEFECTO = 'Aptio SCORM';

export const AJUSTES_POR_DEFECTO: AjustesSitio = {
  dominio: null, nombre: NOMBRE_POR_DEFECTO, logo: null, favicon: null,
  analitica: { ga4: null, gtm: null, metaPixel: null },
  whatsapp: { visible: false, numero: null, mensaje: null },
  correoLeads: null,
  mantenimiento: { activo: false, mensaje: null, desde: null },
};

export const LIMITES_AJUSTES = { nombre: 60, mensajeWhatsapp: 200, mensajeMantenimiento: 280, correo: 254, marcaBytes: 200 * 1024 } as const;

/** Nombre de host en minúsculas con al menos un punto: sin protocolo, puerto, ruta ni comodín. */
export const DOMINIO = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const GA4 = /^G-[A-Z0-9]{4,12}$/;
export const GTM = /^GTM-[A-Z0-9]{4,10}$/;
export const META_PIXEL = /^\d{10,20}$/;
/** Número internacional E.164: `+` y de 8 a 15 dígitos (en Perú, `+51` y 9 dígitos). */
export const WHATSAPP = /^\+[1-9]\d{7,14}$/;
const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const ARCHIVO_MARCA = /^(logo|favicon)-[0-9a-f]{8}\.(svg|png)$/;

/** Lo que se guardó, completado con los valores por defecto (filas viejas o JSON incompleto). */
export function leerAjustes(v: unknown): AjustesSitio {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<AjustesSitio>;
  const d = AJUSTES_POR_DEFECTO;
  const archivo = (a: unknown): ArchivoMarca | null => {
    const x = a as Partial<ArchivoMarca> | null;
    return x && typeof x.archivo === 'string' && ARCHIVO_MARCA.test(x.archivo) && (x.mime === 'image/svg+xml' || x.mime === 'image/png') ? { archivo: x.archivo, mime: x.mime } : null;
  };
  return {
    dominio: typeof o.dominio === 'string' ? o.dominio : null,
    nombre: typeof o.nombre === 'string' && o.nombre ? o.nombre : d.nombre,
    logo: archivo(o.logo), favicon: archivo(o.favicon),
    analitica: { ...d.analitica, ...(o.analitica ?? {}) },
    whatsapp: { ...d.whatsapp, ...(o.whatsapp ?? {}) },
    correoLeads: typeof o.correoLeads === 'string' ? o.correoLeads : null,
    mantenimiento: { ...d.mantenimiento, ...(o.mantenimiento ?? {}) },
  };
}

/** Cambios que acepta `PATCH /sitio/ajustes` (logo y favicon se suben aparte). */
export interface CambiosAjustes {
  dominio?: string | null;
  nombre?: string;
  analitica?: Partial<AjustesSitio['analitica']>;
  whatsapp?: Partial<AjustesSitio['whatsapp']>;
  correoLeads?: string | null;
  mantenimiento?: { activo?: boolean; mensaje?: string | null };
}

export type ResultadoAjustes = { ok: true; ajustes: AjustesSitio } | { ok: false; errores: ErrorCampo[] };

const vacio = (s: string | null | undefined) => (s == null ? null : s.trim() || null);

/**
 * Mezcla los cambios con lo guardado y valida el resultado: dominio, nombre (texto plano, RN-16-7), los IDs de
 * analítica, WhatsApp (E.164, y obligatorio si el botón se muestra), el correo de leads y el mensaje de mantenimiento.
 * Un texto vacío se guarda como null. Al activar el mantenimiento se anota desde cuándo (`ahora`).
 */
export function aplicarCambiosAjustes(actual: AjustesSitio, c: CambiosAjustes, ahora: Date = new Date()): ResultadoAjustes {
  const errores: ErrorCampo[] = [];
  const a: AjustesSitio = structuredClone(actual);

  if (c.dominio !== undefined) {
    const d = vacio(c.dominio)?.toLowerCase().replace(/\.$/, '') ?? null;
    if (d !== null && !DOMINIO.test(d)) errores.push({ campo: 'dominio', mensaje: 'Escribe solo el dominio, sin https:// ni rutas: por ejemplo aptioscorm.com' });
    a.dominio = d;
  }
  if (c.nombre !== undefined) {
    const n = c.nombre.trim();
    if (!n) errores.push({ campo: 'nombre', mensaje: 'El nombre del sitio es obligatorio' });
    else if (n.length > LIMITES_AJUSTES.nombre) errores.push({ campo: 'nombre', mensaje: `El nombre del sitio admite hasta ${LIMITES_AJUSTES.nombre} caracteres` });
    else if (!esTextoPlano(n) || /[\n\r\t]/.test(n)) errores.push({ campo: 'nombre', mensaje: 'El nombre del sitio solo admite texto, sin etiquetas HTML' });
    a.nombre = n;
  }
  if (c.analitica) {
    const reglas = [['ga4', GA4, 'Google Analytics 4 empieza con G-, por ejemplo G-AB12CD34EF'], ['gtm', GTM, 'Tag Manager empieza con GTM-, por ejemplo GTM-AB12CD3'], ['metaPixel', META_PIXEL, 'El Meta Pixel son de 10 a 20 dígitos']] as const;
    for (const [clave, re, mensaje] of reglas) {
      if (c.analitica[clave] === undefined) continue;
      const v = vacio(c.analitica[clave])?.toUpperCase() ?? null;
      if (v !== null && !re.test(v)) errores.push({ campo: `analitica.${clave}`, mensaje });
      a.analitica[clave] = v;
    }
  }
  if (c.whatsapp) {
    if (c.whatsapp.numero !== undefined) {
      const n = vacio(c.whatsapp.numero)?.replace(/[\s()-]/g, '') ?? null;
      if (n !== null && !WHATSAPP.test(n)) errores.push({ campo: 'whatsapp.numero', mensaje: 'Escribe el número con el código de país, por ejemplo +51 987 654 321' });
      a.whatsapp.numero = n;
    }
    if (c.whatsapp.mensaje !== undefined) {
      const m = vacio(c.whatsapp.mensaje);
      if (m !== null && m.length > LIMITES_AJUSTES.mensajeWhatsapp) errores.push({ campo: 'whatsapp.mensaje', mensaje: `El mensaje admite hasta ${LIMITES_AJUSTES.mensajeWhatsapp} caracteres` });
      else if (m !== null && !esTextoPlano(m)) errores.push({ campo: 'whatsapp.mensaje', mensaje: 'El mensaje solo admite texto, sin etiquetas HTML' });
      a.whatsapp.mensaje = m;
    }
    if (c.whatsapp.visible !== undefined) a.whatsapp.visible = c.whatsapp.visible;
    if (a.whatsapp.visible && !a.whatsapp.numero && !errores.some((e) => e.campo === 'whatsapp.numero')) {
      errores.push({ campo: 'whatsapp.numero', mensaje: 'Para mostrar el botón de WhatsApp, escribe el número' });
    }
  }
  if (c.correoLeads !== undefined) {
    const v = vacio(c.correoLeads)?.toLowerCase() ?? null;
    if (v !== null && (v.length > LIMITES_AJUSTES.correo || !CORREO.test(v))) errores.push({ campo: 'correoLeads', mensaje: 'Escribe un correo válido, por ejemplo ventas@aulaseducativas.com' });
    a.correoLeads = v;
  }
  if (c.mantenimiento) {
    if (c.mantenimiento.mensaje !== undefined) {
      const m = vacio(c.mantenimiento.mensaje);
      if (m !== null && m.length > LIMITES_AJUSTES.mensajeMantenimiento) errores.push({ campo: 'mantenimiento.mensaje', mensaje: `El aviso admite hasta ${LIMITES_AJUSTES.mensajeMantenimiento} caracteres` });
      else if (m !== null && !esTextoPlano(m)) errores.push({ campo: 'mantenimiento.mensaje', mensaje: 'El aviso solo admite texto, sin etiquetas HTML' });
      a.mantenimiento.mensaje = m;
    }
    if (c.mantenimiento.activo !== undefined && c.mantenimiento.activo !== a.mantenimiento.activo) {
      a.mantenimiento.activo = c.mantenimiento.activo;
      a.mantenimiento.desde = c.mantenimiento.activo ? ahora.toISOString() : null;
    }
  }
  return errores.length ? { ok: false, errores } : { ok: true, ajustes: a };
}

/** Lo que entra en la versión del sitio al publicar y usa el pre-render. */
export interface SitioPublicado {
  nombre: string;
  dominio: string | null;
  logo: ArchivoMarca | null;
  favicon: ArchivoMarca | null;
  whatsapp: { numero: string; mensaje: string | null } | null;
}

export function ajustesPublicados(a: AjustesSitio): SitioPublicado {
  return {
    nombre: a.nombre, dominio: a.dominio, logo: a.logo, favicon: a.favicon,
    whatsapp: a.whatsapp.visible && a.whatsapp.numero ? { numero: a.whatsapp.numero, mensaje: a.whatsapp.mensaje } : null,
  };
}

/** El enlace de WhatsApp del botón flotante (`wa.me`, sin el `+`). */
export function enlaceWhatsapp(w: { numero: string; mensaje: string | null }): string {
  return `https://wa.me/${w.numero.slice(1)}${w.mensaje ? `?text=${encodeURIComponent(w.mensaje)}` : ''}`;
}

/** Nombre publicado de un archivo de marca: tipo, 8 caracteres de su sha256 y la extensión. */
export function nombreArchivoMarca(tipo: TipoMarca, sha256Hex: string, mime: MimeMarca): string {
  return `${tipo}-${sha256Hex.slice(0, 8)}.${mime === 'image/png' ? 'png' : 'svg'}`;
}

export const esArchivoMarca = (archivo: string): boolean => ARCHIVO_MARCA.test(archivo);

/** Cabecera de un PNG (8 bytes). */
export function esPng(b: Uint8Array): boolean {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return b.length > 8 && firma.every((x, i) => b[i] === x);
}
