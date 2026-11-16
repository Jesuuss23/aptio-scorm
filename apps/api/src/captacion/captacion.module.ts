import { Module } from '@nestjs/common';
import { CorreoModule } from '../correo/correo.module.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsPublicoController } from './leads-publico.controller.js';
import { LeadsService } from './leads.service.js';
import { PopupsController, PopupsPublicoController } from './popups.controller.js';
import { PopupsService } from './popups.service.js';

/** M17 · Captación y CRM (fase comercial, ADR-011). HU-1601: leads con origen, página de entrada y UTM. HU-1602: envío a CRM y webhook firmado. HU-1603: popups. */
@Module({
  imports: [CorreoModule],
  controllers: [PopupsPublicoController, LeadsController, LeadsPublicoController, CrmController, PopupsController],
  providers: [LeadsService, CrmService, PopupsService],
})
export class CaptacionModule {}
