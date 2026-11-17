import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiQuery, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { Roles } from '../comun/roles.js';
import { PanelIngresosDto } from './ingresos.dto.js';
import { IngresosService } from './ingresos.service.js';

/** HU-1710 · Panel de ingresos de Ventas › Planes (REQ-090, CP-152, PNT-35). Solo el superadmin. */
@ApiTags('Ventas')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma' })
@Controller('ventas/ingresos')
@Roles('SUPERADMIN')
export class IngresosController {
  constructor(private readonly ingresos: IngresosService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'mes', required: false, example: '2026-11', description: 'AAAA-MM; por defecto el mes en curso de Lima' })
  @ApiOkResponse({ type: PanelIngresosDto, description: 'El mes y el anterior, con la variación de la cancelación' })
  @ApiUnprocessableEntityResponse({ description: 'NO_VALIDO si el mes no es AAAA-MM' })
  panel(@Query('mes') mes?: string): Promise<PanelIngresosDto> {
    return this.ingresos.panel(mes);
  }
}
