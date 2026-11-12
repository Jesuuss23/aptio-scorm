import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, Min } from 'class-validator';

/** Los mismos valores que `navegacion` en el esquema del curso (curso-v0.schema.json). */
export const PATRONES = ['clasico', 'historias', 'vertical', 'mapa', 'hub', 'ramificado', 'inmersivo', 'personalizado'] as const;
export const MODOS = ['libre', 'condiciones', 'secuencial'] as const;
export const HABILITA = ['siempre', 'narracion', 'actividad'] as const;
export const REANUDAR = ['preguntar', 'automatica', 'no'] as const;
export const ELEMENTOS = ['temario', 'progreso', 'contador', 'botones', 'glosario', 'recursos', 'ayuda', 'accesibilidad', 'puntos', 'idioma'] as const;

class CamposNavegacion {
  @ApiPropertyOptional({ enum: PATRONES }) @IsOptional() @IsIn(PATRONES) patron?: string;
  @ApiPropertyOptional({ description: 'Solo con patrón personalizado; lo valida el esquema del curso (HU-1104)', type: Object })
  @IsOptional() @IsObject() patronPersonalizado?: Record<string, unknown>;
  @ApiPropertyOptional({ enum: MODOS }) @IsOptional() @IsIn(MODOS) modo?: string;
  @ApiPropertyOptional({ enum: HABILITA }) @IsOptional() @IsIn(HABILITA) siguienteSeHabilita?: string;
  @ApiPropertyOptional({ enum: REANUDAR, description: 'Al volver al curso' }) @IsOptional() @IsIn(REANUDAR) reanudar?: string;
  @ApiPropertyOptional({ enum: ELEMENTOS, isArray: true }) @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(ELEMENTOS.length) @IsIn(ELEMENTOS, { each: true }) mostrar?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() objetivosAlInicio?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() atajosTeclado?: boolean;
}

/** HU-1103 · Patrón y reglas del curso, con la versión leída y el patrón preferido del cliente (kit de marca). */
export class NavegacionDto extends CamposNavegacion {
  @ApiProperty({ description: 'Versión del curso leída (para el PUT)' }) version: number;
  @ApiProperty({ description: 'El patrón del curso es el preferido del cliente' }) patronPreferidoDelCliente: boolean;
  @ApiProperty({ enum: PATRONES, nullable: true, type: String, description: 'Preferido del cliente guardado en su kit de marca' }) patronPreferido: string | null;
  @ApiProperty({ description: 'El cliente tiene kit de marca (sin kit no se puede guardar el preferido)' }) hayKit: boolean;
}

/** Cambia los campos que vengan (los demás quedan); crea una versión del curso con motivo «navegación». */
export class NavegacionCambioDto extends CamposNavegacion {
  @ApiProperty({ description: 'Versión del curso leída; si otra persona guardó antes, 409 VERSION_CAMBIO' }) @IsInt() @Min(1) version: number;
  @ApiPropertyOptional({ description: 'true guarda el patrón como preferido en el kit de marca del cliente' })
  @IsOptional() @IsBoolean() patronPreferidoDelCliente?: boolean;
}
