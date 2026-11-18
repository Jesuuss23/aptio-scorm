// HU-1515 · Segundo factor del superadmin: TOTP (RFC 6238) con una aplicación autenticadora, cifrado del secreto en
// reposo (AES-256-GCM) y códigos de recuperación de un solo uso. Sin dependencias: solo node:crypto.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Pasos de 30 segundos y 6 dígitos con SHA-1: lo que leen todas las aplicaciones autenticadoras. */
export const PASO_SEGUNDOS = 30;
export const DIGITOS = 6;
/** Se acepta el paso anterior y el siguiente para tolerar relojes desfasados hasta 30 segundos. */
export const VENTANA_PASOS = 1;
export const CANTIDAD_CODIGOS_RECUPERACION = 10;
const EMISOR = 'Aptio SCORM';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO_BASE32.indexOf(c);
    if (i < 0) throw new Error('Secreto base32 no válido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo de 160 bits (lo que recomienda la RFC 4226), en base32 para la aplicación. */
export function nuevoSecreto(): string {
  return base32(randomBytes(20));
}

/** Paso de tiempo de un instante (milisegundos). */
export function pasoDe(ms: number): number {
  return Math.floor(ms / 1000 / PASO_SEGUNDOS);
}

/** HOTP (RFC 4226) del paso dado. `algoritmo` existe para probar los vectores de la RFC 6238. */
export function codigoDelPaso(secreto: Buffer, paso: number, algoritmo: 'sha1' | 'sha256' | 'sha512' = 'sha1', digitos = DIGITOS): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac(algoritmo, secreto).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1]! & 0x0f;
  const binario = (hmac.readUInt32BE(desplazamiento) & 0x7fffffff) % 10 ** digitos;
  return binario.toString().padStart(digitos, '0');
}

/**
 * Busca el código en la ventana de ±1 paso y devuelve el paso que coincide, o null. Rechaza pasos iguales o
 * anteriores a `ultimoPaso`: un código ya aceptado no se puede volver a usar.
 */
export function verificarCodigo(secretoBase32: string, codigo: string, ahoraMs: number, ultimoPaso: number | null): number | null {
  const limpio = codigo.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${DIGITOS}}$`).test(limpio)) return null;
  const secreto = desdeBase32(secretoBase32);
  const actual = pasoDe(ahoraMs);
  for (let d = -VENTANA_PASOS; d <= VENTANA_PASOS; d++) {
    const paso = actual + d;
    if (ultimoPaso !== null && paso <= ultimoPaso) continue;
    if (timingSafeEqual(Buffer.from(codigoDelPaso(secreto, paso)), Buffer.from(limpio))) return paso;
  }
  return null;
}

/** URI `otpauth://` que leen las aplicaciones (formato de Google Authenticator). */
export function uriOtpauth(secretoBase32: string, cuenta: string): string {
  const etiqueta = `${encodeURIComponent(EMISOR)}:${encodeURIComponent(cuenta)}`;
  const q = new URLSearchParams({ secret: secretoBase32, issuer: EMISOR, algorithm: 'SHA1', digits: String(DIGITOS), period: String(PASO_SEGUNDOS) });
  return `otpauth://totp/${etiqueta}?${q.toString()}`;
}

// ---------- Cifrado del secreto en reposo ----------

/** Deriva la clave de 256 bits de `TOTP_CLAVE_CIFRADO` (cualquier texto largo y aleatorio). */
export function claveCifrado(texto: string): Buffer {
  return createHash('sha256').update(`aptio-totp:${texto}`).digest();
}

/** AES-256-GCM: `v1.<iv>.<etiqueta>.<cifrado>` en base64url. */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join('.');
}

export function descifrar(guardado: string, clave: Buffer): string {
  const [version, iv, etiqueta, cifrado] = guardado.split('.');
  if (version !== 'v1' || !iv || !etiqueta || cifrado === undefined) throw new Error('Secreto cifrado con un formato desconocido');
  const d = createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64url')), d.final()]).toString('utf8');
}

// ---------- Códigos de recuperación ----------

const ALFABETO_RECUPERACION = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para dictarlos sin errores

/** Diez códigos `XXXXX-XXXXX` (50 bits cada uno). Se muestran una sola vez. */
export function nuevosCodigosRecuperacion(cantidad = CANTIDAD_CODIGOS_RECUPERACION): string[] {
  return Array.from({ length: cantidad }, () => {
    const s = Array.from({ length: 10 }, () => ALFABETO_RECUPERACION[randomInt(ALFABETO_RECUPERACION.length)]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function normalizarCodigoRecuperacion(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Solo se guarda este HMAC: con la base de datos sola no se pueden usar los códigos. */
export function hashCodigoRecuperacion(codigo: string, clave: Buffer): string {
  return createHmac('sha256', clave).update(`recuperacion:${normalizarCodigoRecuperacion(codigo)}`).digest('base64url');
}
