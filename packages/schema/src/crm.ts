/**
 * HU-1602 · Integración con CRM (REQ-075, PNT-34, RN-17-2). Reglas puras que comparten la API, el worker y la web: el
 * catálogo de conexiones (HubSpot, Pipedrive, Zoho y el webhook firmado), los campos del lead que se pueden enviar, el
 * mapeo de campos y sus valores por defecto, la URL del webhook (solo https:// y sin red interna), el motivo de un error
 * sin claves y el resumen del estado CRM de un lead. La firma HMAC y los clientes HTTP viven en `./crm-envio` (Node).
 */
import { esIpPrivada } from './sitio-blog.js';
import { etiquetaEtapa, etiquetaOrigen } from './leads.js';

export const TIPOS_CRM = ['hubspot', 'pipedrive', 'zoho', 'webhook'] as const;
export type TipoCrm = (typeof TIPOS_CRM)[number];
export const esTipoCrm = (v: unknown): v is TipoCrm => typeof v === 'string' && (TIPOS_CRM as readonly string[]).includes(v);
export const NOMBRE_CRM: Record<TipoCrm, string> = { hubspot: 'HubSpot', pipedrive: 'Pipedrive', zoho: 'Zoho CRM', webhook: 'Webhook' };
/** Lo que cada conexión crea o actualiza en el destino (texto del prototipo). */
export const DESCRIPCION_CRM: Record<TipoCrm, string> = { hubspot: 'Contactos', pipedrive: 'Personas', zoho: 'Leads', webhook: 'POST con firma HMAC' };
/** Los CRM con mapeo de campos; el webhook manda siempre el lead completo con un formato fijo. */
export const CRM_CON_MAPEO = ['hubspot', 'pipedrive', 'zoho'] as const;
export type CrmConMapeo = (typeof CRM_CON_MAPEO)[number];
export const tieneMapeo = (t: TipoCrm): t is CrmConMapeo => t !== 'webhook';

/** Variables de entorno con la clave de cada CRM (como Conexiones IA, las claves no se guardan en la base). */
export const VARIABLES_CRM: Record<CrmConMapeo, readonly string[]> = {
  hubspot: ['HUBSPOT_TOKEN'],
  pipedrive: ['PIPEDRIVE_TOKEN'],
  zoho: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'],
};
/** Centros de datos de Zoho: `ZOHO_DOMINIO` (por defecto `com`). */
export const DOMINIOS_ZOHO = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn'] as const;

export const CAMPOS_LEAD_CRM = ['nombre', 'correo', 'empresa', 'mensaje', 'origen', 'via', 'etapa', 'paginaEntrada', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'idioma'] as const;
export type CampoLeadCrm = (typeof CAMPOS_LEAD_CRM)[number];
export const ETIQUETA_CAMPO_CRM: Record<CampoLeadCrm, string> = {
  nombre: 'Nombre', correo: 'Correo', empresa: 'Empresa', mensaje: 'Mensaje', origen: 'Origen', via: 'Vía', etapa: 'Etapa', paginaEntrada: 'Página de entrada',
  utmSource: 'utm_source', utmMedium: 'utm_medium', utmCampaign: 'utm_campaign', utmTerm: 'utm_term', utmContent: 'utm_content', idioma: 'Idioma',
};
/** Campo del sitio → propiedad del CRM. Un campo sin propiedad no se envía. */
export type MapeoCrm = Partial<Record<CampoLeadCrm, string>>;

/**
 * Propiedades estándar de cada CRM (SUP-243: no verificadas contra cuentas reales). El correo siempre va porque es la
 * clave del alta o actualización; el resto se ajusta en el panel.
 */
export const MAPEO_POR_DEFECTO: Record<CrmConMapeo, MapeoCrm> = {
  hubspot: { correo: 'email', nombre: 'firstname', empresa: 'company', mensaje: 'message' },
  pipedrive: { correo: 'email', nombre: 'name' },
  zoho: { correo: 'Email', nombre: 'Last_Name', empresa: 'Company', mensaje: 'Description' },
};
/** La propiedad con la que cada CRM busca el contacto para no duplicarlo. */
export const PROPIEDAD_CORREO: Record<CrmConMapeo, string> = { hubspot: 'email', pipedrive: 'email', zoho: 'Email' };

