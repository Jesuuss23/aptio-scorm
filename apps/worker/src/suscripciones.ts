/**
 * HU-1703 · Cola `suscripciones`: el correo de bienvenida de una suscripción pagada (REQ-083, CP-143). Antes de enviar
 * vuelve a leer la solicitud: si no está aprobada o no tiene organización (por ejemplo, el correo ya era de otra cuenta),
 * no envía nada. El correo lleva el plan, el ciclo, el total pagado, el comprobante que se emitirá y el enlace para crear
 * la clave del administrador. Si el SMTP falla, la cola reintenta con espera creciente; la suscripción no cambia.
 */
import type { PrismaClient } from '@aptio/db';
import { COLA_SUSCRIPCIONES, type DatosBienvenida, ESPERAS_SUSCRIPCIONES_MS } from '@aptio/colas';
import { soles2 } from '@aptio/schema/suscripciones';
import { type ConnectionOptions, Worker } from 'bullmq';
import type { Correo, EnviarCorreo } from './correo.js';

export interface ResultadoBienvenida { estado: 'enviado' | 'omitido'; motivo?: string }

const leer = (bd: PrismaClient, id: string) => bd.solicitudSuscripcion.findUnique({ where: { id }, include: { plan: true, suscripcion: true } });
type Solicitud = NonNullable<Awaited<ReturnType<typeof leer>>>;

/** «17 de diciembre de 2026», con la fecha de Lima. */
export const fechaLarga = (d: Date) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(d);

/** El correo de bienvenida: texto plano, sin nada que el visitante escribió salvo su nombre y la razón social. */
export function correoBienvenida(s: Solicitud, enlace: string): Correo {
  const ciclo = s.ciclo === 'ANUAL' ? 'anual' : 'mensual';
  const lineas = [
    `Hola, ${s.nombreAdmin}:`, '',
    `Tu suscripción a Aptio SCORM está activa. Ya creamos la cuenta de ${s.razonSocial} y tú eres su administrador.`, '',
    `Plan: ${s.plan.nombre} (${ciclo})`,
    `Total pagado: ${soles2(Number(s.total))} (incluye IGV de 18 %)`,
    ...(s.suscripcion ? [`Período pagado hasta el ${fechaLarga(s.suscripcion.finPeriodo)}`] : []),
    `Comprobante: ${s.tipoComprobante === 'FACTURA' ? `factura a nombre del RUC ${s.ruc}` : 'boleta de venta'}`, '',
    'Crea tu clave con este enlace (vale 72 horas y un solo uso):', enlace, '',
    'Si el enlace venció, usa «¿Olvidaste tu clave?» en la pantalla de ingreso con este mismo correo.', '',
    'El equipo de Aptio SCORM',
  ];
  return { para: s.correoAdmin, asunto: `Bienvenido a Aptio SCORM · Plan ${s.plan.nombre}`, texto: lineas.join('\n') };
}

export async function procesarBienvenida(bd: PrismaClient, datos: DatosBienvenida, enviar: EnviarCorreo): Promise<ResultadoBienvenida> {
  const s = await leer(bd, datos.solicitudId);
  if (!s) return { estado: 'omitido', motivo: 'la solicitud no existe' };
  if (s.estado !== 'APROBADA' || !s.organizacionId) return { estado: 'omitido', motivo: 'la solicitud no tiene un alta aprobada' };
  await enviar(correoBienvenida(s, datos.enlace));
  return { estado: 'enviado' };
}

export const esperaSuscripciones = (n: number, esperas: readonly number[] = ESPERAS_SUSCRIPCIONES_MS) => esperas[Math.min(Math.max(n, 1), esperas.length) - 1]!;

/** El trabajador de la cola `suscripciones`. Las pruebas acortan las esperas. */
export function crearTrabajadorSuscripciones(bd: PrismaClient, enviar: EnviarCorreo, opciones: { connection: ConnectionOptions; prefix: string; esperas?: readonly number[] }): Worker<DatosBienvenida, ResultadoBienvenida> {
  const esperas = opciones.esperas ?? ESPERAS_SUSCRIPCIONES_MS;
  return new Worker<DatosBienvenida, ResultadoBienvenida>(COLA_SUSCRIPCIONES, (job) => procesarBienvenida(bd, job.data, enviar), {
    connection: opciones.connection, prefix: opciones.prefix, concurrency: 4, settings: { backoffStrategy: (hechos: number) => esperaSuscripciones(hechos, esperas) },
  });
}
