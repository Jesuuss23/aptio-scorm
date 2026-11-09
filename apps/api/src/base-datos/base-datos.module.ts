import { Global, Module } from '@nestjs/common';
import { BaseDatosService } from './base-datos.service.js';

@Global()
@Module({ providers: [BaseDatosService], exports: [BaseDatosService] })
export class BaseDatosModule {}
