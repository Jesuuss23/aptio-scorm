import { HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Peticiones por IP y por minuto en `/api/v1/publico/*` (SUP-169). */
export const LIMITE_PUBLICO_POR_MINUTO = 60;
const VENTANA_MS = 60_000;

/**
 * HU-1502 · Límite simple por IP para las rutas públicas sin sesión (docs/23, «tienen límite de peticiones»): ventana
 * fija de un minuto en memoria de cada instancia de la API. Al pasarlo responde 429 DEMASIADAS_SOLICITUDES con
 * Retry-After. Si la API corre detrás de un proxy, `req.ip` debe venir de `trust proxy` (HU-1405).
 */
@Injectable()
export class LimitePublicoService {
  readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();

  /** Vacía las ventanas (pruebas). */
  reiniciar(): void {
    this.ventanas.clear();
  }
}

@Injectable()
export class LimitePublicoMiddleware implements NestMiddleware {
  constructor(private readonly limite: LimitePublicoService) {}

  private get ventanas() {
    return this.limite.ventanas;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!req.originalUrl.startsWith('/api/v1/publico/')) return next();
    const ahora = Date.now();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'desconocida';
    let v = this.ventanas.get(ip);
    if (!v || ahora - v.inicio >= VENTANA_MS) {
      v = { inicio: ahora, cuenta: 0 };
      this.ventanas.set(ip, v);
      if (this.ventanas.size > 10_000) this.limpiar(ahora);
    }
    v.cuenta += 1;
    if (v.cuenta > LIMITE_PUBLICO_POR_MINUTO) {
      res.setHeader('Retry-After', String(Math.ceil((v.inicio + VENTANA_MS - ahora) / 1000)));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes: espera un minuto e intenta de nuevo' });
      return;
    }
    next();
  }

  private limpiar(ahora: number): void {
    for (const [ip, v] of this.ventanas) if (ahora - v.inicio >= VENTANA_MS) this.ventanas.delete(ip);
  }
}
