import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PlanBreveDto, RenovacionDto, SuscripcionOrgDto } from './cambio-plan.dto.js';

export { RenovacionDto };
import { PagoCheckoutDto } from './suscripciones.dto.js';

/** HU-1708 · «Pagar ahora»: cómo sigue el pago en la pasarela y la suscripción. */
export class PagoRenovacionDto {
  @ApiProperty({ type: RenovacionDto }) renovacion: RenovacionDto;
  @ApiPropertyOptional({ type: PagoCheckoutDto, description: 'Solo al iniciar el pago: cómo sigue' }) pago?: PagoCheckoutDto;
  @ApiProperty({ type: SuscripcionOrgDto }) suscripcion: SuscripcionOrgDto;
}

export class PagoPruebaRenovacionDto {
  @ApiProperty({ example: '4111 1111 1111 1111' }) tarjeta: string;
}

export class TokenRenovacionDto {
  @ApiProperty({ example: 'tkn_test_…' }) token: string;
}

/** HU-1708 · El aviso global de cobranza (PNT-36) para cualquier usuario de la organización. */
export class CobranzaOrgDto {
  @ApiProperty({ enum: ['AL_DIA', 'PAGO_PENDIENTE', 'SUSPENDIDA'] }) estado: 'AL_DIA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA';
  @ApiProperty({ type: Number, nullable: true, example: 1522.2 }) total: number | null;
  @ApiProperty({ enum: ['PEN', 'USD'], nullable: true }) moneda: 'PEN' | 'USD' | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'El fin del período que se renueva' }) finPeriodo: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'El día 10: la suspensión, o cuándo se suspendió' }) suspensionEn: string | null;
  @ApiProperty({ description: 'El usuario es administrador y puede pagar en /plan' }) puedePagar: boolean;
  @ApiProperty({ example: '/plan', description: 'Dónde se regulariza' }) regularizar: string;
}

export class OrganizacionBreveDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Minera Andina SAC' }) nombre: string;
}

/** HU-1708 · Una suscripción como la ve el superadmin (Ventas › Suscripciones). */
export class SuscripcionVentasDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: OrganizacionBreveDto }) organizacion: OrganizacionBreveDto;
  @ApiProperty({ type: PlanBreveDto }) plan: PlanBreveDto;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ enum: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'] }) estado: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA';
  @ApiProperty({ format: 'date-time' }) finPeriodo: string;
  @ApiProperty({ example: 'pruebas' }) pasarela: string;
  @ApiProperty({ type: String, nullable: true, example: '1111', description: 'Los 4 últimos de la tarjeta, nunca más' }) ultimos4Digitos: string | null;
  @ApiProperty({ type: RenovacionDto, nullable: true, description: 'La renovación pendiente o vencida' }) renovacion: RenovacionDto | null;
  @ApiProperty({ description: 'Con pago pendiente o suspendida: se puede reintentar' }) reintentable: boolean;
}

export class SuscripcionesVentasDto {
  @ApiProperty({ type: [SuscripcionVentasDto] }) suscripciones: SuscripcionVentasDto[];
}

export class ReintentoRenovacionDto {
  @ApiProperty({ type: SuscripcionVentasDto }) suscripcion: SuscripcionVentasDto;
  @ApiProperty({ description: 'El intento quedó en la cola: con pruebas cobra; con Stripe o Culqi manda el enlace' }) encolado: boolean;
}

export class FiltroSuscripcionesDto {
  @ApiPropertyOptional({ enum: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'] })
  @IsOptional() @IsIn(['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'])
  estado?: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA';
}
