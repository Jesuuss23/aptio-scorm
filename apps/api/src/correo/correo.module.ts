import { Global, Module } from '@nestjs/common';
import { CorreoService } from './correo.service.js';

@Global()
@Module({ providers: [CorreoService], exports: [CorreoService] })
export class CorreoModule {}
