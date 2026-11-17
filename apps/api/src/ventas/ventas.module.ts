import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CaptacionModule } from '../captacion/captacion.module.js';
import { CobranzaOrgController, SuscripcionesVentasController, SuscripcionOrgController } from './cambio-plan.controller.js';
import { CobranzaService } from './cobranza.service.js';
import { CambioPlanService } from './cambio-plan.service.js';
import { CobrosService } from './cobros.service.js';
import { ComprobantesController, DatosFiscalesController, WebhooksOseController } from './comprobantes.controller.js';
import { ComprobantesService } from './comprobantes.service.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { CuotaController } from './cuotas.controller.js';
import { CuotasService } from './cuotas.service.js';
import { CobrosController, PasarelasController } from './pasarelas.controller.js';
import { PasarelasService } from './pasarelas.service.js';
import { PlanesController, PlanesPublicoController } from './planes.controller.js';
import { PlanesService } from './planes.service.js';
import { CheckoutPublicoController, WebhooksPagoController } from './suscripciones.controller.js';
import { SuscripcionesService } from './suscripciones.service.js';

/**
 * M18 · Planes, suscripciones y facturación (ADR-012). HU-1702: planes administrables. HU-1703: alta de suscripción desde
 * /precios. HU-1704: pasarelas intercambiables, cobros y reembolsos. HU-1705: cuotas de cápsulas y adicionales (exporta
 * `CuotasService` para descontar al lanzar una generación). HU-1706: cambio de plan con prorrateo y cancelación. HU-1707: comprobantes electrónicos SUNAT, datos fiscales y el
 * webhook del OSE. HU-1708: cobranza, suspensión a solo lectura y Ventas › Suscripciones (exporta `CobranzaService` para la guarda).
 */
@Module({
  imports: [AuthModule, CaptacionModule],
  controllers: [PlanesController, PlanesPublicoController, CheckoutPublicoController, WebhooksPagoController, PasarelasController, CobrosController, CuotaController, SuscripcionOrgController,
    ComprobantesController, DatosFiscalesController, WebhooksOseController, CobranzaOrgController, SuscripcionesVentasController],
  providers: [PlanesService, SuscripcionesService, PasarelasService, CobrosService, CuotasService, CambioPlanService, ComprobantesService, AlmacenService, CobranzaService],
  exports: [CuotasService, CobranzaService],
})
export class VentasModule {}
