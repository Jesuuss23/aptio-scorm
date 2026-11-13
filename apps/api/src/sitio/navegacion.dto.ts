import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IDIOMAS_SITIO } from '@aptio/schema/sitio-contenido';
import { ZONAS_NAVEGACION } from '@aptio/schema/sitio-navegacion';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const MENSAJE_ZONA = `zona debe ser una de: ${ZONAS_NAVEGACION.join(', ')}`;
const MENSAJE_IDIOMA = 'idioma debe ser es o en';

/** HU-1506 · Enlace del menú, columna del pie (sin padre) o enlace de una columna del pie (REQ-066). Nace oculto. */
export class EnlaceSitioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ZONAS_NAVEGACION }) zona: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'La columna del pie a la que pertenece; null en el menú y en las columnas' })
  padreId: string | null;
  @ApiProperty({ enum: IDIOMAS_SITIO, description: 'HU-1510 · Idioma del enlace; cada idioma tiene su menú y su pie' }) idioma: string;
  @ApiProperty({ description: 'Texto del enlace o título de la columna; texto plano (RN-16-7)' }) texto: string;
  @ApiProperty({ type: String, nullable: true, description: 'Ruta interna (/precios, /#testimonios) o https://; puede faltar solo en una columna del pie' })
  ruta: string | null;
  @ApiProperty({ description: 'La ruta empieza con https://: abre en otra pestaña con rel="noopener"' }) externo: boolean;
  @ApiProperty({ minimum: 0, description: 'Posición 0, 1, 2… sin huecos entre hermanos (misma zona y mismo padre)' }) orden: number;
  @ApiProperty() visible: boolean;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class ColumnaPieSitioDto extends EnlaceSitioDto {
  @ApiProperty({ type: [EnlaceSitioDto], description: 'Enlaces de la columna, visibles y ocultos, por orden' }) enlaces: EnlaceSitioDto[];
}

/** Toda la navegación, visible y oculta, ordenada. */
export class NavegacionSitioDto {
  @ApiProperty({ type: [EnlaceSitioDto] }) menu: EnlaceSitioDto[];
  @ApiProperty({ type: [ColumnaPieSitioDto] }) pie: ColumnaPieSitioDto[];
}

export class EnlaceSitioEntradaDto {
  @ApiProperty({ enum: ZONAS_NAVEGACION }) @IsIn(ZONAS_NAVEGACION, { message: MENSAJE_ZONA }) zona: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Solo en el pie: la columna donde va el enlace. Sin padre, en el pie se crea una columna' })
  @IsOptional() @IsUUID() padreId?: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es', description: 'HU-1510 · Idioma del enlace; un enlace del pie toma el de su columna' })
  @IsOptional() @IsIn(IDIOMAS_SITIO, { message: MENSAJE_IDIOMA }) idioma?: string;
  @ApiProperty({ maxLength: 60 }) @IsString() @MaxLength(500) texto: string;
  @ApiPropertyOptional({ maxLength: 300, description: 'Obligatoria salvo en una columna del pie' }) @IsOptional() @IsString() @MaxLength(1000) ruta?: string;
}

export class EnlaceSitioCambioDto {
  @ApiPropertyOptional({ maxLength: 60 }) @IsOptional() @IsString() @MaxLength(500) texto?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300, description: 'null o vacía quita la ruta (solo en una columna del pie)' })
  @IsOptional() @IsString() @MaxLength(1000) ruta?: string | null;
  @ApiPropertyOptional({ description: 'Mostrar u ocultar; el texto y la ruta no cambian' }) @IsOptional() @IsBoolean() visible?: boolean;
}

export class OrdenEnlacesDto {
  @ApiProperty({ enum: ZONAS_NAVEGACION }) @IsIn(ZONAS_NAVEGACION, { message: MENSAJE_ZONA }) zona: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'La columna del pie cuyos enlaces se ordenan; sin padre, el menú o las columnas' })
  @IsOptional() @IsUUID() padreId?: string;
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es', description: 'HU-1510 · Idioma de la navegación; cada idioma tiene su orden' })
  @IsOptional() @IsIn(IDIOMAS_SITIO, { message: MENSAJE_IDIOMA }) idioma?: string;
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los hermanos del grupo, una vez cada uno, en el orden nuevo' })
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) orden: string[];
}

/** HU-1510 · `?idioma=` en la lectura de la navegación (administración y público). */
export class ConsultaNavegacionDto {
  @ApiPropertyOptional({ enum: IDIOMAS_SITIO, default: 'es', description: 'HU-1510 · Idioma de la navegación; cada idioma tiene su orden' })
  @IsOptional() @IsIn(IDIOMAS_SITIO, { message: MENSAJE_IDIOMA }) idioma?: string;
}

/** HU-1506 · Lo que ve el público (CP-118). */
export class EnlaceNavegacionPublicoDto {
  @ApiProperty() texto: string;
  @ApiProperty() ruta: string;
  @ApiProperty({ description: 'https://: abrir en otra pestaña con rel="noopener"' }) externo: boolean;
}

export class ColumnaNavegacionPublicaDto {
  @ApiProperty() titulo: string;
  @ApiPropertyOptional() ruta?: string;
  @ApiPropertyOptional() externo?: boolean;
  @ApiProperty({ type: [EnlaceNavegacionPublicoDto] }) enlaces: EnlaceNavegacionPublicoDto[];
}

export class NavegacionPublicaDto {
  @ApiProperty({ type: [EnlaceNavegacionPublicoDto], description: 'Cabecera y menú de celular usan la misma lista' }) menu: EnlaceNavegacionPublicoDto[];
  @ApiProperty({ type: [ColumnaNavegacionPublicaDto], description: 'Columnas visibles con al menos un enlace visible' }) pie: ColumnaNavegacionPublicaDto[];
}

/** HU-1510 · La navegación publicada de un idioma, con el ajuste del selector ES · EN. */
export class NavegacionPublicadaDto extends NavegacionPublicaDto {
  @ApiProperty({ description: 'El sitio publicado muestra el selector ES · EN (Ajustes del sitio); true por defecto' }) mostrarSelectorIdioma: boolean;
}
