import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { BloquesController } from './bloques.controller.js';
import { BloquesService } from './bloques.service.js';
import { LimitePublicoMiddleware, LimitePublicoService } from './limite-publico.js';
import { PublicoController } from './publico.controller.js';
import { SitioController } from './sitio.controller.js';
import { SitioService } from './sitio.service.js';

/** M16 · Sitio web y contenido (fase comercial, ADR-011): administración solo del superadmin y rutas públicas. */
@Module({ controllers: [SitioController, BloquesController, PublicoController], providers: [SitioService, BloquesService, LimitePublicoService] })
export class SitioModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // El middleware revisa la ruta: solo cuenta `/api/v1/publico/*`.
    consumer.apply(LimitePublicoMiddleware).forRoutes('*');
  }
}
