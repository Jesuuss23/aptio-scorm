import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COLECCIONES } from '@aptio/schema/sitio-contenido';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

const MENSAJE_COLECCION = `coleccion debe ser una de: ${COLECCIONES.join(', ')}`;

/** HU-1504 · Elemento de contenido del sitio (REQ-066). Nace oculto (RN-16-2, CP-115). */
export class ElementoSitioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: COLECCIONES }) coleccion: string;
  @ApiProperty({ minimum: 0, description: 'Posición 0, 1, 2… sin huecos dentro de la colección' }) orden: number;
  @ApiProperty() visible: boolean;
  @ApiProperty({ description: 'HU-1505 · Dato inventado: si está visible, bloquea publicar en producción (RN-16-3)' }) ficticio: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Campos de la colección (`@aptio/schema/sitio-contenido`)' })
  datos: Record<string, string | number>;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class ConsultaElementosDto {
  @ApiProperty({ enum: COLECCIONES }) @IsIn(COLECCIONES, { message: MENSAJE_COLECCION }) coleccion: string;
}

export class ElementoSitioEntradaDto {
  @ApiProperty({ enum: COLECCIONES }) @IsIn(COLECCIONES, { message: MENSAJE_COLECCION }) coleccion: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Solo texto plano (RN-16-7)' }) @IsObject() datos: Record<string, unknown>;
  @ApiPropertyOptional({ default: false, description: 'HU-1505 · Marca el dato como inventado' }) @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class ElementoSitioCambioDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Campos a cambiar; un opcional vacío se quita' })
  @IsOptional() @IsObject() datos?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'Mostrar u ocultar; los datos no cambian' }) @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional({ description: 'HU-1505 · Marcar o desmarcar como dato inventado' }) @IsOptional() @IsBoolean() ficticio?: boolean;
}

/** HU-1505 · Ficticios visibles del sitio y el entorno (RN-16-3). */
export class FicticiosSitioDto {
  @ApiProperty({ enum: ['produccion', 'pruebas'], description: 'De `SITIO_ENTORNO`; sin definir, produccion' }) entorno: string;
  @ApiProperty({ type: [ElementoSitioDto], description: 'Elementos con ficticio y visible, por colección y orden' }) ficticios: ElementoSitioDto[];
}

export class FicticiosOcultadosDto extends FicticiosSitioDto {
  @ApiProperty({ description: 'Cuántos se ocultaron' }) ocultados: number;
}

export class OrdenElementosDto {
  @ApiProperty({ enum: COLECCIONES }) @IsIn(COLECCIONES, { message: MENSAJE_COLECCION }) coleccion: string;
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los elementos de la colección, una vez cada uno, en el orden nuevo' })
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) orden: string[];
}
