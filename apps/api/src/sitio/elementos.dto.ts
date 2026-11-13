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
}

export class ElementoSitioCambioDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Campos a cambiar; un opcional vacío se quita' })
  @IsOptional() @IsObject() datos?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'Mostrar u ocultar; los datos no cambian' }) @IsOptional() @IsBoolean() visible?: boolean;
}

export class OrdenElementosDto {
  @ApiProperty({ enum: COLECCIONES }) @IsIn(COLECCIONES, { message: MENSAJE_COLECCION }) coleccion: string;
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los elementos de la colección, una vez cada uno, en el orden nuevo' })
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) orden: string[];
}
