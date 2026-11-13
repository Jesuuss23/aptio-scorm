import { Module } from '@nestjs/common';
import { SitioController } from './sitio.controller.js';

/** M16 · Sitio web y contenido (fase comercial, ADR-011). Solo el superadmin de plataforma. */
@Module({ controllers: [SitioController] })
export class SitioModule {}
