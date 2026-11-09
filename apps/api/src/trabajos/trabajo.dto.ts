import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TrabajoSimuladoDto {
  @ApiProperty({ example: 'IA-04', description: 'IA-01 … IA-18, VOZ o BOCA (salidas del caso LOTO)' })
  @IsString()
  @Matches(/^(IA-\d\d|VOZ|BOCA)$/)
  tarea: string;
}

export class TrabajoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() tarea: string;
  @ApiProperty({ enum: ['ia', 'voz', 'media', 'export'] }) cola: string;
  @ApiProperty({ enum: ['EN_COLA', 'EN_CURSO', 'COMPLETADO', 'ERROR', 'CANCELADO'] }) estado: string;
  @ApiProperty() proveedor: string;
  @ApiProperty() modelo: string;
  @ApiProperty({ nullable: true }) error: string | null;
  @ApiProperty({ nullable: true }) duracionMs: number | null;
  @ApiProperty() creadoEn: string;
  @ApiProperty({ format: 'uri', description: 'URL de eventos (SSE)' }) eventos: string;
}
