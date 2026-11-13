import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIMITES_SEO } from '@aptio/schema/sitio-seo';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** HU-1512 · Una redirección 301 del sitio público (CP-124). */
export class RedireccionSitioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '/precios-2025', description: 'Ruta interna de origen (única)' }) desde: string;
  @ApiProperty({ example: '/precios', description: 'Ruta interna de destino' }) hacia: string;
  @ApiProperty({ description: 'Solo las activas llegan al sitio, con «Publicar cambios»' }) activa: boolean;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

/** HU-1512 · Un problema de la revisión SEO (PNT-29). */
export class ProblemaSeoDto {
  @ApiProperty({ enum: ['sin-descripcion', 'titulo-largo', 'descripcion-larga', 'sin-indexar', 'redireccion-sin-destino', 'redireccion-tapada'] }) tipo: string;
  @ApiProperty({ enum: ['alta', 'media', 'baja'] }) severidad: string;
  @ApiProperty({ example: 'Falta la meta descripción' }) titulo: string;
  @ApiProperty({ example: 'Precios (/precios): los buscadores muestran el texto general del sitio.' }) detalle: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'La página que hay que corregir' }) paginaId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'La redirección que hay que corregir' }) redireccionId?: string;
}

/** HU-1512 · Sitio web › SEO (PNT-29). */
export class SeoSitioDto {
  @ApiProperty({ example: 'Disallow: /panel', description: 'Las reglas extra de robots.txt (Allow, Disallow y comentarios)' }) robotsExtra: string;
  @ApiProperty({ description: 'El robots.txt que tendrá el sitio con «Publicar cambios»: la base del sistema más las reglas extra' }) robotsVistaPrevia: string;
  @ApiProperty({ type: [RedireccionSitioDto] }) redirecciones: RedireccionSitioDto[];
  @ApiProperty({ type: [ProblemaSeoDto], description: 'De los más graves a los más leves' }) problemas: ProblemaSeoDto[];
}

export class SeoCambioDto {
  @ApiProperty({ maxLength: 12000, example: '# Panel interno\nDisallow: /panel', description: 'Una regla por línea: «Allow: /ruta», «Disallow: /ruta» o «# comentario». No se acepta Disallow: /' })
  @IsString() @MaxLength(12000) robotsExtra: string;
}

export class RedireccionEntradaDto {
  @ApiProperty({ example: '/precios-2025', maxLength: LIMITES_SEO.ruta }) @IsString() @MaxLength(400) desde: string;
  @ApiProperty({ example: '/precios', maxLength: LIMITES_SEO.ruta }) @IsString() @MaxLength(400) hacia: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() activa?: boolean;
}

export class RedireccionCambioDto {
  @ApiPropertyOptional({ example: '/precios-2025' }) @IsOptional() @IsString() @MaxLength(400) desde?: string;
  @ApiPropertyOptional({ example: '/precios' }) @IsOptional() @IsString() @MaxLength(400) hacia?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}
