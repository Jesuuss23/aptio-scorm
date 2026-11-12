import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const ESTADOS_TRADUCCION = ['PENDIENTE', 'TRADUCIDA_IA', 'REVISADA', 'DESBORDE'] as const;

/** HU-0802 · Un texto del curso con su inglés y su estado (PNT-11). */
export class TraduccionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'JSON Pointer al texto { es, en } dentro del documento' }) ruta: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Pantalla del texto; null en los textos del curso (objetivos, recursos)' }) pantallaId: string | null;
  @ApiProperty() es: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'El inglés actual; si el español cambió, queda el anterior como referencia' }) en: string | null;
  @ApiProperty({ enum: ESTADOS_TRADUCCION }) estado: string;
}

export class FiltroTraduccionesDto {
  @ApiPropertyOptional({ enum: ESTADOS_TRADUCCION }) @IsOptional() @IsIn(ESTADOS_TRADUCCION) estado?: string;
}

/** Editar el inglés (queda Revisado: lo escribió una persona) o marcar como Revisado. */
export class TraduccionCambioDto {
  @ApiPropertyOptional({ maxLength: 4000 }) @IsOptional() @Transform(recortar) @IsString() @MinLength(1) @MaxLength(4000) en?: string;
  @ApiPropertyOptional({ enum: ['REVISADA'] }) @IsOptional() @IsIn(['REVISADA']) estado?: string;
}
