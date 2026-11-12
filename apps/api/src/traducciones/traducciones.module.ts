import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module.js';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { TraduccionesController } from './traducciones.controller.js';
import { TraduccionesService } from './traducciones.service.js';

/** M08 · Idiomas: traducción con glosario (HU-0802). */
@Module({ imports: [CursosModule, TrabajosModule], controllers: [TraduccionesController], providers: [TraduccionesService] })
export class TraduccionesModule {}
