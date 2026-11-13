import { Module } from '@nestjs/common';
import { OperacionController } from './operacion.controller.js';
import { OperacionService } from './operacion.service.js';

/** M15 · Observabilidad mínima y copias de seguridad (HU-1403). */
@Module({ controllers: [OperacionController], providers: [OperacionService] })
export class OperacionModule {}
