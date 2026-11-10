import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { CursosController } from './cursos.controller.js';
import { CursosService } from './cursos.service.js';
import { PropuestasController } from './propuestas.controller.js';
import { PropuestasService } from './propuestas.service.js';

/** M05 · Revisión del curso (HU-0501, HU-0502), M07 · narraciones (HU-0701), regeneración en cascada (HU-0503) y propuestas de la IA (HU-0504). */
@Module({ imports: [RecursosModule, TrabajosModule], controllers: [CursosController, PropuestasController], providers: [CursosService, PropuestasService] })
export class CursosModule {}
