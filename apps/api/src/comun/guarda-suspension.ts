import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CobranzaService, RUTA_REGULARIZAR } from '../ventas/cobranza.service.js';
import { CLAVE_PERMITIDO_SUSPENDIDA, CLAVE_PUBLICO, type UsuarioSesion } from './roles.js';

const LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * HU-1708 · Solo lectura con la suscripción SUSPENDIDA (CP-150, RN-18-8). Va después de la guarda de roles: toda
 * escritura de un usuario de esa organización responde 403 SUSCRIPCION_SUSPENDIDA con lo necesario para regularizar,
 * salvo las rutas `@PermitidoSuspendida()` (sesión, exportar y descargar lo entregado, pagar). La lectura sigue igual.
 */
@Injectable()
export class GuardaSuspension implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly cobranza: CobranzaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<{ method: string; usuario?: UsuarioSesion }>();
    if (LECTURA.has(req.method.toUpperCase())) return true;
    const u = req.usuario;
    if (!u?.organizacionId || u.rol === 'SUPERADMIN') return true;
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos) || this.reflector.getAllAndOverride<boolean>(CLAVE_PERMITIDO_SUSPENDIDA, objetivos)) return true;
    const s = await this.cobranza.suspendida(u.organizacionId);
    if (!s) return true;
    throw new ForbiddenException({
      codigo: 'SUSCRIPCION_SUSPENDIDA',
      mensaje: u.rol === 'ADMINISTRADOR'
        ? 'Tu cuenta está en solo lectura porque no recibimos el pago de la renovación. Paga en Mi plan para reactivarla; lo exportado se puede descargar.'
        : 'La cuenta de tu organización está en solo lectura porque falta el pago de la renovación. Pide al administrador que la regularice; lo exportado se puede descargar.',
      detalles: [{ regularizar: RUTA_REGULARIZAR, renovacionId: s.renovacionId, total: s.total, moneda: s.moneda, puedePagar: u.rol === 'ADMINISTRADOR' }],
    });
  }
}
