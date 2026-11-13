import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { TAREAS_CONEXION } from '@aptio/schema/conexiones';

export class OpcionProveedorDto {
  @ApiProperty() proveedor: string;
  @ApiProperty() nombre: string;
  @ApiPropertyOptional({ description: 'Sin ejecutor todavía: se muestra deshabilitada' }) proximamente?: boolean;
}

export class VocesConexionDto {
  @ApiPropertyOptional({ description: 'Voz en español del proveedor (nombre de Google o voice_id de ElevenLabs)', maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) es?: string;
  @ApiPropertyOptional({ description: 'Voz en inglés del proveedor', maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) en?: string;
}

/** HU-1304 · Una tarea de la lista cerrada con su conexión. Nunca lleva claves (RN-13-3). */
export class ConexionIADto {
  @ApiProperty({ enum: TAREAS_CONEXION }) tarea: string;
  @ApiProperty() nombre: string;
  @ApiProperty() proveedor: string;
  @ApiProperty() modelo: string;
  @ApiProperty({ type: [OpcionProveedorDto] }) opciones: OpcionProveedorDto[];
  @ApiProperty({ type: [String], description: 'Modelos que se pueden elegir (vacío: el proveedor no tiene lista)' }) modelos: string[];
  @ApiProperty({ description: 'El proveedor no se elige (Imagen, Boca, Transcripción)' }) fijo: boolean;
  @ApiProperty({ type: VocesConexionDto, nullable: true, description: 'Solo en voz: la voz por idioma cuando la del kit es de otro proveedor' }) voces: VocesConexionDto | null;
  @ApiProperty({ description: 'Solo informa si existe la variable de entorno con la clave' }) claveConfigurada: boolean;
  @ApiProperty({ description: 'USD estimados por SCORM' }) costoEstimadoScormUsd: number;
  @ApiProperty({ description: 'USD gastados en el mes de Lima' }) gastoMesUsd: number;
  @ApiProperty({ nullable: true, type: Number }) limiteGastoMensualUsd: number | null;
  @ApiProperty({ description: 'El gasto del mes llegó al límite: los trabajos de esta tarea se detienen (LIMITE_GASTO)' }) limiteAlcanzado: boolean;
  @ApiProperty({ description: 'false mientras se usen los valores del entorno' }) configurada: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) actualizadoEn: string | null;
}

export class ConexionesIADto {
  @ApiProperty({ description: 'Mes de Lima (AAAA-MM)' }) mes: string;
  @ApiProperty({ enum: ['simulado', 'real'] }) modo: string;
  @ApiProperty({ description: 'USD gastados en el mes en todas las tareas' }) gastoMesUsd: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Suma de los límites definidos; null si ninguna tarea tiene límite' }) limiteTotalUsd: number | null;
  @ApiProperty({ type: [ConexionIADto] }) conexiones: ConexionIADto[];
}

export class ConexionEntradaDto {
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40) proveedor?: string;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80) modelo?: string;
  @ApiPropertyOptional({ type: VocesConexionDto }) @IsOptional() @ValidateNested() @Type(() => VocesConexionDto) voces?: VocesConexionDto;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, description: 'null quita el límite' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(99_999_999) limiteGastoMensualUsd?: number | null;
}

export class PruebaProveedorDto {
  @ApiProperty() ok: boolean;
  @ApiProperty({ enum: ['simulado', 'real'] }) modo: string;
  @ApiProperty() proveedor: string;
  @ApiProperty() modelo: string;
  @ApiProperty() mensaje: string;
  @ApiProperty() latenciaMs: number;
}
