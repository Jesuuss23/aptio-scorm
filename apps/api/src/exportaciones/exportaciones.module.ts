import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { ExportacionesController } from './exportaciones.controller.js';
import { ExportacionesService } from './exportaciones.service.js';

/** M12 · Entrega y LMS (HU-1202). */
@Module({ imports: [RecursosModule, TrabajosModule], controllers: [ExportacionesController], providers: [ExportacionesService] })
export class ExportacionesModule {}
