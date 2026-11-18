import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CuotaDto } from './cuotas.dto.js';

/** HU-1711 · Un comprobante como lo ve el administrador de la organización (PNT-40). */
export class ComprobanteOrgDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA', 'NOTA_CREDITO'] }) tipo: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO';
  @ApiProperty({ example: 'F001-00000001' }) numeroCompleto: string;
  @ApiProperty({ type: String, nullable: true, example: 'F001-00000001', description: 'La nota de crédito: el comprobante que corrige' }) referencia: string | null;
  @ApiProperty({ format: 'date-time' }) emitidoEn: string;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 1522.2, description: 'Con IGV' }) total: number;
  @ApiProperty({ enum: ['PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO'], description: 'Estado SUNAT según el OSE' }) estado: 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
  @ApiProperty({ description: 'Ya hay PDF para descargar' }) conPdf: boolean;
  @ApiProperty({ description: 'Ya hay XML para descargar' }) conXml: boolean;
  @ApiProperty({ description: 'HU-1712 · Ya está la constancia de recepción de SUNAT (CDR)' }) conCdr: boolean;
}

export class DatosFacturacionDto {
  @ApiProperty({ example: 'Minera Andina SAC' }) razonSocial: string;
  @ApiProperty({ type: String, nullable: true, example: '20131312955' }) ruc: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Av. Arequipa 123, Lima' }) direccion: string | null;
  @ApiProperty({ example: 'pagos@minera.pe' }) correoFacturacion: string;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobantePreferido: 'FACTURA' | 'BOLETA';
  @ApiProperty({ type: String, nullable: true, example: '40506089', description: 'HU-1712 · DNI del comprador para la boleta' }) dni: string | null;
  @ApiProperty({ enum: ['PORTAL', 'ALTA'], description: 'PORTAL: los editó el administrador; ALTA: los de la solicitud del alta (o la organización), mientras no se editen' }) origen: 'PORTAL' | 'ALTA';
}

/** Lo que envía el formulario. Datos no confiables: los valida `@aptio/schema/facturacion-org`. */
export class DatosFacturacionEntradaDto {
  @ApiProperty({ example: 'Minera Andina SAC', maxLength: 150 }) razonSocial: string;
  @ApiPropertyOptional({ example: '20131312955', description: 'Obligatorio para factura; 11 dígitos con el dígito verificador de SUNAT' }) ruc?: string;
  @ApiPropertyOptional({ example: 'Av. Arequipa 123, Lima', maxLength: 200 }) direccion?: string;
  @ApiProperty({ example: 'pagos@minera.pe' }) correoFacturacion: string;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] }) tipoComprobantePreferido: 'FACTURA' | 'BOLETA';
  @ApiPropertyOptional({ example: '40506089', description: 'HU-1712 · Boleta: DNI de 8 dígitos, obligatorio si el plan supera S/ 700 con IGV' }) dni?: string;
}

export class MedioPagoDto {
  @ApiProperty({ example: 'pruebas' }) pasarela: string;
  @ApiProperty({ type: String, nullable: true, example: '1111', description: 'Los 4 últimos de la tarjeta, nunca más' }) ultimos4Digitos: string | null;
  @ApiProperty({ description: 'Solo con la pasarela de pruebas se cambia desde el portal (SUP-331)' }) editable: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Con Stripe o Culqi: cómo sigue el cobro (enlace por correo, SUP-319)' }) aviso: string | null;
}

export class MedioPagoEntradaDto {
  @ApiProperty({ example: '4111 1111 1111 1111', description: 'Una tarjeta de prueba: se guardan solo sus 4 últimos dígitos. Sin CVV.' }) tarjeta: string;
}

export class PlanFacturacionDto {
  @ApiProperty({ example: 'Productora' }) nombre: string;
  @ApiProperty({ enum: ['MENSUAL', 'ANUAL'] }) ciclo: 'MENSUAL' | 'ANUAL';
  @ApiProperty({ example: 1290, description: 'Sin IGV, por el ciclo' }) precioPactadoSinIgv: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ enum: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'] }) estado: string;
  @ApiProperty({ format: 'date-time' }) finPeriodo: string;
}

/** HU-1711 · El portal de facturación de la organización (REQ-091, PNT-40). */
export class FacturacionOrgDto {
  @ApiProperty({ type: PlanFacturacionDto, nullable: true, description: 'null sin suscripción' }) plan: PlanFacturacionDto | null;
  @ApiProperty({ type: CuotaDto, description: 'El consumo de cápsulas del mes' }) consumo: CuotaDto;
  @ApiProperty({ type: MedioPagoDto, nullable: true, description: 'null sin suscripción' }) medioPago: MedioPagoDto | null;
  @ApiProperty({ type: DatosFacturacionDto }) datos: DatosFacturacionDto;
  @ApiProperty({ type: [ComprobanteOrgDto], description: 'Los 100 más recientes de la organización' }) comprobantes: ComprobanteOrgDto[];
}
