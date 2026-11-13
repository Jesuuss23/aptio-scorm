import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FRECUENCIAS_BLOG, LIMITES_BLOG } from '@aptio/schema/sitio-blog';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const opcional = (_o: object, v: unknown) => v !== null && v !== undefined;

/** HU-1511 · Una categoría de WordPress en la copia (PNT-28). */
export class CategoriaBlogDto {
  @ApiProperty({ example: 4, description: 'id de WordPress' }) id: number;
  @ApiProperty({ example: 'Guías' }) nombre: string;
  @ApiProperty({ example: 'guias' }) slug: string;
  @ApiProperty({ minimum: 0, description: 'Orden de los filtros de la sección Blog' }) orden: number;
  @ApiProperty({ description: 'Oculta: no sale como filtro y sus artículos solo salen si tienen otra categoría visible (CP-155)' }) visible: boolean;
  @ApiProperty({ description: 'Artículos de la copia en esta categoría, visibles y ocultos' }) articulos: number;
}

/** HU-1511 · Un artículo de la copia: solo publicados y sin clave (CP-154). */
export class ArticuloBlogDto {
  @ApiProperty({ example: 361, description: 'id de WordPress' }) id: number;
  @ApiProperty() titulo: string;
  @ApiProperty() extracto: string;
  @ApiProperty({ type: [Number], description: 'ids de sus categorías' }) categorias: number[];
  @ApiProperty({ type: String, nullable: true }) autor: string | null;
  @ApiProperty({ format: 'date-time' }) fecha: string;
  @ApiProperty({ example: 'https://blog.aptioscorm.com/preparar-un-manual/' }) enlace: string;
  @ApiProperty({ description: '«Editar en WordPress»: el administrador de WordPress de este artículo' }) editar: string;
  @ApiProperty({ type: String, nullable: true, example: '/s/_blog/0123456789abcdef.jpg', description: 'La imagen destacada copiada (hasta 800 px de ancho)' }) imagen: string | null;
  @ApiProperty() visible: boolean;
}

/** HU-1511 · Sitio web › Blog (PNT-28): la conexión, el estado de la última sincronización y la copia. */
export class BlogSitioDto {
  @ApiProperty({ type: String, nullable: true, example: 'https://blog.aptioscorm.com', description: 'null = sin conectar' }) url: string | null;
  @ApiProperty({ enum: FRECUENCIAS_BLOG, default: 15, description: 'Cada cuántos minutos se lee WordPress' }) frecuenciaMin: number;
  @ApiProperty({ minimum: LIMITES_BLOG.porPaginaMin, maximum: LIMITES_BLOG.porPaginaMax, default: 6, description: 'Artículos por filtro en la sección' }) porPagina: number;
  @ApiProperty({ default: true }) mostrarImagen: boolean;
  @ApiProperty({ default: true }) mostrarAutor: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'La última sincronización que terminó bien' }) sincronizadoEn: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'El último intento, bien o mal' }) intentoEn: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'CP-156 · El error del último intento; el sitio sigue con la copia anterior' }) error: string | null;
  @ApiProperty({ type: [CategoriaBlogDto], description: 'Por orden' }) categorias: CategoriaBlogDto[];
  @ApiProperty({ type: [ArticuloBlogDto], description: 'Del más nuevo al más viejo' }) articulos: ArticuloBlogDto[];
}

export class BlogCambioDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'https:// con dominio público, sin usuario, clave ni parámetros; vacío o null desconecta' })
  @IsOptional() @ValidateIf(opcional) @IsString() url?: string | null;
  @ApiPropertyOptional({ enum: FRECUENCIAS_BLOG }) @IsOptional() @IsInt() frecuenciaMin?: number;
  @ApiPropertyOptional({ minimum: LIMITES_BLOG.porPaginaMin, maximum: LIMITES_BLOG.porPaginaMax }) @IsOptional() @IsInt() porPagina?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mostrarImagen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mostrarAutor?: boolean;
}

export class OrdenCategoriasBlogDto {
  @ApiProperty({ type: [Number], description: 'Todos los ids de las categorías, en el orden nuevo' })
  @IsArray() @ArrayMaxSize(LIMITES_BLOG.categorias) @IsInt({ each: true }) orden: number[];
}

export class VisibilidadBlogDto {
  @ApiProperty() @IsBoolean() visible: boolean;
}

export class ConsultaBlogPublicoDto {
  @ApiPropertyOptional({ example: 'guias', description: 'El slug de una categoría visible; sin él, «Todas»' })
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,100}$/, { message: 'categoria es el slug de una categoría' }) categoria?: string;
}

class ImagenBlogPublicaDto {
  @ApiProperty({ example: '0123456789abcdef.jpg', description: 'Se sirve en /s/_blog/{archivo}' }) archivo: string;
  @ApiProperty({ type: Number, nullable: true }) ancho: number | null;
  @ApiProperty({ type: Number, nullable: true }) alto: number | null;
}

class CategoriaBlogPublicaDto {
  @ApiProperty({ example: 'guias' }) slug: string;
  @ApiProperty({ example: 'Guías' }) nombre: string;
  @ApiProperty({ description: 'Artículos visibles en esta categoría (CP-123)' }) cantidad: number;
}

class ArticuloBlogPublicoDto {
  @ApiProperty() id: number;
  @ApiProperty() titulo: string;
  @ApiProperty() extracto: string;
  @ApiProperty({ type: [String], description: 'Slugs de sus categorías visibles' }) categorias: string[];
  @ApiProperty({ format: 'date-time' }) fecha: string;
  @ApiProperty() enlace: string;
  @ApiPropertyOptional({ description: 'Si «Mostrar autor» está activo' }) autor?: string;
  @ApiPropertyOptional({ type: ImagenBlogPublicaDto, description: 'Si «Mostrar imagen» está activo y el artículo tiene una' }) imagen?: ImagenBlogPublicaDto;
}

/** HU-1511 · GET /publico/blog: lo que ve el público (CP-123, CP-155). */
export class BlogPublicoDto {
  @ApiProperty({ type: String, nullable: true, description: 'El WordPress conectado («Ver todos los artículos en el blog»)' }) url: string | null;
  @ApiProperty() porPagina: number;
  @ApiProperty({ type: [CategoriaBlogPublicaDto], description: 'Los filtros: categorías visibles con al menos un artículo visible, en su orden' }) categorias: CategoriaBlogPublicaDto[];
  @ApiProperty({ type: [ArticuloBlogPublicoDto], description: 'Los artículos del filtro pedido (o de «Todas»), del más nuevo al más viejo' }) articulos: ArticuloBlogPublicoDto[];
}
