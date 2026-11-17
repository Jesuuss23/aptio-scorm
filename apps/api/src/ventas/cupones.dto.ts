import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResumenCheckoutDto } from './suscripciones.dto.js';

/** HU-1709 · Lo que envía la consola al crear o editar un cupón (datos no confiables: los valida `@aptio/schema/cupones`). */
export class CuponEntradaDto {
  @ApiProperty({ example: 'LANZAMIENTO26', description: 'De 3 a 30 letras, números o guiones; se guarda en mayúsculas' }) codigo: string;
  @ApiProperty({ example: 'Lanzamiento 2026', maxLength: 80 }) nombre: string;
  @ApiPropertyOptional({ enum: ['CAMPANA', 'CONVENIO'], default: 'CAMPANA' }) tipo?: 'CAMPANA' | 'CONVENIO';
  @ApiProperty({ example: 20, minimum: 1, maximum: 100 }) porcentaje: number;
  @ApiPropertyOptional({ example: 3, nullable: true, description: 'Pagos con descuento contando el alta; null = permanente' }) ciclosDescuento?: number | null;
  @ApiPropertyOptional({ example: '2026-11-01', nullable: true, description: 'Día de Lima (inclusivo)' }) vigenciaDesde?: string | null;
  @ApiPropertyOptional({ example: '2026-12-31', nullable: true, description: 'Día de Lima (vale todo ese día)' }) vigenciaHasta?: string | null;
  @ApiPropertyOptional({ example: 50, nullable: true, description: 'null = sin límite' }) limiteUsos?: number | null;
  @ApiPropertyOptional({ type: [String], example: ['productora'], description: 'Slugs; vacío = todos los planes con tarifa' }) planesPermitidos?: string[];
  @ApiPropertyOptional({ type: [String], example: ['pucp.edu.pe'], description: 'Obligatorio en un convenio y solo en él (también vale un subdominio)' }) dominiosCorreo?: string[];
  @ApiPropertyOptional({ default: true, description: 'Ocultar no borra: el cupón deja de aceptarse en el pago' }) visible?: boolean;
  @ApiPropertyOptional({ default: 0 }) orden?: number;
}

export class CuponDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'LANZAMIENTO26' }) codigo: string;
  @ApiProperty({ example: 'Lanzamiento 2026' }) nombre: string;
  @ApiProperty({ enum: ['CAMPANA', 'CONVENIO'] }) tipo: 'CAMPANA' | 'CONVENIO';
  @ApiProperty({ example: 20 }) porcentaje: number;
  @ApiProperty({ example: 3, nullable: true, type: Number }) ciclosDescuento: number | null;
  @ApiProperty({ example: '2026-11-01', nullable: true, type: String }) vigenciaDesde: string | null;
  @ApiProperty({ example: '2026-12-31', nullable: true, type: String }) vigenciaHasta: string | null;
  @ApiProperty({ example: 50, nullable: true, type: Number }) limiteUsos: number | null;
  @ApiProperty({ example: 18, description: 'Altas aprobadas con el cupón' }) usos: number;
  @ApiProperty({ type: [String] }) planesPermitidos: string[];
  @ApiProperty({ type: [String] }) dominiosCorreo: string[];
  @ApiProperty() visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ example: '−20 % en los primeros 3 pagos' }) beneficio: string;
  @ApiProperty({ enum: ['ACTIVO', 'PROGRAMADO', 'VENCIDO', 'AGOTADO', 'OCULTO'] }) estado: 'ACTIVO' | 'PROGRAMADO' | 'VENCIDO' | 'AGOTADO' | 'OCULTO';
}

export class CuponesDto {
  @ApiProperty({ type: [CuponDto] }) cupones: CuponDto[];
}

/** HU-1709 · La vista previa del cupón en el paso 2 de `/pago`. */
export class VistaCuponEntradaDto {
  @ApiProperty({ example: 'productora' }) plan: string;
  @ApiPropertyOptional({ enum: ['MENSUAL', 'ANUAL'], default: 'MENSUAL' }) ciclo?: 'MENSUAL' | 'ANUAL';
  @ApiPropertyOptional({ enum: ['PEN', 'USD'], default: 'PEN' }) moneda?: 'PEN' | 'USD';
  @ApiProperty({ example: 'LANZAMIENTO26' }) cupon: string;
  @ApiPropertyOptional({ example: 'ana@pucp.edu.pe', description: 'Para los convenios y para ver si la empresa ya lo usó' }) correoAdmin?: string;
  @ApiPropertyOptional({ example: '20131312955' }) ruc?: string;
}

export class VistaCuponDto {
  @ApiProperty({ type: ResumenCheckoutDto, description: 'Con `descuento`, `base` y `cupon`; IGV y total sobre la base descontada' }) resumen: ResumenCheckoutDto;
}
