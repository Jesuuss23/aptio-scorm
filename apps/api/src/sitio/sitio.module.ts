import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { PrerenderService } from './prerender.service.js';
import { SitioPublicoController } from './sitio-publico.controller.js';
import { SitioPublicoService } from './sitio-publico.service.js';
import { BloquesController } from './bloques.controller.js';
import { BloquesService } from './bloques.service.js';
import { ElementosController, FicticiosController } from './elementos.controller.js';
import { ElementosService } from './elementos.service.js';
import { LimitePublicoMiddleware, LimitePublicoService } from './limite-publico.js';
import { NavegacionController } from './navegacion.controller.js';
import { NavegacionService } from './navegacion.service.js';
import { PublicoController } from './publico.controller.js';
import { SitioController } from './sitio.controller.js';
import { SitioService } from './sitio.service.js';
import { VersionesController } from './versiones.controller.js';
import { VersionesService } from './versiones.service.js';

/** M16 · Sitio web y contenido (fase comercial, ADR-011): administración solo del superadmin y rutas públicas. */
@Module({
  imports: [RecursosModule],
  controllers: [SitioController, BloquesController, ElementosController, FicticiosController, NavegacionController, VersionesController, PublicoController, SitioPublicoController],
  providers: [SitioService, VersionesService, PrerenderService, SitioPublicoService, BloquesService, ElementosService, NavegacionService, LimitePublicoService],
})
export class SitioModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // El middleware revisa la ruta: solo cuenta `/api/v1/publico/*`.
    consumer.apply(LimitePublicoMiddleware).forRoutes('*');
  }
}
