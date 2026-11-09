import { createHmac, timingSafeEqual } from 'node:crypto';

/** Nombre de la cookie de sesión (docs/api/openapi.yaml · cookieSesion). */
export const COOKIE_SESION = 'sesion';

export interface DatosSesion {
  /** id del usuario */
  u: string;
  /** versionSesion del usuario al ingresar: si cambia, la sesión deja de valer */
  v: number;
  /** vencimiento en milisegundos desde 1970 */
  exp: number;
}

const b64 = (texto: string) => Buffer.from(texto).toString('base64url');

/**
 * Sesión firmada con HMAC-SHA256 en una cookie httpOnly (ADR-009). No guarda estado en el servidor:
 * se invalida al vencer o al subir `Usuario.versionSesion` (cambio de clave o desactivación).
 */
export function firmarSesion(datos: DatosSesion, secreto: string): string {
  const cuerpo = b64(JSON.stringify(datos));
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function leerSesion(token: string | undefined, secreto: string, ahora = Date.now()): DatosSesion | null {
  if (!token) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as DatosSesion;
    if (typeof datos.u !== 'string' || typeof datos.v !== 'number' || typeof datos.exp !== 'number') return null;
    return datos.exp > ahora ? datos : null;
  } catch {
    return null;
  }
}
