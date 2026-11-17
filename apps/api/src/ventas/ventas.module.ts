import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CaptacionModule } from '../captacion/captacion.module.js';
import { CobrosService } from './cobros.service.js';
import { CobrosController, PasarelasController } from './pasarelas.controller.js';
import { PasarelasService } from './pasarelas.service.js';
import { PlanesController, PlanesPublicoController } from './planes.controller.js';
import { PlanesService } from './planes.service.js';
import { CheckoutPublicoController, WebhooksPagoController } from './suscripciones.controller.js';
import { SuscripcionesService } from './suscripciones.service.js';

/**
 * M18 · Planes, suscripciones y facturación (ADR-012). HU-1702: planes administrables. HU-1703: alta de suscripción desde
 * /precios. HU-1704: pasarelas intercambiables, cobros y reembolsos.
 */
@Module({
  imports: [AuthModule, CaptacionModule],
  controllers: [PlanesController, PlanesPublicoController, CheckoutPublicoController, WebhooksPagoController, PasarelasController, CobrosController],
  providers: [PlanesService, SuscripcionesService, PasarelasService, CobrosService],
})
export class VentasModule {}
