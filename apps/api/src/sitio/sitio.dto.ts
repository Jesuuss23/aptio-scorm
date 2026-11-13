import { ApiProperty } from '@nestjs/swagger';

/**
 * HU-1501 · Página del sitio comercial (M16). La tabla y su ciclo (borrador, programada, publicada) llegan con la
 * HU-1502; hasta entonces la lista está vacía (SUP-165).
 */
export class PaginaSitioDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: '/precios' }) ruta: string;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ enum: ['BORRADOR', 'PROGRAMADA', 'PUBLICADA'] }) estado: string;
}
