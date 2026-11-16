/**
 * HU-1601 · Leads del sitio comercial con origen, página de entrada y UTM (REQ-074, PNT-34, CP-128, RN-17-1). Reglas
 * puras que usan la API, el sitio público, la consola web y la simulación de Playwright:
 * - el catálogo de orígenes y de etapas del embudo;
 * - la validación de lo que envía un visitante (datos no confiables: texto plano, RN-16-7) y el campo trampa;
 * - la lectura de los 5 parámetros `utm_*` y la regla de atribución («si el referente es un asistente de IA, el
 *   origen es Asistente IA» y la vía conserva el canal que capturó el lead);
 * - un lead por correo: la atribución es la del primer contacto y cada envío posterior suma al historial;
 * - el CSV de exportación, con las celdas neutralizadas contra la inyección de fórmulas.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

export const LIMITES_LEAD = { nombre: 120, correo: 254, empresa: 160, mensaje: 2000, pagina: 300, utm: 150, referente: 500, historial: 50, porPagina: 50, exportar: 5000 } as const;

// ── Catálogos ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Los orígenes de RN-17-1, en el orden de los filtros. */
export const ORIGENES_LEAD = ['formulario', 'popup', 'chatbot', 'agendador', 'suscripcion', 'boletin', 'asistente_ia'] as const;
export type OrigenLead = (typeof ORIGENES_LEAD)[number];
export const ETIQUETA_ORIGEN: Record<OrigenLead, string> = {
  formulario: 'Formulario', popup: 'Popup', chatbot: 'Chatbot', agendador: 'Agendador', suscripcion: 'Suscripción', boletin: 'Boletín', asistente_ia: 'Asistente IA',
};
export const esOrigenLead = (v: unknown): v is OrigenLead => typeof v === 'string' && (ORIGENES_LEAD as readonly string[]).includes(v);

/** La vía es el canal que capturó el lead: cualquier origen menos «asistente de IA», que se deduce del referente. */
export const VIAS_LEAD = ['formulario', 'popup', 'chatbot', 'agendador', 'suscripcion', 'boletin'] as const;
export type ViaLead = (typeof VIAS_LEAD)[number];
export const esViaLead = (v: unknown): v is ViaLead => typeof v === 'string' && (VIAS_LEAD as readonly string[]).includes(v);
/** Las vías donde el visitante escribe su nombre; en las demás basta el correo (CP-128: «deja su correo en el popup»). */
const VIAS_CON_NOMBRE: readonly ViaLead[] = ['formulario', 'agendador'];

export const ETAPAS_LEAD = ['NUEVO', 'CONTACTADO', 'DEMO', 'PROPUESTA', 'GANADO', 'PERDIDO'] as const;
export type EtapaLead = (typeof ETAPAS_LEAD)[number];
export const ETIQUETA_ETAPA: Record<EtapaLead, string> = { NUEVO: 'Nuevo', CONTACTADO: 'Contactado', DEMO: 'Demo', PROPUESTA: 'Propuesta', GANADO: 'Ganado', PERDIDO: 'Perdido' };
export const esEtapaLead = (v: unknown): v is EtapaLead => typeof v === 'string' && (ETAPAS_LEAD as readonly string[]).includes(v);

export const etiquetaOrigen = (v: string): string => (esOrigenLead(v) ? ETIQUETA_ORIGEN[v] : v);
export const etiquetaEtapa = (v: string): string => (esEtapaLead(v) ? ETIQUETA_ETAPA[v] : v);

// ── UTM y atribución ─────────────────────────────────────────────────────────────────────────────────────────────────

