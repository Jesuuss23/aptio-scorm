import { Module } from '@nestjs/common';
import { AlmacenService } from './almacen.service.js';
import { RecursosController } from './recursos.controller.js';
import { RecursosService } from './recursos.service.js';
import { RetencionService } from './retencion.service.js';

@Module({
  controllers: [RecursosController],
  providers: [AlmacenService, RecursosService, RetencionService],
  exports: [AlmacenService, RetencionService],
})
export class RecursosModule {}
