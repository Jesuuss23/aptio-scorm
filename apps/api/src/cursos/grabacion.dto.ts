import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** HU-0704 · Usar la grabación del cliente como narración en español de la pantalla (RN-07-4). */
export class GrabacionEntradaDto {
  @ApiProperty({ format: 'uuid', description: 'Material de audio del proyecto, ya transcrito' }) @IsUUID() materialId: string;
  @ApiProperty({ description: 'El cliente autorizó usar esta grabación. Sin `true`, 422 AUTORIZACION_REQUERIDA.' }) @IsOptional() @IsBoolean() autorizado?: boolean;
  @ApiPropertyOptional({ description: 'Usar la versión limpia (ruido reducido y normalizada) en vez del original' }) @IsOptional() @IsBoolean() usarLimpio?: boolean;
  @ApiPropertyOptional({ description: 'Versión del curso leída (bloqueo optimista)' }) @IsOptional() @IsInt() @Min(1) version?: number;
}

/** HU-0704 · Poner la transcripción como texto de la narración para decirla con la voz del kit. */
export class RelocucionEntradaDto {
  @ApiProperty({ format: 'uuid', description: 'Material de audio del proyecto, ya transcrito' }) @IsUUID() materialId: string;
  @ApiPropertyOptional({ description: 'Versión del curso leída (bloqueo optimista)' }) @IsOptional() @IsInt() @Min(1) version?: number;
}

export class GrabacionResultadoDto {
  @ApiProperty() version: number;
  @ApiProperty({ enum: ['GENERANDO', 'DESACTUALIZADA'], description: 'Estado de la narración en español después del cambio' }) estado: string;
  @ApiProperty({ type: [String], description: 'Lo que se rehace en el worker' }) regenerando: string[];
  @ApiPropertyOptional({ description: 'Re-locutar: el texto de la narración antes del cambio, para «↶ Deshacer»' }) textoAnterior?: string;
}

class LimpiezaDto {
  @ApiProperty({ enum: ['procesando', 'listo', 'error'] }) estado: string;
  @ApiPropertyOptional({ format: 'uuid' }) recursoId?: string;
  @ApiPropertyOptional({ format: 'uri', description: 'Audio limpio (URL firmada de 15 minutos)' }) url?: string;
  @ApiPropertyOptional() error?: string;
}

/** Un audio del cliente del proyecto, listo para usar en la narración. */
export class AudioClienteDto {
  @ApiProperty({ format: 'uuid' }) materialId: string;
  @ApiProperty({ format: 'uuid' }) recursoId: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ nullable: true }) duracionS: number | null;
  @ApiProperty({ description: 'Transcripción unida: el texto que tendrá la narración' }) texto: string;
  @ApiProperty({ format: 'uri', description: 'Audio original (URL firmada de 15 minutos)' }) url: string;
  @ApiPropertyOptional({ type: LimpiezaDto, nullable: true }) limpieza: LimpiezaDto | null;
}

export class LimpiezaResultadoDto {
  @ApiProperty({ enum: ['procesando', 'listo'] }) estado: string;
}
