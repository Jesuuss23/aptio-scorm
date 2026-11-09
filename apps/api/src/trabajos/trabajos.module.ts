import { Module } from '@nestjs/common';
import { ColasService } from './colas.service.js';
import { EventosService } from './eventos.service.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';

@Module({
  controllers: [TrabajosController],
  providers: [ColasService, EventosService, TrabajosService],
  exports: [ColasService],
})
export class TrabajosModule {}
