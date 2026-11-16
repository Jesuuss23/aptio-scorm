/**
 * HU-1602 · Envío de un lead a un CRM o al webhook firmado (REQ-075, RN-17-2, CP-129, CP-130). Solo Node: lo usan el
 * worker (cola `crm`) y la API («Enviar prueba»). Cada pedido tiene 10 s, no sigue redirecciones y el motivo de un error
 * nunca lleva claves. Los clientes de HubSpot, Pipedrive y Zoho siguen sus API públicas y están probados solo con
 * respuestas simuladas hasta tener cuentas reales (SUP-243).
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  type CrmConMapeo, DOMINIOS_ZOHO, type EventoCrm, type LeadParaCrm, type MapeoCrm, motivoSeguro, NOMBRE_CRM, PROPIEDAD_CORREO, propiedadesCrm, type TipoCrm, VARIABLES_CRM,
} from './crm.js';
import { esIpPrivada } from './sitio-blog.js';

export const CABECERA_FIRMA = 'X-Aptio-Firma';
export const CABECERA_EVENTO = 'X-Aptio-Evento';
export const CABECERA_ENTREGA = 'X-Aptio-Entrega';
/** Una firma más vieja que esto se rechaza al verificar (repetición de un envío capturado). */
export const TOLERANCIA_FIRMA_S = 300;
export const ESPERA_CRM_MS = 10_000;

/** Una clave nueva del webhook: 32 bytes al azar con prefijo, para reconocerla si se pega donde no va. */
export const generarSecreto = () => `whsec_${randomBytes(32).toString('base64url')}`;

const hmac = (secreto: string, t: number, cuerpo: string) => createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex');

