import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** HU-1707 · Un comprobante electrónico como lo ve el superadmin (Ventas › Facturación, PNT-37). */
export class ComprobanteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['FACTURA', 'BOLETA', 'NOTA_CREDITO'] }) tipo: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO';
  @ApiProperty({ example: 'F001' }) serie: string;
  @ApiProperty({ example: 1 }) numero: number;
  @ApiProperty({ example: 'F001-00000001' }) numeroCompleto: string;
  @ApiProperty({ format: 'uuid' }) cobroId: string;
  @ApiProperty({ type: String, nullable: true, example: 'F001-00000001', description: 'La nota de crédito: el comprobante que corrige' }) referencia: string | null;
  @ApiProperty({ type: String, nullable: true, example: '20131312955', description: 'null en una boleta sin documento' }) ruc: string | null;
  @ApiProperty({ example: 'Minera Andina SAC' }) razonSocial: string;
  @ApiProperty({ type: String, nullable: true }) direccion: string | null;
  @ApiProperty({ example: 'pagos@minera.pe' }) correoFacturacion: string;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 1290 }) baseSinIgv: number;
  @ApiProperty({ example: 232.2 }) igv: number;
  @ApiProperty({ example: 1522.2 }) total: number;
  @ApiProperty({ type: Number, nullable: true, example: 182.66, description: 'Monto de la detracción (RN-18-9), si aplica' }) detraccion: number | null;
  @ApiProperty({ enum: ['PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO'], description: 'Estado SUNAT según el OSE' }) estado: 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
  @ApiProperty({ type: String, nullable: true, description: 'Lo que respondió el OSE, o por qué sigue pendiente' }) motivo: string | null;
  @ApiProperty({ example: 'pruebas' }) proveedor: string;
  @ApiProperty({ enum: ['pruebas', 'produccion'] }) ambiente: string;
  @ApiProperty({ description: 'Ya hay PDF y XML en el almacenamiento' }) conArchivos: boolean;
  @ApiProperty({ description: 'Observado o pendiente: se puede corregir el receptor y reenviar' }) reenviable: boolean;
  @ApiProperty() intentos: number;
  @ApiProperty({ format: 'date-time' }) emitidoEn: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) correoEnviadoEn: string | null;
}

export class ComprobantesDto {
  @ApiProperty({ type: [ComprobanteDto] }) comprobantes: ComprobanteDto[];
}

export class FiltroComprobantesDto {
  @ApiPropertyOptional({ enum: ['PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO'] })
  @IsOptional() @IsIn(['PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO'])
  estado?: 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
}

/** CP-149 · El receptor corregido. La validación es de `@aptio/schema/comprobantes` (una factura exige RUC válido). */
export class ReenvioComprobanteDto {
  @ApiProperty({ type: String, nullable: true, example: '20131312955' }) ruc: string | null;
  @ApiProperty({ example: 'Minera Andina SAC', maxLength: 200 }) razonSocial: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 250 }) direccion?: string | null;
  @ApiProperty({ example: 'pagos@minera.pe' }) correoFacturacion: string;
}

export class ProveedorOseDto {
  @ApiProperty({ example: 'pruebas' }) codigo: string;
  @ApiProperty({ example: 'OSE de pruebas (simulado)' }) nombre: string;
  @ApiProperty({ description: 'Existe en este entorno (el simulado solo con SITIO_ENTORNO=pruebas)' }) disponible: boolean;
}

/** HU-1707 · Los datos fiscales del emisor. Los secretos del OSE viven solo en variables de entorno, nunca aquí. */
export class DatosFiscalesEntradaDto {
  @ApiProperty({ type: String, nullable: true, example: '20000000001' }) rucEmisor: string | null;
  @ApiProperty({ example: 'Grupo de Soluciones Creativas SAC' }) razonSocialEmisor: string;
  @ApiProperty({ example: 'Av. Ejemplo 123, Lima' }) direccionEmisor: string;
  @ApiProperty({ example: 'F001' }) serieFactura: string;
  @ApiProperty({ example: 'B001' }) serieBoleta: string;
  @ApiProperty({ example: 'FC01' }) serieNotaFactura: string;
  @ApiProperty({ example: 'BC01' }) serieNotaBoleta: string;
  @ApiProperty({ example: 'pruebas' }) proveedor: string;
  @ApiProperty({ enum: ['pruebas', 'produccion'] }) ambiente: 'pruebas' | 'produccion';
  @ApiProperty({ description: 'RN-18-9 · Por validar con el contador (SUP-317)' }) detraccionActiva: boolean;
  @ApiProperty({ example: 12, description: 'Porcentaje' }) detraccionTasa: number;
  @ApiProperty({ example: 700, description: 'Desde este total en soles (con IGV)' }) detraccionUmbralPen: number;
}

export class DatosFiscalesDto extends DatosFiscalesEntradaDto {
  @ApiProperty({ type: [ProveedorOseDto] }) proveedores: ProveedorOseDto[];
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class EventoOseRecibidoDto {
  @ApiProperty() recibido: boolean;
  @ApiProperty({ description: 'El mismo aviso ya se había procesado: no cambia nada' }) duplicado: boolean;
}
