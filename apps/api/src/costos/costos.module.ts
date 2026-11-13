import { Module } from '@nestjs/common';
import { CostosController } from './costos.controller.js';
import { CostosService } from './costos.service.js';

/** M13 · Costos de IA (HU-1302). */
@Module({ controllers: [CostosController], providers: [CostosService] })
export class CostosModule {}
