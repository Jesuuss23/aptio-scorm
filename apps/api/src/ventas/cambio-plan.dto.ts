import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PagoCheckoutDto } from './suscripciones.dto.js';

/** HU-1706 · Un plan como lo ve el administrador al cambiar: precio por su ciclo y moneda, y si sería subida o bajada. */
export class PlanOpcionDto {
  @ApiProperty({ example: 'productora' }) slug: string;
  @ApiProperty({ example: 'Productora' }) nombre: string;
  @ApiProperty({ type: Number, nullable: true, example: 20, description: 'null = sin límite' }) capsulasMes: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 1290, description: 'Sin IGV, por el ciclo y en la moneda de la suscripción; null si no se cobra así' }) precioCiclo: number | null;
  @ApiProperty({ description: 'Es el plan actual' }) actual: boolean;
  @ApiProperty({ enum: ['SUBIDA', 'BAJADA'], nullable: true, description: 'null si no se puede elegir (el actual, a medida o sin precio en ese ciclo y moneda)' }) tipo: 'SUBIDA' | 'BAJADA' | null;
}

export class PlanBreveDto {
  @ApiProperty({ example: 'inicial' }) slug: string;
  @ApiProperty({ example: 'Inicial' }) nombre: string;
  @ApiProperty({ type: Number, nullable: true, example: 8 }) capsulasMes: number | null;
}

/** HU-1708 · La renovación de un período (REQ-088, RN-18-8): el monto, los intentos y cuándo se suspende. */
export class RenovacionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE', 'APROBADA', 'VENCIDA'], description: 'VENCIDA: llegó el día 10 sin pago y la suscripción quedó suspendida (se puede pagar igual)' }) estado: 'PENDIENTE' | 'APROBADA' | 'VENCIDA';
  @ApiProperty({ type: PlanBreveDto, description: 'El plan que se renueva (con la bajada programada ya aplicada)' }) plan: PlanBreveDto;
  @ApiProperty({ format: 'date-time' }) periodoInicio: string;
  @ApiProperty({ format: 'date-time' }) periodoFin: string;
  @ApiProperty({ example: 1290 }) montoSinIgv: number;
  @ApiProperty({ example: 232.2 }) igv: number;
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 'pruebas' }) pasarela: string;
  @ApiProperty({ example: 1, description: 'Intentos hechos (0 a 4: días 0, 1, 3 y 7)' }) intentos: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'El siguiente intento o, hechos los 4, la suspensión' }) proximoIntento: string | null;
  @ApiProperty({ format: 'date-time', description: 'El día 10: la cuenta queda en solo lectura si no paga antes' }) suspensionEn: string;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 20, description: 'HU-1709 · El porcentaje del cupón aplicado (null = sin descuento)' }) porcentajeDescuento: number | null;
  @ApiProperty({ example: 258, description: 'HU-1709 · El descuento sin IGV (0 sin cupón): `montoSinIgv` ya lo resta' }) descuentoSinIgv: number;
}

/** HU-1709 · El descuento del cupón o convenio del alta, mientras siga en las renovaciones. */
export class DescuentoSuscripcionDto {
  @ApiProperty({ example: 'LANZAMIENTO26' }) codigo: string;
  @ApiProperty({ example: 20 }) porcentaje: number;
  @ApiProperty({ type: Number, nullable: true, example: 2, description: 'Renovaciones que quedan con descuento; null = permanente' }) ciclosRestantes: number | null;
}

/** HU-1706 · La suscripción de la organización (REQ-086). */
export class SuscripcionOrgDto {
  @ApiProperty({ type: PlanBreveDto }) plan: PlanBreveDto;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 490, description: 'Sin IGV, por el ciclo' }) precioPactadoSinIgv: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ enum: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'], description: 'CANCELADA también si pidió cancelar y el fin del período ya llegó. HU-1708: PAGO_PENDIENTE desde el fin del período hasta el pago; SUSPENDIDA (solo lectura) desde el día 10 sin pago' })
  estado: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA';
  @ApiProperty({ format: 'date-time' }) inicioPeriodo: string;
  @ApiProperty({ format: 'date-time', description: 'Fin del período pagado: la renovación, o el fin si se canceló' }) finPeriodo: string;
  @ApiProperty({ description: 'Se cancelará al fin del período' }) cancelarAlFin: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) canceladaEn: string | null;
  @ApiProperty({ type: PlanBreveDto, nullable: true, description: 'Bajada programada para la renovación' }) planProgramado: PlanBreveDto | null;
  @ApiProperty({ type: [PlanOpcionDto], description: 'Los planes publicados' }) planes: PlanOpcionDto[];
  @ApiProperty({ description: 'Hay una pasarela que cobra la moneda de la suscripción (para subir de plan o pagar la renovación)' }) pagoDisponible: boolean;
  @ApiProperty({ type: RenovacionDto, nullable: true, description: 'HU-1708 · La renovación que falta pagar (con PAGO_PENDIENTE o SUSPENDIDA)' }) renovacion: RenovacionDto | null;
  @ApiProperty({ type: DescuentoSuscripcionDto, nullable: true, description: 'HU-1709 · El cupón del alta, si le quedan renovaciones con descuento' }) descuento: DescuentoSuscripcionDto | null;
}

/** Datos no confiables: los valida `@aptio/schema/cambio-plan`. */
export class CambioPlanEntradaDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiPropertyOptional({ default: false, description: 'false = solo la vista previa con el prorrateo' }) confirmar?: boolean;
}

export class CambioPlanDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null en la vista previa y en la bajada (no se cobra)' }) id: string | null;
  @ApiProperty({ enum: ['SUBIDA', 'BAJADA'] }) tipo: 'SUBIDA' | 'BAJADA';
  @ApiProperty({ enum: ['VISTA_PREVIA', 'PROGRAMADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO'] }) estado: 'VISTA_PREVIA' | 'PROGRAMADO' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  @ApiProperty({ type: PlanBreveDto }) planOrigen: PlanBreveDto;
  @ApiProperty({ type: PlanBreveDto }) planDestino: PlanBreveDto;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1290, description: 'El precio nuevo por el ciclo, sin IGV' }) precioNuevoSinIgv: number;
  @ApiProperty({ example: 15 }) diasRestantes: number;
  @ApiProperty({ example: 30 }) diasPeriodo: number;
  @ApiProperty({ example: 400, description: 'Prorrateo por día, sin IGV; 0 en una bajada' }) diferenciaSinIgv: number;
  @ApiProperty({ example: 72 }) igv: number;
  @ApiProperty({ example: 472 }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ format: 'date-time', description: 'Desde cuándo rige: ahora (subida, al aprobarse el pago) o la renovación (bajada)' }) rigeDesde: string;
  @ApiProperty({ type: String, nullable: true, example: 'pruebas' }) pasarela: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo: string | null;
  @ApiPropertyOptional({ type: PagoCheckoutDto, description: 'Solo al confirmar una subida: cómo sigue el pago' }) pago?: PagoCheckoutDto;
  @ApiProperty({ type: SuscripcionOrgDto }) suscripcion: SuscripcionOrgDto;
}

export class PagoPruebaCambioDto {
  @ApiProperty({ example: '4111 1111 1111 1111' }) tarjeta: string;
}

export class TokenCambioDto {
  @ApiProperty({ example: 'tkn_test_…' }) token: string;
}
