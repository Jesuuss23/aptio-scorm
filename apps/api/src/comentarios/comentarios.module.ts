import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module.js';
import { ComentariosController } from './comentarios.controller.js';
import { ComentariosService } from './comentarios.service.js';

/** M05 · Comentarios del revisor del cliente (HU-0506). */
@Module({ imports: [CursosModule], controllers: [ComentariosController], providers: [ComentariosService] })
export class ComentariosModule {}
