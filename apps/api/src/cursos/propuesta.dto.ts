import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Tipos del contrato; en el S5 se calculan mas-visual, menos-texto, actividad, variantes y libre (SUP-39). */
export const TIPOS_CONTRATO = ['mas-visual', 'menos-texto', 'actividad', 'variantes', 'otra-ilustracion', 'libre', 'alineacion', 'patron', 'pausas-video', 'kit-extraer'] as const;
/** HU-1104 · Pedidos del tipo `patron` (IA-14). */
export const MODOS_PATRON_DTO = ['recomendar', 'crear'] as const;

/** HU-0504 · Pedido de una propuesta a la IA (IA-16; HU-1002: `alineacion` encola IA-17; HU-1104: `patron` encola IA-14). */
export class PropuestaSolicitudDto {
  @ApiProperty({ enum: TIPOS_CONTRATO }) @IsIn(TIPOS_CONTRATO) tipo: string;
  @ApiPropertyOptional({ description: 'Pantalla a la que se le propone el cambio (obligatoria salvo en `alineacion` y `patron`, que son del curso entero)' }) @IsOptional() @IsString() pantallaId?: string;
  @ApiPropertyOptional({ maxLength: 500, description: 'Texto del pedido libre' }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(500) pedido?: string;
  @ApiPropertyOptional({ enum: MODOS_PATRON_DTO, description: 'HU-1104 · Con `tipo: patron`: recomendar uno del catálogo o crear un personalizado' }) @IsOptional() @IsIn(MODOS_PATRON_DTO) modo?: string;
  @ApiPropertyOptional({ maxLength: 300, description: 'HU-1104 · Con `modo: crear`: cómo debe ser el patrón (obligatoria)' }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(300) descripcion?: string;
}

export class FiltroPropuestasDto {
  @ApiPropertyOptional({ enum: ['PENDIENTE', 'APLICADA', 'DESCARTADA', 'VENCIDA'] }) @IsOptional() @IsIn(['PENDIENTE', 'APLICADA', 'DESCARTADA', 'VENCIDA']) estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pantallaId?: string;
}

export class AplicarPropuestaDto {
  @ApiPropertyOptional({ minimum: 0, description: 'Si la propuesta trae variantes' }) @IsOptional() @IsInt() @Min(0) varianteIndice?: number;
}

export class Trabajo202Dto {
  @ApiProperty({ format: 'uuid', description: 'El TrabajoIA de la propuesta (GET /trabajos/{id})' }) id: string;
  @ApiProperty({ enum: ['EN_COLA'] }) estado: string;
  @ApiProperty({ format: 'uri' }) eventos: string;
}

export class VarianteDto {
  @ApiProperty() nombre: string;
  @ApiProperty() disposicion: string;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'JSON Patch relativo a la pantalla' }) patch: object[];
}

/** HU-1002 · Un cambio de la corrección de la alineación (IA-17), para mostrarlo antes de aplicar. */
export class CorreccionDto {
  @ApiProperty({ enum: ['nueva-pregunta', 'nueva-pantalla', 'ajustar-pregunta', 'ajustar-objetivo'] }) tipo: string;
  @ApiProperty() objetivoId: string;
  @ApiProperty({ enum: ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'] }) nivelBloom: string;
  @ApiProperty() motivo: string;
  @ApiPropertyOptional() pantallaId?: string;
  @ApiPropertyOptional() preguntaId?: string;
}

/** HU-1104 · El patrón propuesto por IA-14: lo que se aplica y, al recomendar, la alternativa. */
export class PatronOpcionDto {
  @ApiProperty({ enum: ['clasico', 'historias', 'vertical', 'mapa', 'hub', 'ramificado', 'inmersivo', 'personalizado'] }) patron: string;
  @ApiProperty() motivo: string;
}
export class PatronPropuestoDto {
  @ApiProperty({ enum: MODOS_PATRON_DTO }) modo: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: '`navegacion` propuesta; al aplicar solo se toman `patron` y `patronPersonalizado`' }) navegacion: Record<string, unknown>;
  @ApiProperty({ type: PatronOpcionDto }) recomendado: PatronOpcionDto;
  @ApiProperty({ type: PatronOpcionDto }) alternativa: PatronOpcionDto;
  @ApiProperty({ nullable: true, type: String, description: 'Lo que escribió la persona al crear' }) descripcion: string | null;
}

export class PropuestaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() tipo: string;
  @ApiProperty({ nullable: true }) pantallaId: string | null;
  @ApiProperty() titulo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'JSON Patch relativo a la pantalla (vacío si trae variantes)' }) cambios: object[];
  @ApiPropertyOptional({ type: [VarianteDto], description: 'Las 3 variantes de «Ver 3 variantes»' }) vistaPrevia?: VarianteDto[];
  @ApiPropertyOptional({ type: [CorreccionDto], description: 'HU-1002 · Los cambios de la corrección de la alineación' }) correcciones?: CorreccionDto[];
  @ApiPropertyOptional({ type: PatronPropuestoDto, description: 'HU-1104 · El patrón propuesto (tipo `patron`)' }) patron?: PatronPropuestoDto;
  @ApiProperty() versionBase: number;
  @ApiProperty({ enum: ['PENDIENTE', 'APLICADA', 'DESCARTADA', 'VENCIDA'] }) estado: string;
  @ApiProperty() costoUsd: number;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class CursoRestauradoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) proyectoId: string;
  @ApiProperty() versionEsquema: string;
  @ApiProperty() version: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) documento: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}
