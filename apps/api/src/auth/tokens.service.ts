import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BaseDatosService } from '../base-datos/base-datos.service.js';

export type TipoToken = 'INVITACION' | 'RESTABLECER_CLAVE';
export const VIGENCIA_TOKEN_MS = 60 * 60 * 1000; // 60 minutos (ADR-009)

/** HU-1703 · El enlace de bienvenida de una suscripción pagada dura más: el pago no espera a que se abra el correo (SUP-289). */
export const VIGENCIA_BIENVENIDA_MS = 72 * 60 * 60 * 1000;

export const hashear = (token: string) => createHash('sha256').update(token).digest('hex');

/** Un token nuevo y su hash (para crearlo dentro de una transacción). */
export const nuevoToken = (): { token: string; hashToken: string } => {
  const token = randomBytes(32).toString('base64url');
  return { token, hashToken: hashear(token) };
};

/** Enlaces de un solo uso: se entrega el token y solo se guarda su hash (TokenAcceso). */
@Injectable()
export class TokensService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  async crear(usuarioId: string, tipo: TipoToken): Promise<string> {
    const { token, hashToken } = nuevoToken();
    await this.baseDatos.cliente.tokenAcceso.create({
      data: { usuarioId, tipo, hashToken, expira: new Date(Date.now() + VIGENCIA_TOKEN_MS) },
    });
    return token;
  }

  /** Marca el token como usado y devuelve su dueño; null si no existe, venció o ya se usó (CP-012). */
  async consumir(token: string): Promise<{ usuarioId: string; tipo: TipoToken } | null> {
    const hashToken = hashear(token);
    const usado = await this.baseDatos.cliente.tokenAcceso.updateMany({
      where: { hashToken, usadoEn: null, expira: { gt: new Date() } },
      data: { usadoEn: new Date() },
    });
    if (usado.count !== 1) return null;
    const t = await this.baseDatos.cliente.tokenAcceso.findUniqueOrThrow({ where: { hashToken } });
    return { usuarioId: t.usuarioId, tipo: t.tipo as TipoToken };
  }

  /** Pedidos de un tipo en la última hora (límite de olvido de clave). */
  contarRecientes(usuarioId: string, tipo: TipoToken): Promise<number> {
    return this.baseDatos.cliente.tokenAcceso.count({
      where: { usuarioId, tipo, creadoEn: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
  }
}
