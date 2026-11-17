/** HU-1708 · Lo que comparten la suscripción de la organización y la cobranza: la renovación abierta y su DTO. */
import type { Prisma } from '@aptio/db';
import { DIAS_INTENTOS, fechaDelPaso } from '@aptio/schema/cobranza';
import type { RenovacionDto } from './cambio-plan.dto.js';

type Bd = Prisma.TransactionClient;
export type FilaRenovacion = Prisma.RenovacionGetPayload<{ include: { plan: true } }>;

/** La renovación que falta pagar del período en curso: pendiente o vencida (suspendida). */
export const renovacionAbierta = (bd: Bd, suscripcionId: string): Promise<FilaRenovacion | null> =>
  bd.renovacion.findFirst({ where: { suscripcionId, estado: { in: ['PENDIENTE', 'VENCIDA'] } }, orderBy: { periodoInicio: 'desc' }, include: { plan: true } });

export function aRenovacionDto(r: FilaRenovacion): RenovacionDto {
  return {
    id: r.id, estado: r.estado, plan: { slug: r.plan.slug, nombre: r.plan.nombre, capsulasMes: r.plan.capsulasMes }, periodoInicio: r.periodoInicio.toISOString(),
    periodoFin: r.periodoFin.toISOString(), montoSinIgv: Number(r.montoSinIgv), igv: Number(r.igv), total: Number(r.total), moneda: r.moneda === 'USD' ? 'USD' : 'PEN',
    pasarela: r.pasarela, intentos: r.intentos, proximoIntento: r.proximoIntento?.toISOString() ?? null,
    suspensionEn: (r.suspendidaEn ?? fechaDelPaso(r.periodoInicio, DIAS_INTENTOS.length)).toISOString(), motivoRechazo: r.motivoRechazo,
  };
}
