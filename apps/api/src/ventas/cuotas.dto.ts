import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PagoCheckoutDto } from './suscripciones.dto.js';

/** HU-1705 · El precio de una cápsula adicional en la moneda de la suscripción. */
export class OfertaAdicionalDto {
  @ApiProperty({ example: 89, description: 'Sin IGV, por cápsula' }) unitario: number;
  @ApiProperty({ example: 16.02 }) igv: number;
  @ApiProperty({ example: 105.02, description: 'Con IGV de 18 %, por cápsula' }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ description: 'Hay una pasarela visible y activa que cobra esa moneda' }) disponible: boolean;
}

/** HU-1705 · La cuota de cápsulas de la ventana mensual vigente (REQ-085, RN-18-6). */
export class CuotaDto {
  @ApiProperty({ description: 'Sin suscripción (organización interna) o plan a medida: sin límite' }) ilimitada: boolean;
  @ApiProperty({ format: 'date-time' }) ventanaInicio: string;
  @ApiProperty({ format: 'date-time', description: 'Cuando se renueva la cuota; las no usadas y las adicionales vencen aquí' }) ventanaFin: string;
  @ApiProperty({ type: Number, nullable: true, example: 20, description: 'Cápsulas al mes del plan' }) incluidas: number | null;
  @ApiProperty({ example: 0, description: 'Adicionales aprobadas en la ventana' }) adicionales: number;
  @ApiProperty({ example: 17 }) usadas: number;
  @ApiProperty({ type: Number, nullable: true, example: 3, description: 'null si es ilimitada' }) disponibles: number | null;
  @ApiProperty({ type: OfertaAdicionalDto, nullable: true, description: 'null si el plan no vende adicionales o no hay suscripción' }) oferta: OfertaAdicionalDto | null;
  @ApiProperty({ description: 'El usuario es ADMINISTRADOR y hay una oferta disponible' }) puedeComprar: boolean;
  @ApiProperty({ example: '/plan', description: 'Subir de plan: `/plan` en la consola para el administrador de una organización suscrita (HU-1706); si no, `/s/precios`' }) planes: string;
  @ApiProperty({ description: 'HU-1706 · La suscripción terminó (cancelada al fin del período): cuota 0 y sin adicionales' }) cancelada: boolean;
}

/** Datos no confiables: los valida `@aptio/schema/cuotas`. */
export class CompraAdicionalesEntradaDto {
  @ApiProperty({ minimum: 1, maximum: 10, example: 1 }) cantidad: number;
}

export class CompraCapsulasDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] }) estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  @ApiProperty({ example: 1 }) cantidad: number;
  @ApiProperty({ example: 89 }) subtotal: number;
  @ApiProperty({ example: 16.02 }) igv: number;
  @ApiProperty({ example: 105.02 }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 'pruebas' }) pasarela: string;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo: string | null;
  @ApiPropertyOptional({ type: PagoCheckoutDto, description: 'Solo al crearla: cómo sigue el pago' }) pago?: PagoCheckoutDto;
  @ApiProperty({ type: CuotaDto, description: 'La cuota tras la compra (con las adicionales, si ya se aprobó)' }) cuota: CuotaDto;
}

export class PagoPruebaCompraDto {
  @ApiProperty({ example: '4111 1111 1111 1111' }) tarjeta: string;
}

export class TokenCompraDto {
  @ApiProperty({ example: 'tkn_test_…' }) token: string;
}