export const PARAMETROS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type ParametroUtm = (typeof PARAMETROS_UTM)[number];
export interface Utm { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmTerm: string | null; utmContent: string | null }
export const CAMPO_UTM: Record<ParametroUtm, keyof Utm> = { utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign', utm_term: 'utmTerm', utm_content: 'utmContent' };
export const UTM_VACIO: Utm = { utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null };

const unaLinea = (v: unknown): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();

/** Un valor de UTM: una línea de texto plano de hasta 150 caracteres; fuente y medio, en minúsculas. Si no sirve, `null`. */
function valorUtm(v: unknown, minusculas: boolean): string | null {
  const t = unaLinea(Array.isArray(v) ? v[0] : v).slice(0, LIMITES_LEAD.utm);
  if (!t || !esTextoPlano(t)) return null;
  return minusculas ? t.toLowerCase() : t;
}

/**
 * Los 5 parámetros `utm_*` de una cadena de consulta (`?utm_source=linkedin&…`), de un `URLSearchParams` o de un objeto
 * con esas claves. Lo que falta o no es texto plano queda en `null`.
 */
export function leerUtm(entrada: string | URLSearchParams | Record<string, unknown> | null | undefined): Utm {
  let leer: (k: string) => unknown;
  if (typeof entrada === 'string') {
    const q = new URLSearchParams(entrada.includes('?') ? entrada.slice(entrada.indexOf('?') + 1).split('#')[0] : entrada);
    leer = (k) => q.get(k);
  } else if (entrada instanceof URLSearchParams) leer = (k) => entrada.get(k);
  else leer = (k) => (entrada && typeof entrada === 'object' ? (entrada as Record<string, unknown>)[k] : undefined);
  const utm: Utm = { ...UTM_VACIO };
  for (const p of PARAMETROS_UTM) utm[CAMPO_UTM[p]] = valorUtm(leer(p), p === 'utm_source' || p === 'utm_medium');
  return utm;
}

/** «linkedin / social», «linkedin» o «directo»: el resumen de la fuente y el medio para la tabla y el CSV. */
export function resumenUtm(l: Pick<Utm, 'utmSource' | 'utmMedium'>): string {
  if (!l.utmSource && !l.utmMedium) return 'directo';
  return [l.utmSource ?? '(sin fuente)', ...(l.utmMedium ? [l.utmMedium] : [])].join(' / ');
}

/** Los asistentes de IA que se reconocen por el dominio del referente (o de `utm_source`, que algunos agregan solos). */
export const ASISTENTES_REFERENTE: readonly { nombre: string; dominios: readonly string[] }[] = [
  { nombre: 'ChatGPT', dominios: ['chatgpt.com', 'chat.openai.com'] },
  { nombre: 'Claude', dominios: ['claude.ai'] },
  { nombre: 'Gemini', dominios: ['gemini.google.com', 'bard.google.com'] },
  { nombre: 'Perplexity', dominios: ['perplexity.ai'] },
  { nombre: 'Copilot', dominios: ['copilot.microsoft.com'] },
  { nombre: 'DeepSeek', dominios: ['chat.deepseek.com'] },
  { nombre: 'Le Chat', dominios: ['chat.mistral.ai'] },
  { nombre: 'Meta AI', dominios: ['meta.ai'] },
  { nombre: 'Poe', dominios: ['poe.com'] },
  { nombre: 'You.com', dominios: ['you.com'] },
];

function dominioDe(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** El asistente de IA del que viene la visita, por el dominio del referente o de `utm_source`; si no es ninguno, `null`. */
export function asistenteDe(referente: string | null | undefined, utmSource?: string | null): string | null {
  for (const v of [referente, utmSource]) {
    const d = v ? dominioDe(v) : null;
    if (!d) continue;
    const a = ASISTENTES_REFERENTE.find((x) => x.dominios.some((dom) => d === dom || d.endsWith(`.${dom}`)));
    if (a) return a.nombre;
  }
  return null;
}

/** RN-17-1 · El origen del lead: «asistente_ia» si el referente es un asistente; si no, la vía que lo capturó. */
export function atribuir(d: { via: ViaLead; referente?: string | null; utmSource?: string | null }): { origen: OrigenLead; via: ViaLead } {
  return { origen: asistenteDe(d.referente, d.utmSource) ? 'asistente_ia' : d.via, via: d.via };
}

/**
 * Una página del sitio como ruta interna (`/precios`), sin consulta ni ancla y sin la base donde se sirve (`/s`).
 * Acepta una URL completa y se queda con su ruta. Si no es una ruta de texto plano, `null`.
 */
export function normalizarPagina(v: unknown, base = ''): string | null {
  let t = unaLinea(v);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      t = new URL(t).pathname;
    } catch {
      return null;
    }
  }
  t = t.split(/[?#]/)[0]!;
  const b = base.replace(/\/+$/, '');
  if (b && (t === b || t.startsWith(`${b}/`))) t = t.slice(b.length) || '/';
  if (!t.startsWith('/') || t.startsWith('//') || /\s/.test(t) || !esTextoPlano(t)) return null;
  t = t.length > 1 ? t.replace(/\/+$/, '') || '/' : t;
  return t.length > LIMITES_LEAD.pagina ? null : t;
}

/** El referente como origen y ruta (sin consulta, que puede traer datos personales). Si no es una URL http(s), `null`. */
export function normalizarReferente(v: unknown): string | null {
  const t = unaLinea(v);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const r = `${u.origin}${u.pathname}`.slice(0, LIMITES_LEAD.referente);
    return esTextoPlano(r) ? r : null;
  } catch {
    return null;
  }
}

// ── Entrada pública ──────────────────────────────────────────────────────────────────────────────────────────────────

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
/** El campo trampa del formulario: oculto para las personas; un bot que lo llena queda descartado en silencio. */
export const CAMPO_TRAMPA = 'website';
const ACEPTA = new Set([true, 'true', 'on', '1', 'si']);

export interface EnvioLead extends Utm {
  correo: string; nombre: string; empresa: string | null; mensaje: string | null;
  via: ViaLead; paginaEntrada: string; paginaFormulario: string | null; referente: string | null; idioma: 'es' | 'en';
}
export type ResultadoEnvio = { ok: true; trampa: true } | { ok: true; trampa: false; envio: EnvioLead } | { ok: false; errores: ErrorCampo[] };

/**
 * Valida lo que envía un visitante (JSON de `POST /publico/leads` o los campos del formulario HTML). Todo es texto no
 * confiable: se recorta, debe ser texto plano y nunca se interpreta. El consentimiento es obligatorio (Ley 29733).
 * Con el campo trampa lleno responde `trampa: true` y no se guarda nada. `base` es donde se sirve el sitio (`/s`).
 */
export function validarEnvioLead(entrada: unknown, base = ''): ResultadoEnvio {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  if (unaLinea(e[CAMPO_TRAMPA])) return { ok: true, trampa: true };
  const errores: ErrorCampo[] = [];
  const via = e.via === undefined || e.via === '' ? 'formulario' : e.via;
  if (!esViaLead(via)) errores.push({ campo: 'via', mensaje: `La vía es una de: ${VIAS_LEAD.join(', ')}` });

  const correo = unaLinea(e.correo).toLowerCase();
  if (!correo) errores.push({ campo: 'correo', mensaje: 'Escribe tu correo' });
  else if (correo.length > LIMITES_LEAD.correo || !CORREO.test(correo)) errores.push({ campo: 'correo', mensaje: 'Escribe un correo válido, por ejemplo nombre@empresa.com' });

  const texto = (campo: 'nombre' | 'empresa', etiqueta: string): string => {
    const t = unaLinea(e[campo]);
    if (t.length > LIMITES_LEAD[campo]) errores.push({ campo, mensaje: `${etiqueta} admite hasta ${LIMITES_LEAD[campo]} caracteres` });
    else if (!esTextoPlano(t)) errores.push({ campo, mensaje: `${etiqueta} solo admite texto, sin etiquetas HTML` });
    return t;
  };
  const nombre = texto('nombre', 'El nombre');
  if (!nombre && esViaLead(via) && VIAS_CON_NOMBRE.includes(via)) errores.push({ campo: 'nombre', mensaje: 'Escribe tu nombre' });
  const empresa = texto('empresa', 'La empresa');
  const mensaje = (typeof e.mensaje === 'string' ? e.mensaje : '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (mensaje.length > LIMITES_LEAD.mensaje) errores.push({ campo: 'mensaje', mensaje: `El mensaje admite hasta ${LIMITES_LEAD.mensaje} caracteres` });
  else if (!esTextoPlano(mensaje.replace(/\n/g, ' '))) errores.push({ campo: 'mensaje', mensaje: 'El mensaje solo admite texto, sin etiquetas HTML' });

  if (!ACEPTA.has(e.consentimiento as string | boolean)) errores.push({ campo: 'consentimiento', mensaje: 'Acepta el tratamiento de tus datos personales para poder contactarte' });
  if (errores.length) return { ok: false, errores };

  // La atribución es de mejor esfuerzo: un valor que no sirve se descarta, nunca rechaza el lead (REQ-074).
  const paginaFormulario = normalizarPagina(e.paginaFormulario, base);
  const paginaEntrada = normalizarPagina(e.paginaEntrada, base) ?? paginaFormulario ?? '/';
  return {
    ok: true, trampa: false,
    envio: {
      correo, nombre, empresa: empresa || null, mensaje: mensaje || null, via: via as ViaLead, paginaEntrada, paginaFormulario,
      ...leerUtm(e), referente: normalizarReferente(e.referente), idioma: e.idioma === 'en' ? 'en' : 'es',
    },
  };
}

// ── Un lead por correo ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ContactoLead { en: string; via: ViaLead; pagina: string; mensaje?: string }

export const contactoDe = (envio: EnvioLead, ahora: Date): ContactoLead => ({
  en: ahora.toISOString(), via: envio.via, pagina: envio.paginaFormulario ?? envio.paginaEntrada, ...(envio.mensaje ? { mensaje: envio.mensaje } : {}),
});

export function leerHistorial(v: unknown): ContactoLead[] {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is ContactoLead => !!c && typeof c === 'object' && typeof (c as ContactoLead).en === 'string' && esViaLead((c as ContactoLead).via) && typeof (c as ContactoLead).pagina === 'string');
}

export interface DatosLeadNuevo extends EnvioLead {
  origen: OrigenLead; consentimiento: true; consentimientoEn: Date; totalContactos: 1; historialContactos: ContactoLead[];
}

/** El primer contacto de un correo: fija el origen, la vía, la página de entrada y el UTM. */
export function leadNuevo(envio: EnvioLead, ahora: Date): DatosLeadNuevo {
  return { ...envio, ...atribuir(envio), consentimiento: true, consentimientoEn: ahora, totalContactos: 1, historialContactos: [contactoDe(envio, ahora)] };
}

export interface LeadGuardado { nombre: string; empresa: string | null; mensaje: string | null; totalContactos: number; historialContactos: unknown; consentimientoEn: Date | null }
export interface CambiosLead { nombre?: string; empresa?: string; mensaje?: string; consentimiento: true; consentimientoEn?: Date; totalContactos: number; historialContactos: ContactoLead[] }

/**
 * Otro envío del mismo correo: no toca el origen, la vía, la página de entrada ni el UTM del primer contacto. Completa
 * el nombre, la empresa y el mensaje solo si faltaban, suma el envío al historial (los 50 más recientes) y cuenta uno más.
 */
export function fusionarLead(actual: LeadGuardado, envio: EnvioLead, ahora: Date): CambiosLead {
  return {
    ...(!actual.nombre && envio.nombre ? { nombre: envio.nombre } : {}),
    ...(!actual.empresa && envio.empresa ? { empresa: envio.empresa } : {}),
    ...(!actual.mensaje && envio.mensaje ? { mensaje: envio.mensaje } : {}),
    consentimiento: true,
    ...(actual.consentimientoEn ? {} : { consentimientoEn: ahora }),
    totalContactos: actual.totalContactos + 1,
    historialContactos: [...leerHistorial(actual.historialContactos), contactoDe(envio, ahora)].slice(-LIMITES_LEAD.historial),
  };
}

// ── Exportación CSV ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Una celda de CSV. Si empieza con `=`, `+`, `-`, `@`, tabulador o retorno, una hoja de cálculo la tomaría como fórmula:
 * se le antepone un apóstrofo. Siempre va entre comillas, con las comillas dobladas.
 */
export function celdaCsv(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

export interface LeadCsv extends Utm {
  creadoEn: Date | string; nombre: string; correo: string; empresa: string | null; origen: string; via: string; paginaEntrada: string; paginaFormulario: string | null;
  referente: string | null; idioma: string; etapa: string; totalContactos: number; mensaje: string | null;
}
export const COLUMNAS_CSV = ['Fecha', 'Nombre', 'Correo', 'Empresa', 'Origen', 'Vía', 'Página de entrada', 'Página del formulario', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'Referente', 'Idioma', 'Etapa', 'Contactos', 'Mensaje'] as const;

/** El CSV de los leads (UTF-8 con BOM y CRLF, para que Excel lo abra bien), del más nuevo al más antiguo como llegue. */
export function leadsACsv(leads: readonly LeadCsv[]): string {
  const filas = leads.map((l) => [
    typeof l.creadoEn === 'string' ? l.creadoEn : l.creadoEn.toISOString(), l.nombre, l.correo, l.empresa, etiquetaOrigen(l.origen), etiquetaOrigen(l.via), l.paginaEntrada, l.paginaFormulario,
    l.utmSource, l.utmMedium, l.utmCampaign, l.utmTerm, l.utmContent, l.referente, l.idioma, etiquetaEtapa(l.etapa), l.totalContactos, l.mensaje,
  ]);
  return `﻿${[COLUMNAS_CSV as readonly unknown[], ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n')}\r\n`;
}
