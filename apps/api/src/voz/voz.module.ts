import { Module } from '@nestjs/common';
import { VozController } from './voz.controller.js';
import { VozService } from './voz.service.js';

@Module({ controllers: [VozController], providers: [VozService] })
export class VozModule {}
