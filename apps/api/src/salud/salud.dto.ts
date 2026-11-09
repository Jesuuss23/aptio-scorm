import { ApiProperty } from '@nestjs/swagger';

export class SaludDto {
  @ApiProperty({ enum: ['ok', 'degradado'], example: 'ok' })
  estado: 'ok' | 'degradado';

  @ApiProperty({ example: 'Aptio SCORM API' })
  servicio: string;

  @ApiProperty({ enum: ['ok', 'error'], description: 'Respuesta de PostgreSQL' })
  baseDatos: 'ok' | 'error';

  @ApiProperty({ format: 'date-time' })
  fecha: string;
}
