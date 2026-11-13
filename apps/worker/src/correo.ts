// HU-1403 · Correo del worker (avisos que no esperan a nadie): SMTP_URL como la API (Mailpit en local). Sin SMTP_URL
// se escribe en el registro, salvo en producción, donde falla para que se note. Un aviso nunca detiene el trabajo.
import nodemailer from 'nodemailer';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
}
export type EnviarCorreo = (correo: Correo) => Promise<void>;

export function correoDesdeEntorno(env: NodeJS.ProcessEnv = process.env): EnviarCorreo {
  const remitente = env.CORREO_REMITENTE ?? 'no-responder@aptio.test';
  if (!env.SMTP_URL) {
    return async (c) => {
      if (env.NODE_ENV === 'production') throw new Error('SMTP_URL no definido: no se puede enviar correo');
      console.warn(`SMTP_URL no definido. Correo para ${c.para}: ${c.asunto}\n${c.texto}`);
    };
  }
  const transporte = nodemailer.createTransport(env.SMTP_URL);
  return async (c) => {
    await transporte.sendMail({ from: remitente, to: c.para, subject: c.asunto, text: c.texto });
  };
}

/** Envía a cada destinatario sin esperar ni lanzar: un fallo se registra y el flujo sigue. Devuelve la promesa para las pruebas. */
export function avisarSinBloquear(enviar: EnviarCorreo, correos: Correo[], motivo: string): Promise<void> {
  return Promise.all(correos.map((c) => enviar(c).catch((e: unknown) => {
    console.error(`[correo] no se pudo avisar ${motivo} a ${c.para}: ${e instanceof Error ? e.message : String(e)}`);
  }))).then(() => undefined);
}
