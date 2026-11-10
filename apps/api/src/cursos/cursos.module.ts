import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { CursosController } from './cursos.controller.js';
import { CursosService } from './cursos.service.js';

/** M05 · Revisión del curso (HU-0501, HU-0502) y M07 · narraciones (HU-0701). */
@Module({ imports: [RecursosModule], controllers: [CursosController], providers: [CursosService] })
export class CursosModule {}
