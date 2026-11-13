import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags,
  ApiUnauthorizedResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { type Coleccion, idiomaDeFila } from '@aptio/schema/sitio-contenido';
import { Roles, type UsuarioSesion } from '../comun/roles.js';
import { UsuarioActual } from '../comun/usuario-actual.js';
import { ConsultaElementosDto, ElementoSitioCambioDto, ElementoSitioDto, ElementoSitioEntradaDto, FicticiosOcultadosDto, FicticiosSitioDto, OrdenElementosDto } from './elementos.dto.js';
import { ElementosService } from './elementos.service.js';

/** HU-1510 · El idioma pedido (ya validado por el DTO); sin él, español. */
const idiomaSitio = (idioma: string | undefined) => idiomaDeFila({ idioma: idioma ?? null });

/** HU-1504 · Contenido del sitio (REQ-066, PNT-27): solo el superadmin; 403 al resto y 401 sin sesión. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@Controller('sitio/elementos')
@Roles('SUPERADMIN')
export class ElementosController {
  constructor(private readonly elementos: ElementosService) {}

  @Get()
  @ApiOkResponse({ type: ElementoSitioDto, isArray: true, description: 'Visibles y ocultos, por orden' })
  @ApiUnprocessableEntityResponse({ description: 'Colección desconocida' })
  listar(@Query() q: ConsultaElementosDto): Promise<ElementoSitioDto[]> {
    return this.elementos.listar(q.coleccion as Coleccion, idiomaSitio(q.idioma));
  }

  @Post()
  @ApiCreatedResponse({ type: ElementoSitioDto, description: 'Al final y oculto (RN-16-2, CP-115)' })
  @ApiUnprocessableEntityResponse({ description: 'DATOS_NO_VALIDOS: campos de la colección o texto plano (RN-16-7)' })
  agregar(@UsuarioActual() u: UsuarioSesion, @Body() dto: ElementoSitioEntradaDto): Promise<ElementoSitioDto> {
    return this.elementos.agregar(u, dto.coleccion as Coleccion, dto.datos, dto.ficticio ?? false, idiomaSitio(dto.idioma));
  }

  @Patch()
  @ApiOkResponse({ type: ElementoSitioDto, isArray: true, description: 'La colección en el orden nuevo' })
  @ApiUnprocessableEntityResponse({ description: 'ORDEN_INVALIDO: faltan, sobran o se repiten elementos' })
  ordenar(@UsuarioActual() u: UsuarioSesion, @Body() dto: OrdenElementosDto): Promise<ElementoSitioDto[]> {
    return this.elementos.ordenar(u, dto.coleccion as Coleccion, dto.orden, idiomaSitio(dto.idioma));
  }

  @Patch(':elementoId')
  @ApiOkResponse({ type: ElementoSitioDto })
  @ApiNotFoundResponse({ description: 'El elemento no existe' })
  @ApiUnprocessableEntityResponse({ description: 'DATOS_NO_VALIDOS o SIN_CAMBIOS' })
  cambiar(@UsuarioActual() u: UsuarioSesion, @Param('elementoId', ParseUUIDPipe) id: string, @Body() dto: ElementoSitioCambioDto): Promise<ElementoSitioDto> {
    return this.elementos.cambiar(u, id, dto);
  }

  @Delete(':elementoId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Borrado; el resto de la colección se reordena sin huecos' })
  @ApiNotFoundResponse({ description: 'El elemento no existe' })
  borrar(@UsuarioActual() u: UsuarioSesion, @Param('elementoId', ParseUUIDPipe) id: string): Promise<void> {
    return this.elementos.borrar(u, id);
  }
}

/** HU-1505 · Datos ficticios del sitio (REQ-067, RN-16-3): solo el superadmin. */
@ApiTags('Sitio web')
@ApiCookieAuth('sesion')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Solo el superadmin de plataforma (CP-109)' })
@Controller('sitio/ficticios')
@Roles('SUPERADMIN')
export class FicticiosController {
  constructor(private readonly elementos: ElementosService) {}

  @Get()
  @ApiOkResponse({ type: FicticiosSitioDto })
  listar(): Promise<FicticiosSitioDto> {
    return this.elementos.ficticios();
  }

  @Post('ocultar')
  @HttpCode(200)
  @ApiOkResponse({ type: FicticiosOcultadosDto, description: 'Todos los ficticios visibles quedan ocultos' })
  ocultar(@UsuarioActual() u: UsuarioSesion): Promise<FicticiosOcultadosDto> {
    return this.elementos.ocultarFicticios(u);
  }
}
