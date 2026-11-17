import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** HU-1703 · Lo que envía el script de `/pago` (datos no confiables: los valida `@aptio/schema/suscripciones`). */
export class CheckoutEntradaDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiPropertyOptional({ enum: ['MENSUAL', 'ANUAL'], default: 'MENSUAL' }) ciclo?: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 'Minera Andina SAC', maxLength: 150 }) razonSocial: string;
  @ApiPropertyOptional({ example: '20131312955', description: '11 dígitos con el dígito verificador de SUNAT. Con RUC, factura; sin RUC, boleta' }) ruc?: string;
  @ApiProperty({ example: 'Ana Quispe', maxLength: 120 }) nombreAdmin: string;
  @ApiProperty({ example: 'ana@minera.pe', maxLength: 160 }) correoAdmin: string;
  @ApiProperty({ example: true, description: 'Términos y tratamiento de datos personales (Ley 29733)' }) consentimiento: boolean;
  @ApiPropertyOptional({ example: '/precios' }) paginaEntrada?: string;
  @ApiPropertyOptional() referente?: string;
  @ApiPropertyOptional() utm_source?: string;
  @ApiPropertyOptional() utm_medium?: string;
  @ApiPropertyOptional() utm_campaign?: string;
  @ApiPropertyOptional({ enum: ['es', 'en'] }) idioma?: 'es' | 'en';
}

export class ResumenCheckoutDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiProperty({ example: 'Productora' }) nombrePlan: string;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1290, description: 'Soles sin IGV por el ciclo: el precio pactado' }) subtotal: number;
  @ApiProperty({ example: 232.2, description: 'IGV de 18 %' }) igv: number;
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ example: 'PEN' }) moneda: 'PEN';
}

export class CheckoutCreadoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE'] }) estado: 'PENDIENTE';
  @ApiProperty({ type: ResumenCheckoutDto }) resumen: ResumenCheckoutDto;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobante: 'FACTURA' | 'BOLETA';
  @ApiProperty({ example: 'prueba', description: 'La pasarela que cobra (HU-1703: solo la de pruebas)' }) pasarela: string;
}

export class EstadoCheckoutDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] }) estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiProperty({ example: 'Productora' }) nombrePlan: string;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobante: 'FACTURA' | 'BOLETA';
  @ApiProperty({ example: 'ana@minera.pe', description: 'Adónde llega el correo de bienvenida' }) correoAdmin: string;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin del período pagado, con la suscripción ya activa' }) finPeriodo: string | null;
}

export class PagoPruebaDto {
  @ApiProperty({ example: '4111 1111 1111 1111', description: '4111 1111 1111 1111 aprueba; 4000 0000 0000 0002 rechaza. Solo se guardan los 4 últimos' }) tarjeta: string;
}

export class WebhookRecibidoDto {
  @ApiProperty({ example: true }) recibido: true;
  @ApiProperty({ description: 'true si el evento ya se había procesado: no se creó nada' }) duplicado: boolean;
}
