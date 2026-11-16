import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCIONES_POPUP, DISPARADORES_POPUP, EVENTOS_POPUP, IDIOMAS_POPUP, TIPOS_POPUP } from '@aptio/schema/popups';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

/** HU-1603 · Un popup como lo ve el panel (REQ-076, PNT-31). */
export class PopupDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Guía de microaprendizaje' }) nombre: string;
  @ApiProperty({ enum: TIPOS_POPUP }) tipo: string;
  @ApiProperty({ enum: IDIOMAS_POPUP }) idioma: string;
  @ApiProperty({ enum: DISPARADORES_POPUP }) disparador: string;
  @ApiProperty({ type: Number, nullable: true, description: 'Segundos (tiempo) o porcentaje (desplazamiento); null en los demás' }) valorDisparador: number | null;
  @ApiProperty({ type: [String], example: ['/', '/blog/*'], description: 'Rutas exactas, con comodín final (`/blog/*`) o `*` para todo el sitio' }) paginas: string[];
  @ApiProperty() titulo: string;
  @ApiProperty() texto: string;
  @ApiProperty() boton: string;
  @ApiProperty({ enum: ACCIONES_POPUP }) accion: string;
  @ApiProperty({ type: String, nullable: true, example: '/demo', description: 'Solo en enlace_interno' }) enlaceDestino: string | null;
  @ApiProperty({ minimum: 7, maximum: 365, description: 'RN-17-3: una vez por visitante cada N días (mínimo 7)' }) frecuenciaDias: number;
  @ApiProperty({ description: 'Activo: el sitio lo muestra' }) visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ description: 'Dato inventado: nunca se muestra en producción' }) ficticio: boolean;
  @ApiProperty() impresiones: number;
  @ApiProperty() conversiones: number;
  @ApiProperty({ type: Number, nullable: true, example: 6.8, description: 'Conversiones sobre impresiones, en %' }) tasaConversion: number | null;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class PopupsDto {
  @ApiProperty({ type: [PopupDto] }) popups: PopupDto[];
}

/** Alta (todos los campos, con los de por defecto de un popup nuevo) o cambio (solo los que cambian). */
export class PopupEntradaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional({ enum: TIPOS_POPUP }) @IsOptional() @IsString() tipo?: string;
  @ApiPropertyOptional({ enum: IDIOMAS_POPUP }) @IsOptional() @IsString() idioma?: string;
  @ApiPropertyOptional({ enum: DISPARADORES_POPUP, description: 'La barra solo admite al_cargar' }) @IsOptional() @IsString() disparador?: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() valorDisparador?: number | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) paginas?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsString() titulo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() texto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() boton?: string;
  @ApiPropertyOptional({ enum: ACCIONES_POPUP }) @IsOptional() @IsString() accion?: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ruta interna que empieza con `/` (sin `//` ni esquema)' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() enlaceDestino?: string | null;
  @ApiPropertyOptional({ minimum: 7, maximum: 365 }) @IsOptional() @IsInt() frecuenciaDias?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class OrdenPopupsDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los popups, en el orden nuevo' }) @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) ids: string[];
}

/** `POST /s/_popup`: una impresión o la conversión de un popup con enlace. No lleva datos personales. */
export class EventoPopupDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') popupId: string;
  @ApiProperty({ enum: EVENTOS_POPUP, description: 'conversion solo cuenta en los popups con enlace; los de correo cuentan al llegar el lead' }) @IsIn(EVENTOS_POPUP) evento: string;
}
