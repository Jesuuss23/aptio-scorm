import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SECRETO_DESARROLLO = 'solo-desarrollo-cambiar-SESSION_SECRET';

/** Parámetros de sesión y enlaces leídos del entorno. */
@Injectable()
export class ConfigSesion {
  readonly secreto: string;
  readonly ttlMs: number;
  readonly cookieSegura: boolean;
  readonly urlWeb: string;

  constructor(config: ConfigService) {
    const produccion = config.get<string>('NODE_ENV') === 'production';
    const secreto = config.get<string>('SESSION_SECRET');
    if (!secreto && produccion) throw new Error('Falta SESSION_SECRET en producción');
    if (!secreto) new Logger('Sesión').warn('SESSION_SECRET no está definido: se usa un valor solo para desarrollo');
    this.secreto = secreto ?? SECRETO_DESARROLLO;
    this.ttlMs = Number(config.get<string>('SESSION_TTL_HOURS') ?? 12) * 3_600_000;
    this.cookieSegura = produccion;
    this.urlWeb = config.get<string>('WEB_URL') ?? 'http://localhost:5173';
  }
}
