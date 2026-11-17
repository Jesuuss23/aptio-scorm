import { Module } from '@nestjs/common';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { GeneracionesController } from './generaciones.controller.js';
import { GeneracionesService } from './generaciones.service.js';

@Module({ imports: [TrabajosModule, VentasModule], controllers: [GeneracionesController], providers: [GeneracionesService] })
export class GeneracionesModule {}
