import { Module } from '@nestjs/common';
import { NegocioController } from './negocio.controller.js';
import { NegocioService } from './negocio.service.js';

/** M13 · Rentabilidad y mediciones (HU-1303). */
@Module({ controllers: [NegocioController], providers: [NegocioService] })
export class NegocioModule {}
