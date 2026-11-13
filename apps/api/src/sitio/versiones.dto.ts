import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORIGENES_VERSION } from '@aptio/schema/sitio-versiones';
import { NavegacionPublicaDto } from './navegacion.dto.js';
import { BloquePublicoDto } from './sitio.dto.js';

class AutorVersionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
}

/** HU-1507 · Versión publicada del sitio (RN-16-5). Inmutable. */
export class VersionSitioDto {
  @ApiProperty({ minimum: 1, description: 'La mayor es la que ve el sitio' }) numero: number;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ enum: ['produccion', 'pruebas'] }) entorno: string;
  @ApiProperty({ enum: ORIGENES_VERSION, description: 'publicacion («Publicar cambios»), pagina (publicar o retirar una página), programada (worker) o restauracion' }) origen: string;
  @ApiProperty({ type: Number, nullable: true, description: 'Con origen restauracion: la versión restaurada' }) restauradaDe: number | null;
  @ApiProperty({ type: AutorVersionDto, nullable: true, description: 'null si la publicó la plataforma (programada)' }) publicadoPor: AutorVersionDto | null;
  @ApiProperty({ minimum: 0, description: 'Páginas publicadas en la versión' }) paginas: number;
}

export class VersionPublicadaDto extends VersionSitioDto {
  @ApiPropertyOptional({ description: 'Solo en pruebas: cuántos datos ficticios visibles se publicaron (CP-117)' }) avisoFicticios?: number;
}

export class VersionesSitioDto {
  @ApiProperty({ enum: ['produccion', 'pruebas'] }) entorno: string;
  @ApiProperty({ type: Number, nullable: true, description: 'La versión que ve el sitio; null si aún no hay ninguna' }) actual: number | null;
  @ApiProperty({ description: 'El panel tiene cambios que el sitio todavía no muestra' }) pendientes: boolean;
  @ApiProperty({ minimum: 0 }) total: number;
  @ApiProperty({ type: [VersionSitioDto], description: 'Las 50 más recientes, de la mayor a la menor' }) versiones: VersionSitioDto[];
}

class PaginaVistaPreviaDto {
  @ApiProperty() ruta: string;
  @ApiProperty() idioma: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publicadaEn: string | null;
  @ApiProperty({ type: [BloquePublicoDto], description: 'Bloques visibles en orden, con sus elementos visibles (los ficticios, marcados)' }) bloques: BloquePublicoDto[];
}

/** HU-1507 · Vista previa de una página con lo que hay en el panel, publicado o no. */
export class VistaPreviaPaginaDto {
  @ApiProperty({ enum: ['BORRADOR', 'PROGRAMADA', 'PUBLICADA'] }) estado: string;
  @ApiProperty({ enum: ['produccion', 'pruebas'] }) entorno: string;
  @ApiProperty({ type: PaginaVistaPreviaDto }) pagina: PaginaVistaPreviaDto;
  @ApiProperty({ type: NavegacionPublicaDto }) navegacion: NavegacionPublicaDto;
}
