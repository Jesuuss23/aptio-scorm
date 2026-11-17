import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@aptio/db';

export const CLAVE_ROLES = 'aptio:roles';
export const CLAVE_PUBLICO = 'aptio:publico';
export const CLAVE_PERMITIDO_SUSPENDIDA = 'aptio:permitido-suspendida';

/** Limita la ruta a estos roles (RN-01-2: los permisos se validan en la API). */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Ruta sin sesión (salud, ingreso, recuperación de clave). Todo lo demás exige sesión. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/**
 * HU-1708 · Escritura que sigue permitida con la cuenta suspendida (solo lectura): la sesión, la exportación y la
 * descarga de lo entregado, y el pago para regularizar. Todo lo demás que escribe responde 403 SUSCRIPCION_SUSPENDIDA.
 */
export const PermitidoSuspendida = () => SetMetadata(CLAVE_PERMITIDO_SUSPENDIDA, true);

/** Usuario de la sesión. Lo coloca en `request.usuario` el middleware de sesión (HU-0104). */
export interface UsuarioSesion {
  id: string;
  rol: Rol;
  organizacionId: string | null;
  clienteId: string | null;
}
