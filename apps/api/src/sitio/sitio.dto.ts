import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RUTA_SITIO } from '@aptio/db';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const IDIOMAS_SITIO = ['es', 'en'] as const;
export const ESTADOS_PAGINA = ['BORRADOR', 'PROGRAMADA', 'PUBLICADA'] as const;
export const ACCIONES_PAGINA = ['borrador', 'programar', 'publicar'] as const;
export type AccionPagina = (typeof ACCIONES_PAGINA)[number];

/** Fecha y hora ISO 8601 con zona explícita (la web manda la hora de Lima con `-05:00`). */
const FECHA_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const MENSAJE_RUTA = 'La ruta empieza con / y solo lleva minúsculas, números y guiones (por ejemplo /precios o /sectores/mineria)';

/** HU-1502 · Página del sitio comercial (M16) con su estado (RN-16-6). */
export class PaginaSitioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '/precios' }) ruta: string;
  @ApiProperty({ enum: IDIOMAS_SITIO }) idioma: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ enum: ESTADOS_PAGINA }) estado: string;
  @ApiProperty({ format: 'date-time', nullable: true, description: 'Cuándo se publica sola (solo PROGRAMADA)' }) publicarEn: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, description: 'Última vez que pasó a PUBLICADA' }) publicadaEn: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

class CamposAccion {
  @ApiPropertyOptional({ enum: ACCIONES_PAGINA, description: 'borrador (limpia publicarEn), programar (exige publicarEn en el futuro) o publicar (ahora)' })
  @IsOptional() @IsIn(ACCIONES_PAGINA, { message: 'accion debe ser borrador, programar o publicar' }) accion?: AccionPagina;
  @ApiPropertyOptional({ format: 'date-time', example: '2026-11-20T09:00:00-05:00', description: 'Solo con accion=programar; con zona horaria' })
  @IsOptional() @IsString() @Matches(FECHA_CON_ZONA, { message: 'publicarEn debe ser una fecha y hora ISO 8601 con zona, por ejemplo 2026-11-20T09:00:00-05:00' }) publicarEn?: string;
}

export class PaginaSitioEntradaDto extends CamposAccion {
  @ApiProperty({ example: '/precios', pattern: RUTA_SITIO.source })
  @IsString() @MaxLength(200) @Matches(RUTA_SITIO, { message: MENSAJE_RUTA }) ruta: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es' })
  @IsOptional() @IsIn(IDIOMAS_SITIO, { message: 'idioma debe ser es o en' }) idioma?: (typeof IDIOMAS_SITIO)[number];
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString() @MinLength(1) @MaxLength(120) titulo: string;
}

export class PaginaSitioCambioDto extends CamposAccion {
  @ApiPropertyOptional({ example: '/precios', pattern: RUTA_SITIO.source, description: 'No se cambia en una página PUBLICADA (422 RUTA_PUBLICADA)' })
  @IsOptional() @IsString() @MaxLength(200) @Matches(RUTA_SITIO, { message: MENSAJE_RUTA }) ruta?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) titulo?: string;
}

/** HU-1502 · Lo que ve el sitio público de una página publicada. */
export class PaginaPublicaDto {
  @ApiProperty() ruta: string;
  @ApiProperty({ enum: IDIOMAS_SITIO }) idioma: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ format: 'date-time' }) publicadaEn: string;
}

export class ConsultaPaginaPublicaDto {
  @ApiProperty({ example: '/precios' }) @IsString() @MaxLength(200) ruta: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es' }) @IsOptional() @IsString() @MaxLength(5) idioma?: string;
}
