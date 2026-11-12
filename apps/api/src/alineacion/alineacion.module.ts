import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module.js';
import { AlineacionController } from './alineacion.controller.js';
import { AlineacionService } from './alineacion.service.js';

/** M10 · Alineación pedagógica: matriz y nivel de Bloom (HU-1001). */
@Module({ imports: [CursosModule], controllers: [AlineacionController], providers: [AlineacionService] })
export class AlineacionModule {}
