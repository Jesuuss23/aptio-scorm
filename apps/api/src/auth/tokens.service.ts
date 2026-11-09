import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BaseDatosService } from '../base-datos/base-datos.service.js';

export type TipoToken = 'INVITACION' | 'RESTABLECER_CLAVE';
export const VIGENCIA_TOKEN_MS = 60 * 60 * 1000; // 60 minutos (ADR-009)

const hashear = (token: string) => createHash('sha256').update(token).digest('hex');

/** Enlaces de un solo uso: se entrega el token y solo se guarda su hash (TokenAcceso). */
@Injectable()
export class TokensService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  async crear(usuarioId: string, tipo: TipoToken): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.baseDatos.cliente.tokenAcceso.create({
      data: { usuarioId, tipo, hashToken: hashear(token), expira: new Date(Date.now() + VIGENCIA_TOKEN_MS) },
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
