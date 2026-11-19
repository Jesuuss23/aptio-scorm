import { HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { LimitadorService } from '../comun/limitador.js';

/** Peticiones por IP y por minuto en `/api/v1/publico/*` y en los formularios del sitio (SUP-169). */
export const LIMITE_PUBLICO_POR_MINUTO = 60;
/**
 * Revisión de seguridad para la nube (M1) · Intentos de ingreso por IP y por minuto: ingresar, segundo factor y
 * «olvidé mi clave». Se cambia con `LIMITE_INGRESO_POR_MINUTO` (las pruebas de la API lo suben: ingresan muchas veces).
 */
export const LIMITE_INGRESO_POR_MINUTO = 20;
const VENTANA_MS = 60_000;

/** Los formularios del sitio que llegan sin JavaScript fuera del prefijo de la API (B2). */
const FORMULARIOS_SITIO = new Set(['/s/_lead', '/s/_cita', '/s/_popup', '/s/_visita']);
/** Las rutas de ingreso sin sesión (M1). La vuelta de Google ya exige su `state` firmado. */
const RUTAS_INGRESO = ['/api/v1/auth/ingresar', '/api/v1/auth/segundo-factor', '/api/v1/auth/clave/'];

type Grupo = 'publico' | 'ingreso';

/** A qué límite cuenta una petición, o `null` si no tiene. */
export function grupoDe(metodo: string, url: string): Grupo | null {
  const ruta = url.split('?')[0]!.toLowerCase();
  if (ruta.startsWith('/api/v1/publico/')) return 'publico';
  if (metodo === 'POST' && FORMULARIOS_SITIO.has(ruta.replace(/\/+$/, ''))) return 'publico';
  if (metodo === 'POST' && RUTAS_INGRESO.some((r) => ruta === r || ruta.startsWith(r.endsWith('/') ? r : `${r}/`))) return 'ingreso';
  return null;
}

function limiteDelEntorno(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.LIMITE_INGRESO_POR_MINUTO);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_INGRESO_POR_MINUTO;
}

/**
 * HU-1502 · Límite simple por IP para las rutas sin sesión (docs/23, «tienen límite de peticiones»): ventana fija de un
 * minuto por grupo, contada en Redis para que todas las instancias de la API compartan la cuenta (en memoria si Redis no
 * responde). Al pasarlo responde 429 DEMASIADAS_SOLICITUDES con Retry-After. Detrás de CloudFront y el balanceador,
 * `req.ip` sale de `trust proxy` (HU-1405); AWS WAF suma su propio límite por IP delante (M1).
 */
@Injectable()
export class LimitePublicoService {
  /** Intentos de ingreso por IP y por minuto. */
  limiteIngreso = limiteDelEntorno();

  constructor(readonly limitador: LimitadorService) {}

  /** Empieza de cero las ventanas del sitio y del ingreso (pruebas). */
  reiniciar(): void {
    this.limitador.reiniciar('publico');
    this.limitador.reiniciar('ingreso');
  }

  limite(grupo: Grupo): number {
    return grupo === 'ingreso' ? this.limiteIngreso : LIMITE_PUBLICO_POR_MINUTO;
  }
}

@Injectable()
export class LimitePublicoMiddleware implements NestMiddleware {
  constructor(private readonly limite: LimitePublicoService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const grupo = grupoDe(req.method, req.originalUrl);
    if (!grupo) return next();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'desconocida';
    const { cuenta, restanteMs } = await this.limite.limitador.contar(grupo, ip, { envios: this.limite.limite(grupo), ventanaMs: VENTANA_MS });
    if (cuenta > this.limite.limite(grupo)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(restanteMs / 1000))));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes: espera un minuto e intenta de nuevo' });
      return;
    }
    next();
  }
}
