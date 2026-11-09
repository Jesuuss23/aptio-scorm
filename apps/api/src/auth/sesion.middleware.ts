import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ConfigSesion } from './config-sesion.js';
import { COOKIE_SESION, leerSesion } from './sesion.js';

/**
 * Lee la cookie de sesión y, si es válida y el usuario sigue activo con la misma versión de sesión,
 * coloca `request.usuario`. Las guardas deciden después si la ruta lo exige.
 */
@Injectable()
export class SesionMiddleware implements NestMiddleware {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly config: ConfigSesion,
  ) {}

  async use(req: Request & { usuario?: UsuarioSesion }, _res: Response, next: NextFunction): Promise<void> {
    const datos = leerSesion(req.cookies?.[COOKIE_SESION] as string | undefined, this.config.secreto);
    if (datos) {
      const u = await this.baseDatos.cliente.usuario.findUnique({
        where: { id: datos.u },
        select: { id: true, rol: true, organizacionId: true, clienteId: true, activo: true, versionSesion: true },
      });
      if (u?.activo && u.versionSesion === datos.v) {
        req.usuario = { id: u.id, rol: u.rol, organizacionId: u.organizacionId, clienteId: u.clienteId };
      }
    }
    next();
  }
}
