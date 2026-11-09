import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
}

/**
 * Envío de correos (invitaciones y cambio de clave). En local usa Mailpit (SMTP_URL); sin SMTP_URL
 * escribe el correo en el registro para no bloquear el desarrollo.
 */
@Injectable()
export class CorreoService {
  private readonly log = new Logger('Correo');
  private readonly transporte?: Transporter;
  private readonly remitente: string;

  constructor(config: ConfigService) {
    const smtp = config.get<string>('SMTP_URL');
    this.remitente = config.get<string>('CORREO_REMITENTE') ?? 'no-responder@aptio.test';
    if (smtp) this.transporte = nodemailer.createTransport(smtp);
  }

  async enviar(correo: Correo): Promise<void> {
    if (!this.transporte) {
      // En producción no se escribe el cuerpo: lleva enlaces de un solo uso.
      if (process.env.NODE_ENV === 'production') throw new Error('SMTP_URL no definido: no se puede enviar correo');
      this.log.warn(`SMTP_URL no definido. Correo para ${correo.para}: ${correo.asunto}\n${correo.texto}`);
      return;
    }
    await this.transporte.sendMail({ from: this.remitente, to: correo.para, subject: correo.asunto, text: correo.texto });
  }
}
