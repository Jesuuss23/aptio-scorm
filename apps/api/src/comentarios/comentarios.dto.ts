import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Largo máximo de un comentario (SUP de HU-0506). */
export const MAX_COMENTARIO = 1000;

export class ComentarioEntradaDto {
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) pantallaId: string;
  @ApiProperty({ minLength: 1, maxLength: MAX_COMENTARIO, description: 'Texto plano; se guarda sin los espacios de los extremos' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1, { message: 'Escribe el comentario' }) @MaxLength(MAX_COMENTARIO, { message: `El comentario admite hasta ${MAX_COMENTARIO} caracteres` })
  // Texto plano: sin caracteres de control, salvo saltos de línea y tabulaciones.
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, { message: 'El comentario solo admite texto plano' })
  texto: string;
}

export class ResolverComentarioDto {
  @ApiProperty({ description: 'true resuelve; false reabre' }) @IsBoolean() resuelto: boolean;
}

export class AutorComentarioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ description: 'REVISOR_CLIENTE se muestra como «Cliente»' }) rol: string;
}

export class ComentarioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) cursoId: string;
  @ApiProperty() pantallaId: string;
  @ApiProperty({ type: AutorComentarioDto }) autor: AutorComentarioDto;
  @ApiProperty() texto: string;
  @ApiProperty() resuelto: boolean;
  @ApiProperty({ nullable: true, type: String }) resueltoPor: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resueltoEn: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}
