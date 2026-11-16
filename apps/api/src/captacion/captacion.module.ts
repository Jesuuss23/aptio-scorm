import { Module } from '@nestjs/common';
import { CorreoModule } from '../correo/correo.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsPublicoController } from './leads-publico.controller.js';
import { LeadsService } from './leads.service.js';

/** M17 · Captación y CRM (fase comercial, ADR-011). HU-1601: leads con origen, página de entrada y UTM. */
@Module({
  imports: [CorreoModule],
  controllers: [LeadsController, LeadsPublicoController],
  providers: [LeadsService],
})
export class CaptacionModule {}
