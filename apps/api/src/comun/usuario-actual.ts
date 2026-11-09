import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { UsuarioSesion } from './roles.js';

/** Inyecta el usuario de la sesión en un controlador. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioSesion => {
  const usuario = contexto.switchToHttp().getRequest<{ usuario?: UsuarioSesion }>().usuario;
  if (!usuario) throw new UnauthorizedException('Inicia sesión para continuar');
  return usuario;
});
