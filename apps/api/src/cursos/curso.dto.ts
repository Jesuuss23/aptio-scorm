import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Texto por idioma; lo vacío no se guarda. */
export class TextoI18nDto {
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(2000) es?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(2000) en?: string;
}

/** HU-0501 · Cambios de la revisión sobre una pantalla (título, textos por id de bloque y narración). HU-0602 · Y sus retoques. */
export class PantallaCambioDto {
  @ApiProperty({ description: 'Versión del curso leída (bloqueo optimista)' }) @IsInt() @Min(1) version: number;
  @ApiPropertyOptional({ type: TextoI18nDto }) @IsOptional() @ValidateNested() @Type(() => TextoI18nDto) titulo?: TextoI18nDto;
  @ApiPropertyOptional({ type: TextoI18nDto }) @IsOptional() @ValidateNested() @Type(() => TextoI18nDto) narracion?: TextoI18nDto;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { $ref: '#/components/schemas/TextoI18nDto' }, description: 'Clave = id del bloque de texto' })
  @IsOptional() @IsObject() textos?: Record<string, TextoI18nDto>;
  @ApiPropertyOptional({
    type: 'object', additionalProperties: { nullable: true, $ref: '#/components/schemas/AjusteElemento' },
    description: 'HU-0602 · Retoques por id de bloque (RN-06-1). Cada clave reemplaza el ajuste de ese elemento; null lo restablece. Colores solo por rol del kit (RN-06-4).',
  })
  @IsOptional() @IsObject() ajustes?: Record<string, Record<string, unknown> | null>;
  @ApiPropertyOptional({
    enum: ['idea', 'personaje', 'dato', 'lista', 'portada', 'objetivos', 'seccion', 'resumen', 'cierre'],
    description: 'HU-0605 · Otra composición de contenido (idea, personaje, dato o lista; o volver a portada, objetivos, sección, resumen o cierre) con los mismos bloques: cambia la plantilla, reinicia los ajustes y conserva los extras (RN-06-3). Los `ajustes` del mismo cambio se aplican después (Deshacer). 422 DISENO_NO_PERMITIDO en una pantalla con actividad o con otro valor.',
  })
  @IsOptional() @IsString() disposicion?: string;
  @ApiPropertyOptional({
    type: 'array', items: { $ref: '#/components/schemas/ElementoExtra' },
    description: 'HU-0606 · Elementos agregados en el editor: la lista completa de la pantalla (RN-06-1). 422 EXTRA_NO_VALIDO si un id se repite o es el de un bloque; quitar uno borra su ajuste.',
  })
  @IsOptional() @IsArray() extras?: Record<string, unknown>[];
  @ApiPropertyOptional({
    enum: ['deshacer', 'rehacer'],
    description: 'HU-0607 · Rótulo de la versión cuando el cambio viene de deshacer o rehacer en el editor (SUP-46). Sin él, la versión dice «edición».',
  })
  @IsOptional() @IsIn(['deshacer', 'rehacer']) motivo?: 'deshacer' | 'rehacer';
}

/** HU-0502 · Aprobar varias: las indicadas o, con soloSinObservaciones, todas las que no tienen observaciones abiertas. */
export class AprobacionDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) pantallaIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() soloSinObservaciones?: boolean;
}

export class CambioResultadoDto {
  @ApiProperty() version: number;
  @ApiProperty({ type: [String], description: 'HU-0503 · Lo que se regenera en cascada tras el cambio: `voz-es`, `boca` y `subtitulos-es` cuando cambia la narración en español de una pantalla que ya tenía voz. El inglés se suma en el S7.' }) regenerando: string[];
  @ApiPropertyOptional({ type: [String] }) aprobadas?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Las que no se aprobaron porque tienen observaciones abiertas' }) pendientes?: string[];
  @ApiPropertyOptional({ description: 'Estado de la pantalla después del cambio' }) estado?: string;
}

export class FiltroObservacionesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() pantallaId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)) @IsBoolean() resuelta?: boolean;
}

export class ObservacionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ nullable: true, type: String }) pantallaId: string | null;
  @ApiProperty({ enum: ['CALIDAD', 'ALINEACION', 'IDIOMA', 'ACCESIBILIDAD', 'MATERIAL_FALTANTE'] }) tipo: string;
  @ApiProperty({ enum: ['info', 'aviso', 'bloquea-entrega'] }) severidad: string;
  @ApiProperty() mensaje: string;
  @ApiProperty({ enum: ['regla', 'ia', 'usuario'] }) origen: string;
  @ApiProperty() resuelta: boolean;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class FiltroNarracionesDto {
  @ApiPropertyOptional({ enum: ['es', 'en'] }) @IsOptional() @IsIn(['es', 'en']) idioma?: 'es' | 'en';
}

/** HU-0701 · Una narración del curso: estado, duración, voz y el audio (URL firmada de 15 minutos). */
export class NarracionDto {
  @ApiProperty() pantallaId: string;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiPropertyOptional() texto?: string;
  @ApiPropertyOptional({ description: 'Duración del audio en segundos' }) duracionS?: number;
  @ApiProperty({ enum: ['tts', 'grabacion'] }) origen: string;
  @ApiPropertyOptional() voz?: string;
  @ApiProperty({ enum: ['ACTUALIZADA', 'DESACTUALIZADA', 'GENERANDO', 'ERROR'] }) estado: string;
  @ApiPropertyOptional({ format: 'uri' }) audioUrl?: string;
  @ApiPropertyOptional({ type: 'array', items: { type: 'array', items: {} }, description: "[[ms, 'A'..'X'], …]" }) bocas?: unknown[];
  @ApiPropertyOptional({ format: 'uri', description: 'HU-0801 · WebVTT de la narración (URL firmada de 15 minutos)' }) subtitulosUrl?: string;
}