/** `t=<unix>,v1=<hex>` con el HMAC-SHA256 de `${t}.${cuerpo}` (CP-130). */
export function firmar(cuerpo: string, secreto: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${hmac(secreto, t, cuerpo)}`;
}

export type ResultadoFirma = { ok: true } | { ok: false; motivo: 'formato' | 'vencida' | 'no_coincide' };

/** Lo que hace el receptor: misma clave, mismo cuerpo exacto y no más de 5 minutos de diferencia. */
export function verificarFirma(cabecera: string | null | undefined, cuerpo: string, secreto: string, ahoraS = Math.floor(Date.now() / 1000), toleranciaS = TOLERANCIA_FIRMA_S): ResultadoFirma {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(cabecera?.trim() ?? '');
  if (!m) return { ok: false, motivo: 'formato' };
  const t = Number(m[1]);
  if (Math.abs(ahoraS - t) > toleranciaS) return { ok: false, motivo: 'vencida' };
  const esperada = Buffer.from(hmac(secreto, t, cuerpo), 'hex');
  const recibida = Buffer.from(m[2]!, 'hex');
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? { ok: true } : { ok: false, motivo: 'no_coincide' };
}

/** El cuerpo del webhook: formato fijo y versionado, con el lead completo. */
export function cuerpoWebhook(evento: EventoCrm, entrega: string, lead: LeadParaCrm, ahora = new Date()): string {
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
  return JSON.stringify({
    version: 1, evento, entrega, enviadoEn: ahora.toISOString(),
    lead: {
      id: lead.id, correo: lead.correo, nombre: lead.nombre, empresa: lead.empresa, mensaje: lead.mensaje, origen: lead.origen, via: lead.via, etapa: lead.etapa,
      paginaEntrada: lead.paginaEntrada, paginaFormulario: lead.paginaFormulario, referente: lead.referente, idioma: lead.idioma, totalContactos: lead.totalContactos,
      utm: { source: lead.utmSource, medium: lead.utmMedium, campaign: lead.utmCampaign, term: lead.utmTerm, content: lead.utmContent },
      creadoEn: iso(lead.creadoEn), actualizadoEn: iso(lead.actualizadoEn),
    },
  });
}

/** El lead de ejemplo de «Enviar prueba» (evento `lead.prueba`: el receptor no debe guardarlo). */
export const LEAD_PRUEBA: LeadParaCrm = {
  id: '00000000-0000-4000-8000-000000000000', correo: 'prueba@aptioscorm.example', nombre: 'Lead de prueba', empresa: 'Aptio SCORM', mensaje: 'Envío de prueba desde Leads y CRM.',
  origen: 'formulario', via: 'formulario', etapa: 'NUEVO', paginaEntrada: '/', paginaFormulario: '/contacto', utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null,
  utmContent: null, referente: null, idioma: 'es', totalContactos: 1, creadoEn: '2026-01-01T00:00:00.000Z', actualizadoEn: '2026-01-01T00:00:00.000Z',
};

/** Un envío que no entró. `reintentable` false = no sirve repetirlo (falta la clave, el CRM rechazó los datos). */
export class ErrorCrm extends Error {
  constructor(motivo: string, readonly reintentable: boolean) {
    super(motivo);
    this.name = 'ErrorCrm';
  }
}

export interface DependenciasCrm {
  obtener?: (url: string, init: RequestInit) => Promise<Response>;
  resolver?: (host: string) => Promise<string[]>;
  entorno?: Record<string, string | undefined>;
  ahora?: () => Date;
}

export interface ResultadoCrm { idExterno: string | null; estado: number }

export interface PedidoCrm {
  tipo: TipoCrm;
  evento: EventoCrm;
  entrega: string;
  lead: LeadParaCrm;
  mapeo?: MapeoCrm;
  /** Solo el webhook. */
  url?: string | null | undefined;
  secreto?: string | null | undefined;
}

const resolverDns = async (host: string) => (await lookup(host, { all: true })).map((d) => d.address);

/** Las claves de un CRM que faltan en el entorno. */
export const clavesFaltantes = (tipo: CrmConMapeo, entorno: Record<string, string | undefined> = process.env) => VARIABLES_CRM[tipo].filter((v) => !entorno[v]);

function secretosDe(entorno: Record<string, string | undefined>, extra: readonly (string | null | undefined)[] = []) {
  return [...Object.values(VARIABLES_CRM).flat().map((v) => entorno[v]), entorno.ZOHO_ACCESS_TOKEN, ...extra];
}

/** Un pedido HTTP con 10 s, sin seguir redirecciones y con el motivo sin claves. */
async function pedir(nombre: string, url: string, init: RequestInit, deps: Required<Pick<DependenciasCrm, 'obtener'>>, secretos: readonly (string | null | undefined)[]): Promise<Response> {
  let r: Response;
  try {
    r = await deps.obtener(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(ESPERA_CRM_MS) });
  } catch (e) {
    const n = e instanceof Error ? e.name : '';
    throw new ErrorCrm(n === 'TimeoutError' || n === 'AbortError' ? `${nombre} no respondió en ${ESPERA_CRM_MS / 1000} s` : `No se pudo conectar con ${nombre}`, true);
  }
  if (r.status >= 300 && r.status < 400) throw new ErrorCrm(`${nombre} respondió ${r.status} con una redirección, que no se sigue`, false);
  if (!r.ok) {
    let detalle = '';
    try {
      const j = (await r.json()) as { message?: unknown; error?: unknown; data?: unknown };
      const m = j.message ?? j.error ?? (Array.isArray(j.data) ? (j.data[0] as { message?: unknown } | undefined)?.message : undefined);
      if (typeof m === 'string') detalle = `: ${m.slice(0, 120)}`;
    } catch { /* sin cuerpo JSON */ }
    // 408, 425, 429 y 5xx se reintentan; el resto (datos o clave rechazados) no cambia al repetir.
    const reintentable = r.status >= 500 || r.status === 408 || r.status === 425 || r.status === 429;
    throw new ErrorCrm(motivoSeguro(`${nombre} respondió ${r.status}${detalle}`, secretos), reintentable);
  }
  return r;
}

const json = async <T>(r: Response): Promise<T> => {
  try {
    return (await r.json()) as T;
  } catch {
    return {} as T;
  }
};

/** Antes del webhook: el dominio no puede resolver a la red interna (SSRF), aunque haya cambiado desde que se guardó. */
async function verificarDestino(url: string, resolver: (h: string) => Promise<string[]>) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) throw new ErrorCrm('El webhook solo acepta direcciones https:// sin usuario ni clave', false);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips: string[];
  try {
    ips = await resolver(host);
  } catch {
    throw new ErrorCrm(`No se encontró el dominio ${host}`, true);
  }
  if (!ips.length || ips.some(esIpPrivada)) throw new ErrorCrm(`El dominio ${host} apunta a una red interna`, false);
}

const tokensZoho = new Map<string, { token: string; vence: number }>();
/** Para las pruebas: olvida el token de acceso de Zoho guardado en memoria. */
export const olvidarTokenZoho = () => tokensZoho.clear();

async function tokenZoho(entorno: Record<string, string | undefined>, deps: Required<Pick<DependenciasCrm, 'obtener'>>, ahora: number, dominio: string): Promise<string> {
  const guardado = tokensZoho.get(dominio);
  if (guardado && guardado.vence > ahora + 60_000) return guardado.token;
  const q = new URLSearchParams({ refresh_token: entorno.ZOHO_REFRESH_TOKEN!, client_id: entorno.ZOHO_CLIENT_ID!, client_secret: entorno.ZOHO_CLIENT_SECRET!, grant_type: 'refresh_token' });
  const r = await pedir('Zoho CRM', `https://accounts.zoho.${dominio}/oauth/v2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: q.toString() }, deps, secretosDe(entorno));
  const j = await json<{ access_token?: string; expires_in?: number; error?: string }>(r);
  if (!j.access_token) throw new ErrorCrm(motivoSeguro(`Zoho CRM no entregó el acceso${j.error ? `: ${j.error}` : ''}`, secretosDe(entorno)), false);
  tokensZoho.set(dominio, { token: j.access_token, vence: ahora + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

/**
 * Envía un lead (alta o actualización por correo) o la prueba del webhook. Devuelve el id en el CRM; si no entra, lanza
 * `ErrorCrm` con el motivo listo para guardar.
 */
export async function enviarACrm(p: PedidoCrm, deps: DependenciasCrm = {}): Promise<ResultadoCrm> {
  const obtener = deps.obtener ?? ((url, init) => fetch(url, init));
  const entorno = deps.entorno ?? process.env;
  const ahora = (deps.ahora ?? (() => new Date()))();
  const d = { obtener };
  const nombre = NOMBRE_CRM[p.tipo];

  if (p.tipo === 'webhook') {
    if (!p.url) throw new ErrorCrm('Falta la URL del webhook', false);
    if (!p.secreto) throw new ErrorCrm('Falta la clave del webhook: regenérala en el panel', false);
    await verificarDestino(p.url, deps.resolver ?? resolverDns);
    const cuerpo = cuerpoWebhook(p.evento, p.entrega, p.lead, ahora);
    const r = await pedir(nombre, p.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'AptioSCORM-Webhook/1', [CABECERA_FIRMA]: firmar(cuerpo, p.secreto, Math.floor(ahora.getTime() / 1000)), [CABECERA_EVENTO]: p.evento, [CABECERA_ENTREGA]: p.entrega },
      body: cuerpo,
    }, d, [p.secreto]);
    return { idExterno: null, estado: r.status };
  }

  const faltan = clavesFaltantes(p.tipo, entorno);
  if (faltan.length) throw new ErrorCrm(`Falta la clave: define ${faltan.join(', ')} en el entorno del servidor`, false);
  const secretos = secretosDe(entorno);
  const propiedades = propiedadesCrm(p.lead, p.mapeo ?? {});
  propiedades[PROPIEDAD_CORREO[p.tipo]] = p.lead.correo;

  if (p.tipo === 'hubspot') {
    const r = await pedir(nombre, 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${entorno.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: p.lead.correo, properties: propiedades }] }),
    }, d, secretos);
    const j = await json<{ results?: { id?: string }[] }>(r);
    return { idExterno: j.results?.[0]?.id ?? null, estado: r.status };
  }

  if (p.tipo === 'pipedrive') {
    const base = 'https://api.pipedrive.com/v1';
    const clave = encodeURIComponent(entorno.PIPEDRIVE_TOKEN!);
    const q = new URLSearchParams({ term: p.lead.correo, fields: 'email', exact_match: 'true', limit: '1' });
    const b = await pedir(nombre, `${base}/persons/search?${q}&api_token=${clave}`, { method: 'GET', headers: { accept: 'application/json' } }, d, secretos);
    const id = (await json<{ data?: { items?: { item?: { id?: number } }[] } }>(b)).data?.items?.[0]?.item?.id;
    const { email, ...resto } = propiedades;
    const persona = { ...resto, name: resto.name || p.lead.nombre || p.lead.correo, email: [{ value: email, primary: true }] };
    const r = await pedir(nombre, id ? `${base}/persons/${id}?api_token=${clave}` : `${base}/persons?api_token=${clave}`, {
      method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(persona),
    }, d, secretos);
    const nuevo = (await json<{ data?: { id?: number } }>(r)).data?.id ?? id;
    return { idExterno: nuevo ? String(nuevo) : null, estado: r.status };
  }

  const dominio = (DOMINIOS_ZOHO as readonly string[]).includes(entorno.ZOHO_DOMINIO ?? '') ? entorno.ZOHO_DOMINIO! : 'com';
  const token = await tokenZoho(entorno, d, ahora.getTime(), dominio);
  // Zoho pide Last_Name en un lead: sin nombre (el popup solo pide el correo) va el correo.
  const registro = { ...propiedades, Last_Name: propiedades.Last_Name || p.lead.nombre || p.lead.correo };
  const r = await pedir(nombre, `https://www.zohoapis.${dominio}/crm/v2/Leads/upsert`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Zoho-oauthtoken ${token}` },
    body: JSON.stringify({ data: [registro], duplicate_check_fields: ['Email'] }),
  }, d, [...secretos, token]);
  const j = await json<{ data?: { status?: string; message?: string; details?: { id?: string } }[] }>(r);
  const fila = j.data?.[0];
  if (fila?.status && fila.status !== 'success') throw new ErrorCrm(motivoSeguro(`Zoho CRM rechazó el lead: ${fila.message ?? fila.status}`, [...secretos, token]), false);
  return { idExterno: fila?.details?.id ?? null, estado: r.status };
}

/** «Enviar prueba» de un CRM: una lectura que solo comprueba la clave. El webhook recibe `lead.prueba` firmado. */
export async function probarCrm(p: { tipo: TipoCrm; url?: string | null; secreto?: string | null }, deps: DependenciasCrm = {}): Promise<{ ok: true; detalle: string } | { ok: false; motivo: string }> {
  const obtener = deps.obtener ?? ((url, init) => fetch(url, init));
  const entorno = deps.entorno ?? process.env;
  const d = { obtener };
  const nombre = NOMBRE_CRM[p.tipo];
  try {
    if (p.tipo === 'webhook') {
      const entrega = randomUUID();
      const r = await enviarACrm({ tipo: 'webhook', evento: 'lead.prueba', entrega, lead: LEAD_PRUEBA, url: p.url ?? null, secreto: p.secreto ?? null }, deps);
      return { ok: true, detalle: `El webhook respondió ${r.estado} a la entrega ${entrega}` };
    }
    const faltan = clavesFaltantes(p.tipo, entorno);
    if (faltan.length) throw new ErrorCrm(`Falta la clave: define ${faltan.join(', ')} en el entorno del servidor`, false);
    const secretos = secretosDe(entorno);
    if (p.tipo === 'hubspot') await pedir(nombre, 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { method: 'GET', headers: { authorization: `Bearer ${entorno.HUBSPOT_TOKEN}` } }, d, secretos);
    else if (p.tipo === 'pipedrive') await pedir(nombre, `https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(entorno.PIPEDRIVE_TOKEN!)}`, { method: 'GET' }, d, secretos);
    else {
      const dominio = (DOMINIOS_ZOHO as readonly string[]).includes(entorno.ZOHO_DOMINIO ?? '') ? entorno.ZOHO_DOMINIO! : 'com';
      const token = await tokenZoho(entorno, d, (deps.ahora ?? (() => new Date()))().getTime(), dominio);
      await pedir(nombre, `https://www.zohoapis.${dominio}/crm/v2/org`, { method: 'GET', headers: { authorization: `Zoho-oauthtoken ${token}` } }, d, [...secretos, token]);
    }
    return { ok: true, detalle: `${nombre} aceptó la clave` };
  } catch (e) {
    return { ok: false, motivo: e instanceof ErrorCrm ? e.message : motivoSeguro(`No se pudo probar ${nombre}`) };
  }
}
