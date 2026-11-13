import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RUTA_SITIO } from '@aptio/db';
import { TIPOS_BLOQUE } from '@aptio/schema/sitio-bloques';
import { TIPOS_PAGINA } from '@aptio/schema/sitio-sectores';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';

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
  @ApiProperty({ enum: TIPOS_PAGINA, description: 'HU-1514 · general o sector (landing por sector)' }) tipo: string;
  @ApiProperty({ nullable: true, description: 'HU-1514 · Nombre del sector de una landing' }) sector: string | null;
  @ApiProperty({ type: () => PortadaSectorDto, nullable: true, description: 'HU-1514 · Portada propia de una landing' }) portada: PortadaSectorDto | null;
  @ApiProperty({ nullable: true, description: 'HU-1514 · Meta título de una landing (RN-16-9)' }) metaTitulo: string | null;
  @ApiProperty({ nullable: true, description: 'HU-1514 · Categoría con que empieza filtrada la sección Blog (CP-159)' }) blogCategoriaInicial: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
  @ApiPropertyOptional({ description: 'HU-1505 · Solo al publicar en pruebas: cuántos datos ficticios visibles hay (CP-117)' }) avisoFicticios?: number;
  @ApiPropertyOptional({ description: 'HU-1507 · Si el cambio publicó o retiró la página: la versión del sitio que creó' }) version?: number;
}

/** HU-1514 · Portada de una landing por sector. */
export class PortadaSectorDto {
  @ApiProperty({ maxLength: 120 }) titulo: string;
  @ApiProperty({ maxLength: 300 }) texto: string;
}

class PortadaSectorCambioDto {
  @ApiPropertyOptional({ maxLength: 120, nullable: true }) @IsOptional() @IsString() @MaxLength(400) titulo?: string | null;
  @ApiPropertyOptional({ maxLength: 300, nullable: true }) @IsOptional() @IsString() @MaxLength(1000) texto?: string | null;
}

/** HU-1514 · Campos de una landing por sector; el detalle lo valida `aplicarCambiosSector`. */
class CamposSector {
  @ApiPropertyOptional({ maxLength: 60, example: 'Minería y energía', description: 'Nombre del sector (no «General»)' })
  @IsOptional() @IsString() @MaxLength(200) sector?: string;
  @ApiPropertyOptional({ type: PortadaSectorCambioDto, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @ValidateNested() @Type(() => PortadaSectorCambioDto) portada?: PortadaSectorCambioDto | null;
  @ApiPropertyOptional({ maxLength: 70, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(300) metaTitulo?: string | null;
  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) blogCategoriaInicial?: string | null;
}

class CamposAccion extends CamposSector {
  @ApiPropertyOptional({ enum: ACCIONES_PAGINA, description: 'borrador (limpia publicarEn), programar (exige publicarEn en el futuro) o publicar (ahora)' })
  @IsOptional() @IsIn(ACCIONES_PAGINA, { message: 'accion debe ser borrador, programar o publicar' }) accion?: AccionPagina;
  @ApiPropertyOptional({ format: 'date-time', example: '2026-11-20T09:00:00-05:00', description: 'Solo con accion=programar; con zona horaria' })
  @IsOptional() @IsString() @Matches(FECHA_CON_ZONA, { message: 'publicarEn debe ser una fecha y hora ISO 8601 con zona, por ejemplo 2026-11-20T09:00:00-05:00' }) publicarEn?: string;
}

export class PaginaSitioEntradaDto extends CamposAccion {
  @ApiPropertyOptional({ enum: TIPOS_PAGINA, default: 'general', description: 'HU-1514 · sector crea una landing en borrador con la plantilla de bloques' })
  @IsOptional() @IsIn(TIPOS_PAGINA, { message: 'tipo debe ser general o sector' }) tipo?: (typeof TIPOS_PAGINA)[number];
  @ApiProperty({ example: '/precios', pattern: RUTA_SITIO.source, description: 'En una landing es opcional: por defecto /sectores/{sector}' })
  @ValidateIf((o: PaginaSitioEntradaDto) => o.tipo !== 'sector' || o.ruta !== undefined)
  @IsString() @MaxLength(200) @Matches(RUTA_SITIO, { message: MENSAJE_RUTA }) ruta: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es' })
  @IsOptional() @IsIn(IDIOMAS_SITIO, { message: 'idioma debe ser es o en' }) idioma?: (typeof IDIOMAS_SITIO)[number];
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'En una landing es opcional: por defecto el sector' })
  @ValidateIf((o: PaginaSitioEntradaDto) => o.tipo !== 'sector' || o.titulo !== undefined)
  @IsString() @MinLength(1) @MaxLength(120) titulo: string;
}

export class PaginaSitioCambioDto extends CamposAccion {
  @ApiPropertyOptional({ example: '/precios', pattern: RUTA_SITIO.source, description: 'No se cambia en una página PUBLICADA (422 RUTA_PUBLICADA)' })
  @IsOptional() @IsString() @MaxLength(200) @Matches(RUTA_SITIO, { message: MENSAJE_RUTA }) ruta?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) titulo?: string;
}

