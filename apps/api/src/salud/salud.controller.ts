import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Publico } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { SaludDto } from './salud.dto.js';

@ApiTags('Plataforma')
@Controller('salud')
export class SaludController {
  constructor(private readonly baseDatos: BaseDatosService) {}

  /** CP-001: responde 200 cuando la API y la base están disponibles; 503 si la base no responde. */
  @Get()
  @Publico()
  @ApiOkResponse({ type: SaludDto })
  @ApiServiceUnavailableResponse({ type: SaludDto, description: 'La base de datos no responde' })
  async salud(@Res({ passthrough: true }) res: Response): Promise<SaludDto> {
    const baseOk = await this.baseDatos.disponible();
    if (!baseOk) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      estado: baseOk ? 'ok' : 'degradado',
      servicio: 'Aptio SCORM API',
      baseDatos: baseOk ? 'ok' : 'error',
      fecha: new Date().toISOString(),
    };
  }
}
