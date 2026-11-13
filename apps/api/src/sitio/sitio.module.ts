import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CorreoModule } from '../correo/correo.module.js';
import { RecursosModule } from '../recursos/recursos.module.js';
import { AjustesController } from './ajustes.controller.js';
import { AjustesService } from './ajustes.service.js';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
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
import { SeoController } from './seo.controller.js';
import { SeoService } from './seo.service.js';
import { SeoIaController } from './seo-ia.controller.js';
import { SeoIaService } from './seo-ia.service.js';
import { SitioController } from './sitio.controller.js';
import { SitioService } from './sitio.service.js';
import { VersionesController } from './versiones.controller.js';
import { VersionesService } from './versiones.service.js';

/** M16 · Sitio web y contenido (fase comercial, ADR-011): administración solo del superadmin y rutas públicas. */
@Module({
  imports: [RecursosModule, CorreoModule],
  controllers: [SitioController, BloquesController, ElementosController, FicticiosController, NavegacionController, VersionesController, PublicoController, SitioPublicoController, AjustesController, BlogController, SeoController, SeoIaController],
  providers: [SitioService, VersionesService, PrerenderService, SitioPublicoService, AjustesService, BlogService, SeoService, SeoIaService, BloquesService, ElementosService, NavegacionService, LimitePublicoService],
})
export class SitioModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // El middleware revisa la ruta: solo cuenta `/api/v1/publico/*`.
    consumer.apply(LimitePublicoMiddleware).forRoutes('*');
  }
}
