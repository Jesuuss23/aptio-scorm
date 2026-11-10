import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export const TIPOS = ['IMAGEN', 'SVG', 'AUDIO', 'VIDEO', 'DOCUMENTO', 'FUENTE', 'SUBTITULO', 'PAQUETE'] as const;
export const ORIGENES = ['BIBLIOTECA', 'GENERADO', 'SUBIDO', 'CLIENTE'] as const;
/** Desde la web solo se sube material propio del equipo o del cliente. */
export const ORIGENES_SUBIDA = ['SUBIDO', 'CLIENTE'] as const;

export class SubidaSolicitudDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MinLength(1) @MaxLength(255) nombre: string;
  @ApiProperty({ example: 'application/pdf' }) @IsString() @MaxLength(127) mime: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) bytes: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() clienteId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() proyectoId?: string;
  @ApiPropertyOptional({ enum: ORIGENES_SUBIDA, default: 'SUBIDO', description: 'CLIENTE: documento del cliente, cifrado y con borrado programado (ADR-009)' })
  @IsOptional() @IsIn(ORIGENES_SUBIDA) origen?: (typeof ORIGENES_SUBIDA)[number];
}

export class SubidaUrlDto {
  @ApiProperty({ format: 'uuid' }) subidaId: string;
  @ApiProperty({ format: 'uri', description: 'PUT firmado, vigente 15 minutos' }) url: string;
  @ApiProperty({ description: 'Cabeceras que el PUT debe enviar tal cual; sin ellas S3 rechaza la subida' }) cabeceras: Record<string, string>;
  @ApiProperty() expira: string;
}

export class RecursoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: TIPOS }) tipo: string;
  @ApiProperty({ enum: ORIGENES }) origen: string;
  @ApiProperty() nombre: string;
  @ApiProperty() mime: string;
  @ApiProperty() bytes: number;
  @ApiProperty({ description: 'sha256 del contenido' }) hash: string;
  @ApiProperty({ format: 'uuid', nullable: true }) clienteId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) proyectoId: string | null;
  @ApiProperty({ nullable: true, description: 'Borrado programado de un documento del cliente' }) eliminarEn: string | null;
  @ApiProperty() creadoEn: string;
  @ApiPropertyOptional({ format: 'uri', description: 'URL firmada de 15 minutos' }) url?: string;
}

export class FiltroRecursosDto {
  @IsOptional() @IsUUID() clienteId?: string;
  @IsOptional() @IsUUID() proyectoId?: string;
  @IsOptional() @IsIn(TIPOS) tipo?: (typeof TIPOS)[number];
  @IsOptional() @IsIn(ORIGENES) origen?: (typeof ORIGENES)[number];
}
