import { Module } from '@nestjs/common';
import { ConexionesController } from './conexiones.controller.js';
import { ConexionesService } from './conexiones.service.js';

/** M13 · Conexiones IA por organización (HU-1304). */
@Module({ controllers: [ConexionesController], providers: [ConexionesService] })
export class ConexionesModule {}
