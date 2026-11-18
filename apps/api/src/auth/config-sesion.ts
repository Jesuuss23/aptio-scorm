import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { claveCifrado } from './totp.js';

const SECRETO_DESARROLLO = 'solo-desarrollo-cambiar-SESSION_SECRET';
/** HU-1515 · Solo para desarrollo y pruebas; en producción `TOTP_CLAVE_CIFRADO` es obligatoria. */
export const CLAVE_TOTP_DESARROLLO = 'solo-desarrollo-cambiar-TOTP_CLAVE_CIFRADO';

/** Parámetros de sesión y enlaces leídos del entorno. */
@Injectable()
export class ConfigSesion {
  readonly secreto: string;
  readonly ttlMs: number;
  readonly cookieSegura: boolean;
  readonly urlWeb: string;
  /** HU-1515 · Firma la cookie del paso del segundo factor; derivada para que no sirva como sesión. */
  readonly secretoDesafio: string;
  /** HU-1515 · Clave AES-256 de los secretos TOTP y del HMAC de los códigos de recuperación. */
  readonly claveTotp: Buffer;

  constructor(config: ConfigService) {
    const produccion = config.get<string>('NODE_ENV') === 'production';
    const secreto = config.get<string>('SESSION_SECRET');
    if (!secreto && produccion) throw new Error('Falta SESSION_SECRET en producción');
    if (!secreto) new Logger('Sesión').warn('SESSION_SECRET no está definido: se usa un valor solo para desarrollo');
    this.secreto = secreto ?? SECRETO_DESARROLLO;
    this.ttlMs = Number(config.get<string>('SESSION_TTL_HOURS') ?? 12) * 3_600_000;
    this.cookieSegura = produccion;
    this.urlWeb = config.get<string>('WEB_URL') ?? 'http://localhost:5173';
    this.secretoDesafio = createHmac('sha256', this.secreto).update('aptio:segundo-factor').digest('base64url');
    const claveTotp = config.get<string>('TOTP_CLAVE_CIFRADO');
    if (!claveTotp && produccion) throw new Error('Falta TOTP_CLAVE_CIFRADO en producción');
    if (!claveTotp) new Logger('Sesión').warn('TOTP_CLAVE_CIFRADO no está definida: se usa un valor solo para desarrollo');
    this.claveTotp = claveCifrado(claveTotp ?? CLAVE_TOTP_DESARROLLO);
  }
}