/** HU-1503 · Bloque de una página (REQ-066). Nace oculto (RN-16-2). */
export class BloqueSitioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) paginaId: string;
  @ApiProperty({ enum: TIPOS_BLOQUE }) tipo: string;
  @ApiProperty({ minimum: 0, description: 'Posición 0, 1, 2… sin huecos' }) orden: number;
  @ApiProperty() visible: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true, description: 'Datos propios del bloque; ocultarlo no los borra (CP-112)' })
  ajustes: Record<string, unknown> | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class BloqueSitioEntradaDto {
  @ApiProperty({ enum: TIPOS_BLOQUE, description: 'Catálogo cerrado; va al final y oculto' })
  @IsIn(TIPOS_BLOQUE, { message: 'tipo no está en el catálogo de bloques' }) tipo: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Datos del bloque (hasta 20 000 caracteres en JSON)' })
  @IsOptional() @IsObject() ajustes?: Record<string, unknown>;
}

export class OrdenBloquesDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los bloques de la página, una vez cada uno, en el orden nuevo' })
  @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) orden: string[];
}

export class BloqueSitioCambioDto {
  @ApiProperty({ description: 'Mostrar u ocultar; los ajustes no cambian (CP-112)' }) @IsBoolean() visible: boolean;
}

/** HU-1504 · Elemento de contenido tal como lo ve el sitio público. */
export class ElementoPublicoDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) datos: Record<string, string | number>;
  @ApiPropertyOptional({ description: 'HU-1505 · Solo en pruebas: el dato es inventado (en producción nunca sale)' }) ficticio?: boolean;
}

/** HU-1503 · Bloque tal como lo ve el sitio público: solo visibles y en su orden. */
export class BloquePublicoDto {
  @ApiProperty({ enum: TIPOS_BLOQUE }) tipo: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) ajustes: Record<string, unknown> | null;
  @ApiPropertyOptional({ type: [ElementoPublicoDto], description: 'HU-1504 · Solo en bloques con colección: sus elementos visibles, en orden (CP-114)' })
  elementos?: ElementoPublicoDto[];
}

/** HU-1502 · Lo que ve el sitio público de una página publicada. */
export class PaginaPublicaDto {
  @ApiProperty() ruta: string;
  @ApiProperty({ enum: IDIOMAS_SITIO }) idioma: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ format: 'date-time' }) publicadaEn: string;
  @ApiProperty({ type: [BloquePublicoDto], description: 'HU-1503 · Solo los visibles, en orden (CP-112, CP-113)' }) bloques: BloquePublicoDto[];
}

export class ConsultaPaginaPublicaDto {
  @ApiProperty({ example: '/precios' }) @IsString() @MaxLength(200) ruta: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es' }) @IsOptional() @IsString() @MaxLength(5) idioma?: string;
}
