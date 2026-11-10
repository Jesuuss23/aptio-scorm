import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ETAPAS, ESTADOS_TRABAJO } from '@aptio/schema/generacion';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
  @ApiProperty({ nullable: true, description: 'Lo que guardó la etapa (p. ej. ResumenMaterial en RESUMEN_MATERIAL); null si no terminó' })
  datos: unknown;
}
