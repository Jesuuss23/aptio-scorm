import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module.js';
import { NavegacionController } from './navegacion.controller.js';
import { NavegacionService } from './navegacion.service.js';

/** M11 · Patrones de navegación y reglas de avance (HU-1103). */
@Module({ imports: [CursosModule], controllers: [NavegacionController], providers: [NavegacionService] })
export class NavegacionModule {}
