import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** HU-1703 · Lo que envía el script de `/pago` (datos no confiables: los valida `@aptio/schema/suscripciones`). */
export class CheckoutEntradaDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiPropertyOptional({ enum: ['MENSUAL', 'ANUAL'], default: 'MENSUAL' }) ciclo?: 'MENSUAL' | 'ANUAL';
  @ApiPropertyOptional({ enum: ['PEN', 'USD'], default: 'PEN', description: 'HU-1704 · Dólares solo si el plan tiene precio en USD y una pasarela cobra en dólares' }) moneda?: 'PEN' | 'USD';
  @ApiProperty({ example: 'Minera Andina SAC', maxLength: 150 }) razonSocial: string;
  @ApiPropertyOptional({ example: '20131312955', description: '11 dígitos con el dígito verificador de SUNAT. Con RUC, factura; sin RUC, boleta' }) ruc?: string;
  @ApiPropertyOptional({ example: '40506089', description: 'HU-1712 · Solo sin RUC (boleta): DNI de 8 dígitos, obligatorio si el total supera S/ 700 (o US$ 200)' }) dni?: string;
  @ApiProperty({ example: 'Ana Quispe', maxLength: 120 }) nombreAdmin: string;
  @ApiProperty({ example: 'ana@minera.pe', maxLength: 160 }) correoAdmin: string;
  @ApiProperty({ example: true, description: 'Términos y tratamiento de datos personales (Ley 29733)' }) consentimiento: boolean;
  @ApiPropertyOptional({ example: '/precios' }) paginaEntrada?: string;
  @ApiPropertyOptional() referente?: string;
  @ApiPropertyOptional() utm_source?: string;
  @ApiPropertyOptional() utm_medium?: string;
  @ApiPropertyOptional() utm_campaign?: string;
  @ApiPropertyOptional({ enum: ['es', 'en'] }) idioma?: 'es' | 'en';
  @ApiPropertyOptional({ example: 'LANZAMIENTO26', description: 'HU-1709 · El código de un cupón o convenio: se vuelve a validar aquí; si no vale, 422 con el campo `cupon`' }) cupon?: string;
}

export class ResumenCheckoutDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiProperty({ example: 'Productora' }) nombrePlan: string;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1290, description: 'Sin IGV por el ciclo, en la moneda del cobro: el precio pactado' }) subtotal: number;
  @ApiProperty({ example: 232.2, description: 'IGV de 18 %' }) igv: number;
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'], example: 'PEN' }) moneda: 'PEN' | 'USD';
  @ApiPropertyOptional({ example: 258, description: 'HU-1709 · El descuento del cupón sin IGV (0 sin cupón)' }) descuento?: number;
  @ApiPropertyOptional({ example: 1032, description: 'HU-1709 · La base que se cobra sin IGV: subtotal − descuento' }) base?: number;
  @ApiPropertyOptional({ type: () => CuponAplicadoDto, nullable: true }) cupon?: CuponAplicadoDto | null;
}

/** HU-1709 · El cupón aplicado al resumen. */
export class CuponAplicadoDto {
  @ApiProperty({ example: 'LANZAMIENTO26' }) codigo: string;
  @ApiProperty({ example: 'Lanzamiento 2026' }) nombre: string;
  @ApiProperty({ enum: ['CAMPANA', 'CONVENIO'] }) tipo: 'CAMPANA' | 'CONVENIO';
  @ApiProperty({ example: 20 }) porcentaje: number;
  @ApiProperty({ example: 3, nullable: true, type: Number, description: 'Pagos con descuento contando el alta; null = permanente' }) ciclosDescuento: number | null;
}

/**
 * HU-1704 · Cómo se paga: el formulario simulado (pruebas), la página alojada de la pasarela (Stripe Checkout: `url`) o
 * su formulario incrustado (Culqi Checkout: llave pública y monto en céntimos). La tarjeta nunca pasa por Aptio SCORM.
 */
export class PagoCheckoutDto {
  @ApiProperty({ enum: ['simulado', 'redireccion', 'formulario'] }) tipo: 'simulado' | 'redireccion' | 'formulario';
  @ApiPropertyOptional({ example: 'https://checkout.stripe.com/c/pay/cs_test_…' }) url?: string;
  @ApiPropertyOptional({ example: 'cs_test_…', description: 'La sesión o el cargo en la pasarela' }) referencia?: string;
  @ApiPropertyOptional({ example: 'pk_test_…', description: 'Llave pública (nunca la secreta)' }) llavePublica?: string;
  @ApiPropertyOptional({ example: 152220 }) montoCentimos?: number;
  @ApiPropertyOptional({ enum: ['PEN', 'USD'] }) moneda?: 'PEN' | 'USD';
  @ApiPropertyOptional({ example: 'Aptio SCORM · Plan Productora (mensual)' }) descripcion?: string;
}

export class CheckoutCreadoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE'] }) estado: 'PENDIENTE';
  @ApiProperty({ type: ResumenCheckoutDto }) resumen: ResumenCheckoutDto;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobante: 'FACTURA' | 'BOLETA';
  @ApiProperty({ example: 'pruebas', enum: ['pruebas', 'culqi', 'stripe'], description: 'La pasarela que cobra esa moneda (HU-1704)' }) pasarela: string;
  @ApiProperty({ type: PagoCheckoutDto }) pago: PagoCheckoutDto;
}

export class EstadoCheckoutDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] }) estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiProperty({ example: 'Productora' }) nombrePlan: string;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobante: 'FACTURA' | 'BOLETA';
  @ApiProperty({ example: 'ana@minera.pe', description: 'Adónde llega el correo de bienvenida' }) correoAdmin: string;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin del período pagado, con la suscripción ya activa' }) finPeriodo: string | null;
}

export class PagoPruebaDto {
  @ApiProperty({ example: '4111 1111 1111 1111', description: '4111 1111 1111 1111 aprueba; 4000 0000 0000 0002 rechaza. Solo se guardan los 4 últimos' }) tarjeta: string;
}

export class TokenPagoDto {
  @ApiProperty({ example: 'tkn_test_…', description: 'El token de un solo uso del formulario incrustado de la pasarela (Culqi Checkout)' }) token: string;
}

export class WebhookRecibidoDto {
  @ApiProperty({ example: true }) recibido: true;
  @ApiProperty({ description: 'true si el evento ya se había procesado: no se creó nada' }) duplicado: boolean;
  @ApiPropertyOptional({ description: 'HU-1704 · true si el evento no es de pago (la pasarela manda otros tipos): no se creó nada' }) ignorado?: boolean;
}
