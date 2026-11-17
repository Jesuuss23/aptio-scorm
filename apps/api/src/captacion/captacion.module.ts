import { Module } from '@nestjs/common';
import { CorreoModule } from '../correo/correo.module.js';
import { AgendaController, AgendaPublicoController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';
import { ChatbotController, ChatbotPublicoController } from './chatbot.controller.js';
import { ChatbotService } from './chatbot.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsPublicoController } from './leads-publico.controller.js';
import { LeadsService } from './leads.service.js';
import { PopupsController, PopupsPublicoController } from './popups.controller.js';
import { PopupsService } from './popups.service.js';

/** M17 · Captación y CRM (fase comercial, ADR-011). HU-1601: leads con origen, página de entrada y UTM. HU-1602: envío a CRM y webhook firmado. HU-1603: popups. HU-1605: agendamiento de demos. HU-1604: chatbot. */
@Module({
  imports: [CorreoModule],
  controllers: [PopupsPublicoController, AgendaPublicoController, ChatbotPublicoController, LeadsController, LeadsPublicoController, CrmController, PopupsController, AgendaController, ChatbotController],
  providers: [LeadsService, CrmService, PopupsService, AgendaService, ChatbotService],
})
export class CaptacionModule {}
