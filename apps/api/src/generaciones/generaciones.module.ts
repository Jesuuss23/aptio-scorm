import { Module } from '@nestjs/common';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { GeneracionesController } from './generaciones.controller.js';
import { GeneracionesService } from './generaciones.service.js';

@Module({ imports: [TrabajosModule], controllers: [GeneracionesController], providers: [GeneracionesService] })
export class GeneracionesModule {}
