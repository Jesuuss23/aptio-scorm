import { Module } from '@nestjs/common';
import { CorreoModule } from '../correo/correo.module.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsPublicoController } from './leads-publico.controller.js';
import { LeadsService } from './leads.service.js';

/** M17 · Captación y CRM (fase comercial, ADR-011). HU-1601: leads con origen, página de entrada y UTM. HU-1602: envío a CRM y webhook firmado. */
@Module({
  imports: [CorreoModule],
  controllers: [LeadsController, LeadsPublicoController, CrmController],
  providers: [LeadsService, CrmService],
})
export class CaptacionModule {}
