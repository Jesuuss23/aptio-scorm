import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@aptio/db';
import { CLAVE_PUBLICO, CLAVE_ROLES, type UsuarioSesion } from './roles.js';

/**
 * Guarda global. Por defecto toda ruta exige sesión; `@Publico()` la libera y
 * `@Roles(...)` la limita a esos roles. Mientras no exista la sesión (HU-0104),
 * solo responden las rutas públicas.
 */
@Injectable()
export class GuardaRoles implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) return true;

    const usuario = contexto.switchToHttp().getRequest<{ usuario?: UsuarioSesion }>().usuario;
    if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar');

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, objetivos);
    if (roles?.length && !roles.includes(usuario.rol)) {
      throw new ForbiddenException('Tu rol no permite esta acción');
    }
    return true;
  }
}