export const LIMITES_CRM = { propiedad: 100, url: 300, motivo: 300 } as const;
const PROPIEDAD = /^[A-Za-z][A-Za-z0-9_.]{0,99}$/;

export interface ErrorCampoCrm { campo: string; mensaje: string }

/** El mapeo de un CRM: solo campos del catálogo, propiedades válidas y sin repetir, y el correo siempre a su propiedad. */
export function validarMapeo(tipo: CrmConMapeo, entrada: unknown): { ok: true; mapeo: MapeoCrm } | { ok: false; errores: ErrorCampoCrm[] } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, errores: [{ campo: 'mapeo', mensaje: 'El mapeo es un objeto de campo a propiedad' }] };
  const errores: ErrorCampoCrm[] = [];
  const mapeo: MapeoCrm = {};
  const usadas = new Map<string, string>();
  for (const [campo, valor] of Object.entries(entrada as Record<string, unknown>)) {
    if (!(CAMPOS_LEAD_CRM as readonly string[]).includes(campo)) {
      errores.push({ campo: `mapeo.${campo}`, mensaje: `«${campo}» no es un campo del lead` });
      continue;
    }
    if (valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')) continue;
    const etiqueta = ETIQUETA_CAMPO_CRM[campo as CampoLeadCrm];
    if (typeof valor !== 'string' || !PROPIEDAD.test(valor.trim())) {
      errores.push({ campo: `mapeo.${campo}`, mensaje: `La propiedad de ${etiqueta} lleva letras, números, «_» o «.», empieza con letra y tiene hasta ${LIMITES_CRM.propiedad} caracteres` });
      continue;
    }
    const p = valor.trim();
    const otra = usadas.get(p.toLowerCase());
    if (otra) {
      errores.push({ campo: `mapeo.${campo}`, mensaje: `La propiedad «${p}» ya está asignada a ${otra}` });
      continue;
    }
    usadas.set(p.toLowerCase(), etiqueta);
    mapeo[campo as CampoLeadCrm] = p;
  }
  if (!errores.length && mapeo.correo !== PROPIEDAD_CORREO[tipo]) errores.push({ campo: 'mapeo.correo', mensaje: `El correo va siempre a «${PROPIEDAD_CORREO[tipo]}»: con él ${NOMBRE_CRM[tipo]} encuentra el contacto y no lo duplica` });
  return errores.length ? { ok: false, errores } : { ok: true, mapeo };
}

/** El mapeo guardado, o el de por defecto si está vacío o no es válido (una fila editada a mano no rompe el envío). */
export function mapeoDe(tipo: CrmConMapeo, guardado: unknown): MapeoCrm {
  const r = validarMapeo(tipo, guardado);
  return r.ok && Object.keys(r.mapeo).length ? r.mapeo : { ...MAPEO_POR_DEFECTO[tipo] };
}

/** Lo que el lead tiene para enviar; los catálogos van con su etiqueta en español, como se ven en el panel. */
export interface LeadParaCrm {
  id: string; correo: string; nombre: string; empresa: string | null; mensaje: string | null; origen: string; via: string; etapa: string; paginaEntrada: string;
  paginaFormulario: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmTerm: string | null; utmContent: string | null;
  referente: string | null; idioma: string; totalContactos: number; creadoEn: Date | string; actualizadoEn: Date | string;
}

export function valorCampo(lead: LeadParaCrm, campo: CampoLeadCrm): string | null {
  const v = campo === 'origen' || campo === 'via' ? etiquetaOrigen(lead[campo]) : campo === 'etapa' ? etiquetaEtapa(lead.etapa) : lead[campo];
  return v === null || v === undefined || v === '' ? null : String(v);
}

/** Las propiedades que se mandan al CRM: solo los campos mapeados y con valor. */
export function propiedadesCrm(lead: LeadParaCrm, mapeo: MapeoCrm): Record<string, string> {
  const r: Record<string, string> = {};
  for (const campo of CAMPOS_LEAD_CRM) {
    const p = mapeo[campo];
    const v = p ? valorCampo(lead, campo) : null;
    if (p && v !== null) r[p] = v;
  }
  return r;
}

