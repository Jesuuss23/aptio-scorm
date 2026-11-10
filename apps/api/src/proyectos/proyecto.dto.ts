import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { ESTADOS_PROYECTO, FORMATOS, MODOS_IDIOMA, PERFILES_LMS, TONOS } from '@aptio/schema/proyecto';

const IDIOMAS = ['es', 'en'] as const;
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Todo opcional: muchos clientes no lo definen (RN-03-2). */
export class DatosTecnicosDto {
  @ApiPropertyOptional({ example: 'Aún no se sabe' }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(80) lms?: string;
  @ApiPropertyOptional({ enum: FORMATOS }) @IsOptional() @IsIn(FORMATOS) formato?: (typeof FORMATOS)[number];
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0) @Max(100000) horasCapacitacion?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsNumber() @Min(0) @Max(100) porcentajeScorm?: number;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString({ strict: true }) fechaEntrega?: string;
}

/** Nuevo SCORM: solo cliente y nombre son obligatorios (RN-03-1). */
export class ProyectoEntradaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clienteId: string;
  @ApiProperty({ minLength: 2, example: 'Bloqueo y etiquetado' }) @Transform(recortar) @IsString() @MinLength(2) @MaxLength(160) nombre: string;
  @ApiPropertyOptional({ enum: IDIOMAS, isArray: true, description: 'Por defecto, los idiomas del cliente' })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsIn(IDIOMAS, { each: true }) idiomas?: ('es' | 'en')[];
  @ApiPropertyOptional({ enum: MODOS_IDIOMA }) @IsOptional() @IsIn(MODOS_IDIOMA) modoIdioma?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(200) publico?: string;
  @ApiPropertyOptional({ enum: TONOS }) @IsOptional() @IsIn(TONOS) tono?: string;
  @ApiPropertyOptional({ minimum: 5, maximum: 120 }) @IsOptional() @IsInt() @Min(5) @Max(120) pantallasObjetivo?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) porcentajeActividades?: number;
  @ApiPropertyOptional({ type: DatosTecnicosDto }) @IsOptional() @ValidateNested() @Type(() => DatosTecnicosDto) datosTecnicos?: DatosTecnicosDto;
}

/** PATCH: todo opcional. */
export class ProyectoCambioDto extends PartialType(ProyectoEntradaDto) {}

export class FiltroProyectosDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() clienteId?: string;
  @ApiPropertyOptional({ enum: ESTADOS_PROYECTO, description: 'Sin estado se listan todos menos los archivados' })
  @IsOptional() @IsIn(ESTADOS_PROYECTO) estado?: (typeof ESTADOS_PROYECTO)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(100) buscar?: string;
}

class AvanceDto {
  @ApiProperty() aprobadas: number;
  @ApiProperty() total: number;
}

export class ProyectoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) clienteId: string;
  @ApiProperty() clienteNombre: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ enum: ESTADOS_PROYECTO }) estado: string;
  @ApiProperty({ enum: IDIOMAS, isArray: true }) idiomas: string[];
  @ApiProperty({ enum: MODOS_IDIOMA }) modoIdioma: string;
  @ApiProperty({ nullable: true }) publico: string | null;
  @ApiProperty({ nullable: true }) tono: string | null;
  @ApiProperty({ nullable: true }) pantallasObjetivo: number | null;
  @ApiProperty({ nullable: true }) porcentajeActividades: number | null;
  @ApiProperty({ type: DatosTecnicosDto }) datosTecnicos: DatosTecnicosDto;
  @ApiProperty({ enum: PERFILES_LMS, description: 'Perfil de entrega propuesto: Genérico sin LMS (CP-031)' }) perfilPropuesto: string;
  @ApiProperty({ type: AvanceDto }) avance: AvanceDto;
  @ApiProperty() costoIaUsd: number;
  @ApiProperty() creadoEn: string;
  @ApiProperty() actualizadoEn: string;
}

/** HU-1101 · El documento del curso del proyecto: lo lee la vista previa con el reproductor único. */
export class CursoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) proyectoId: string;
  @ApiProperty({ example: '0.2.0' }) versionEsquema: string;
  @ApiProperty({ description: 'Versión del documento; va también en el encabezado ETag' }) version: number;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Valida contra packages/schema/esquemas/curso-v0.schema.json' }) documento: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', format: 'uri' }, description: 'HU-0702 · URL firmada (15 min) de cada audio de narración del curso, por id de recurso' })
  urlsRecursos: Record<string, string>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'HU-0702 · SVG saneado de cada personaje del curso, por id de recurso, para dibujarlo en línea y animar su boca' })
  svgPersonajes: Record<string, string>;
}
