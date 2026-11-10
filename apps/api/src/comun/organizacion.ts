import { ForbiddenException } from '@nestjs/common';
import type { UsuarioSesion } from './roles.js';

/** Organización de la sesión. El superadmin no tiene una y no opera datos de clientes (ADR-012). */
export function organizacionDe(u: UsuarioSesion): string {
  if (!u.organizacionId) throw new ForbiddenException('Esta acción es de una organización');
  return u.organizacionId;
}

/** Roles del equipo de producción (todos menos el revisor del cliente y el superadmin). */
export const EQUIPO = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR'] as const;