export type ResultadoUrlWebhook = { ok: true; url: string | null } | { ok: false; mensaje: string };
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** La URL del webhook: https:// con dominio público y puerto 443, sin usuario ni clave ni ancla (SSRF). Vacía = sin URL. */
export function validarUrlWebhook(entrada: unknown): ResultadoUrlWebhook {
  if (entrada === null || (typeof entrada === 'string' && entrada.trim() === '')) return { ok: true, url: null };
  if (typeof entrada !== 'string') return { ok: false, mensaje: 'La URL del webhook debe ser texto' };
  const t = entrada.trim();
  if (t.length > LIMITES_CRM.url) return { ok: false, mensaje: `La URL del webhook admite hasta ${LIMITES_CRM.url} caracteres` };
  if (!/^https:\/\//i.test(t)) return { ok: false, mensaje: 'La URL del webhook empieza con https://' };
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, mensaje: 'La URL del webhook no es válida' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (u.username || u.password || u.hash || (u.port && u.port !== '443')) return { ok: false, mensaje: 'La URL del webhook va sin usuario, clave, puerto ni ancla' };
  if (IPV4.test(host) || host.includes(':')) {
    return { ok: false, mensaje: esIpPrivada(host) ? 'La URL del webhook no puede apuntar a la red interna' : 'La URL del webhook usa un dominio, no una dirección IP' };
  }
  if (!host.includes('.') || host === 'localhost' || /\.(local|localhost|internal|lan|home|test|example|invalid)$/.test(host)) return { ok: false, mensaje: 'La URL del webhook necesita un dominio público' };
  return { ok: true, url: u.toString() };
}

/** El motivo de un error tal como se guarda y se muestra: sin claves, sin saltos y corto (RN-17-2). */
export function motivoSeguro(texto: string, secretos: readonly (string | null | undefined)[] = []): string {
  let s = String(texto);
  for (const x of secretos) if (x && x.length >= 4) s = s.split(x).join('***');
  // Por si el texto trae una clave que no conocemos: parámetros y cabeceras típicas de credenciales.
  s = s.replace(/(api_token|access_token|refresh_token|client_secret|token|authorization)(["'=:\s]+)(Bearer\s+)?[^\s"'&,;]+/gi, '$1$2***');
  s = [...s].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();
  return s.length > LIMITES_CRM.motivo ? `${s.slice(0, LIMITES_CRM.motivo - 1)}…` : s || 'Error sin detalle';
}

export const ESTADOS_ENVIO = ['pendiente', 'enviado', 'error'] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];
export interface EnvioCrm { tipo: TipoCrm; estado: EstadoEnvio | string; motivo: string | null }
export type EstadoCrmLead = 'sincronizado' | 'pendiente' | 'error' | 'sin_envio';

/**
 * El estado CRM de un lead para la columna «CRM»: un error manda (con su conexión y motivo), luego lo pendiente; si todo
 * se envió, «Sincronizado». Sin envíos (ninguna conexión activa cuando llegó) dice «Sin enviar».
 */
export function resumenCrm(envios: readonly EnvioCrm[]): { estado: EstadoCrmLead; texto: string } {
  const error = envios.find((e) => e.estado === 'error');
  if (error) return { estado: 'error', texto: `Error: ${error.motivo || `${NOMBRE_CRM[error.tipo]} no recibió el lead`}` };
  if (envios.some((e) => e.estado !== 'enviado')) return { estado: 'pendiente', texto: 'Pendiente' };
  return envios.length ? { estado: 'sincronizado', texto: 'Sincronizado' } : { estado: 'sin_envio', texto: 'Sin enviar' };
}

/** Eventos del webhook: el alta, un contacto nuevo o un cambio de etapa (actualizado), y la prueba del panel. */
export const EVENTOS_CRM = ['lead.creado', 'lead.actualizado', 'lead.prueba'] as const;
export type EventoCrm = (typeof EVENTOS_CRM)[number];
