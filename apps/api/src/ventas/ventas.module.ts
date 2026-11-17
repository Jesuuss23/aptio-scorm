import { Module } from '@nestjs/common';
import { PlanesController, PlanesPublicoController } from './planes.controller.js';
import { PlanesService } from './planes.service.js';

/** M18 · Planes, suscripciones y facturación (ADR-012). HU-1702: planes administrables. */
@Module({
  controllers: [PlanesController, PlanesPublicoController],
  providers: [PlanesService],
})
export class VentasModule {}
