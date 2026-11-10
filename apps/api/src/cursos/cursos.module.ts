import { Module } from '@nestjs/common';
import { CursosController } from './cursos.controller.js';
import { CursosService } from './cursos.service.js';

/** M05 · Revisión del curso (HU-0501, HU-0502). */
@Module({ controllers: [CursosController], providers: [CursosService] })
export class CursosModule {}
