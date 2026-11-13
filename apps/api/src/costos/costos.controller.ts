import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { CostosConsultaDto, ResumenCostosDto } from './costos.dto.js';
import { CostosService } from './costos.service.js';

/** HU-1302 · Resumen de costos de IA (M13). Lo ve administración; diseño instruccional, solo lectura. */
@ApiTags('Costos y rentabilidad')
@ApiCookieAuth('sesion')
@Controller('costos')
@Roles('ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL')
export class CostosController {
  constructor(private readonly costos: CostosService) {}

  @Get()
  @ApiOkResponse({ type: ResumenCostosDto })
  resumen(@UsuarioActual() u: UsuarioSesion, @Query() q: CostosConsultaDto): Promise<ResumenCostosDto> {
    return this.costos.resumen(u, q);
  }
}
