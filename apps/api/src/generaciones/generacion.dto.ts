import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ETAPAS, ESTADOS_TRABAJO } from '@aptio/schema/generacion';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Todo es opcional: lo que no se envía se toma del proyecto (HU-0401). */
export class GeneracionEntradaDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 120, description: 'Sin valor, la IA propone la extensión con el material' })
  @IsOptional() @IsInt() @Min(5) @Max(120) pantallas?: number;
  @ApiPropertyOptional({ enum: ['es', 'en'], isArray: true }) @IsOptional() @IsArray() @IsIn(['es', 'en'], { each: true }) idiomas?: ('es' | 'en')[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) publico?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) tono?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) porcentajeActividades?: number;
}

export class EtapaDto {
  @ApiProperty({ enum: ETAPAS }) etapa: string;
  @ApiProperty() orden: number;
  @ApiProperty({ enum: ESTADOS_TRABAJO }) estado: string;
  @ApiProperty({ nullable: true, description: 'Resumen legible de lo hecho o del error' }) detalle: string | null;
  @ApiProperty({ nullable: true }) inicio: string | null;
  @ApiProperty({ nullable: true }) fin: string | null;
  @ApiProperty() costoUsd: number;
}

export class GeneracionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) proyectoId: string;
  @ApiProperty({ enum: ESTADOS_TRABAJO }) estado: string;
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Porcentaje de etapas terminadas' }) avance: number;
  @ApiProperty() costoUsd: number;
  @ApiProperty({ description: 'Parámetros con los que se lanzó' }) parametros: Record<string, unknown>;
  @ApiProperty({ type: [EtapaDto] }) etapas: EtapaDto[];
  @ApiProperty() creadoEn: string;
  @ApiProperty({ nullable: true }) terminadoEn: string | null;
}

export class EtapaResultadoDto extends EtapaDto {
  @ApiProperty({ nullable: true, description: 'Lo que guardó la etapa (p. ej. ResumenMaterial en RESUMEN_MATERIAL); en curso, su avance si lo guarda (PANTALLAS); si no, null' })
  datos: unknown;
}

/** HU-0703 · Qué narraciones regenerar. Por defecto, solo las desactualizadas (RN-07-1). */
export class NarracionSolicitudDto {
  @ApiPropertyOptional({ type: [String], example: ['p02', 'p12'], description: 'Limita a estas pantallas; sin lista, todas las del curso' })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @Matches(/^[A-Za-z0-9_-]{1,64}$/, { each: true }) pantallaIds?: string[];
  @ApiPropertyOptional({ type: [String], enum: ['es', 'en'], example: ['es'], description: 'Por ahora solo es; en llega con M08 (S5) y responde 422' })
  @IsOptional() @IsArray() @IsIn(['es', 'en'], { each: true }) idiomas?: ('es' | 'en')[];
  @ApiPropertyOptional({ default: true, description: 'false (con pantallaIds) pide una toma nueva aunque nada haya cambiado' })
  @IsOptional() @IsBoolean() soloDesactualizadas?: boolean;
}

/** HU-0703 · La regeneración continúa la última generación: su id, su estado y su flujo de eventos. */
export class RegeneracionDto {
  @ApiProperty({ format: 'uuid', description: 'Id de la generación que se continúa' }) id: string;
  @ApiProperty({ enum: ESTADOS_TRABAJO }) estado: string;
  @ApiProperty({ format: 'uri', description: 'URL de eventos (SSE) de la generación' }) eventos: string;
  @ApiProperty({ description: 'Narraciones marcadas «Por regenerar» o con error al pedirlo' }) pendientes: number;
}
