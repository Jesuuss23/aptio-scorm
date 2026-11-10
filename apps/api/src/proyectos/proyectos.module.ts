import { Module } from '@nestjs/common';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { RecursosModule } from '../recursos/recursos.module.js';
import { MaterialesService } from './materiales.service.js';
import { ProyectosController } from './proyectos.controller.js';
import { ProyectosService } from './proyectos.service.js';

@Module({ imports: [TrabajosModule, RecursosModule], controllers: [ProyectosController], providers: [ProyectosService, MaterialesService], exports: [ProyectosService] })
export class ProyectosModule {}
