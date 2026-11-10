// HU-0108 · Piezas de OpenID Connect con Google (código de autorización + PKCE), sin dependencias: la firma RS256 del
// id_token se verifica con node:crypto contra las claves públicas de Google (JWKS).
import { createHash, createHmac, createPublicKey, createVerify, type JsonWebKey, randomBytes, timingSafeEqual } from 'node:crypto';

export const GOOGLE_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISORES = new Set(['https://accounts.google.com', 'accounts.google.com']);
/** Tolerancia de reloj al revisar el vencimiento del id_token. */
const HOLGURA_MS = 60_000;

/** Motivos de rechazo; la web los traduce a un mensaje (`/ingresar?error=`). */
export type MotivoGoogle = 'google_no_disponible' | 'google_cancelado' | 'google_fallo' | 'correo_no_verificado' | 'sin_acceso';

export class RechazoGoogle extends Error {
  constructor(readonly motivo: MotivoGoogle, detalle: string) {
    super(detalle);
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
export const aleatorio = () => b64url(randomBytes(32));
/** code_challenge = BASE64URL(SHA256(code_verifier)) (RFC 7636, S256). */
export const desafioPkce = (verificador: string) => b64url(createHash('sha256').update(verificador).digest());

/** Lo que se recuerda entre la ida a Google y la vuelta, en una cookie firmada de corta vida. */
export interface EstadoIda {
  state: string;
  nonce: string;
  verificador: string;
  exp: number;
}

export function firmarEstado(e: EstadoIda, secreto: string): string {
  const cuerpo = b64url(JSON.stringify(e));
  return `${cuerpo}.${createHmac('sha256', `google:${secreto}`).update(cuerpo).digest('base64url')}`;
}

export function leerEstado(valor: string | undefined, secreto: string, ahora = Date.now()): EstadoIda | null {
  const [cuerpo, firma] = (valor ?? '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', `google:${secreto}`).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const e = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as EstadoIda;
    return typeof e.state === 'string' && typeof e.nonce === 'string' && typeof e.verificador === 'string' && e.exp > ahora ? e : null;
  } catch {
    return null;
  }
}

/** Compara en tiempo constante dos textos (el state de la URL con el de la cookie). */
export function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function urlAutorizacion(p: { clientId: string; redirectUri: string; state: string; nonce: string; verificador: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: desafioPkce(p.verificador),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTORIZAR}?${q.toString()}`;
}

export interface Identidad {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string | null;
}

type Jwk = JsonWebKey & { kid?: string };

/**
 * Verifica el id_token (OpenID Connect Core §3.1.3.7): firma RS256 con una clave publicada por Google, emisor,
 * audiencia (nuestro client_id), vencimiento y nonce. Devuelve la identidad o lanza RechazoGoogle.
 */
export function verificarIdToken(idToken: string, claves: Jwk[], esperado: { clientId: string; nonce: string }, ahora = Date.now()): Identidad {
  const partes = idToken.split('.');
  if (partes.length !== 3) throw new RechazoGoogle('google_fallo', 'id_token mal formado');
  const [h, p, firma] = partes as [string, string, string];
  let cabecera: { alg?: string; kid?: string };
  let datos: Record<string, unknown>;
  try {
    cabecera = JSON.parse(Buffer.from(h, 'base64url').toString()) as typeof cabecera;
    datos = JSON.parse(Buffer.from(p, 'base64url').toString()) as typeof datos;
  } catch {
    throw new RechazoGoogle('google_fallo', 'id_token mal formado');
  }
  if (cabecera.alg !== 'RS256') throw new RechazoGoogle('google_fallo', `algoritmo no admitido: ${String(cabecera.alg)}`);
  const jwk = claves.find((k) => k.kid === cabecera.kid);
  if (!jwk) throw new RechazoGoogle('google_fallo', 'clave de firma desconocida');
  const valida = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(firma, 'base64url'));
  if (!valida) throw new RechazoGoogle('google_fallo', 'firma no válida');

  const aud = datos.aud;
  if (!EMISORES.has(String(datos.iss))) throw new RechazoGoogle('google_fallo', 'emisor no válido');
  if (!(aud === esperado.clientId || (Array.isArray(aud) && aud.includes(esperado.clientId)))) throw new RechazoGoogle('google_fallo', 'audiencia no válida');
  if (typeof datos.exp !== 'number' || datos.exp * 1000 + HOLGURA_MS < ahora) throw new RechazoGoogle('google_fallo', 'id_token vencido');
  if (typeof datos.nonce !== 'string' || !iguales(datos.nonce, esperado.nonce)) throw new RechazoGoogle('google_fallo', 'nonce no coincide');
  if (typeof datos.sub !== 'string' || typeof datos.email !== 'string') throw new RechazoGoogle('google_fallo', 'faltan sub o email');
  return {
    sub: datos.sub,
    email: datos.email.trim().toLowerCase(),
    emailVerificado: datos.email_verified === true || datos.email_verified === 'true',
    nombre: typeof datos.name === 'string' ? datos.name : null,
  };
}
