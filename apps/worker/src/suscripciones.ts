/**
 * HU-1703 · Cola `suscripciones`: el correo de bienvenida de una suscripción pagada (REQ-083, CP-143). Antes de enviar
 * vuelve a leer la solicitud: si no está aprobada o no tiene organización (por ejemplo, el correo ya era de otra cuenta),
 * no envía nada. El correo lleva el plan, el ciclo, el total pagado, el comprobante que se emitirá y el enlace para crear
 * la clave del administrador. Si el SMTP falla, la cola reintenta con espera creciente; la suscripción no cambia.
 *
 * HU-1706 · La misma cola vence las suscripciones canceladas al fin del período (`suscripcion-vencer`, RN-18-7).
 */
import type { PrismaClient } from '@aptio/db';
import { COLA_SUSCRIPCIONES, type DatosBienvenida, type DatosVencerSuscripcion, ESPERAS_SUSCRIPCIONES_MS, TAREA_VENCER_SUSCRIPCION } from '@aptio/colas';
import { monto2 } from '@aptio/schema/suscripciones';
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
    `Total pagado: ${monto2(Number(s.total), s.moneda)} (incluye IGV de 18 %)`,
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

export interface ResultadoVencimiento { estado: 'cancelada' | 'omitido'; motivo?: string }

/**
 * HU-1706 · Pasa a CANCELADA la suscripción que pidió cancelar al fin del período, si ese fin ya llegó. Condicional en la
 * base (estado ACTIVA, `cancelarAlFin` y `finPeriodo` vencido): una tarea vieja tras reanudar, o repetida, no cambia nada.
 */
export async function procesarVencimiento(bd: PrismaClient, datos: DatosVencerSuscripcion, ahora = new Date()): Promise<ResultadoVencimiento> {
  return bd.$transaction(async (tx) => {
    const s = await tx.suscripcion.findUnique({ where: { id: datos.suscripcionId } });
    if (!s) return { estado: 'omitido', motivo: 'la suscripción no existe' };
    const r = await tx.suscripcion.updateMany({
      where: { id: s.id, estado: 'ACTIVA', cancelarAlFin: true, finPeriodo: { lte: ahora } },
      data: { estado: 'CANCELADA', canceladaEn: s.finPeriodo, planProgramadoId: null },
    });
    if (r.count === 0) return { estado: 'omitido', motivo: s.estado === 'CANCELADA' ? 'ya estaba cancelada' : !s.cancelarAlFin ? 'se reanudó' : 'el período no terminó' };
    await tx.auditoria.create({
      data: { organizacionId: s.organizacionId, usuarioId: null, accion: 'SUSCRIPCION_CANCELADA', entidad: 'Suscripcion', entidadId: s.id, datos: { finPeriodo: s.finPeriodo.toISOString(), planId: s.planId } },
    });
    return { estado: 'cancelada' };
  });
}

export const esperaSuscripciones = (n: number, esperas: readonly number[] = ESPERAS_SUSCRIPCIONES_MS) => esperas[Math.min(Math.max(n, 1), esperas.length) - 1]!;

/** El trabajador de la cola `suscripciones`. Las pruebas acortan las esperas. */
export function crearTrabajadorSuscripciones(bd: PrismaClient, enviar: EnviarCorreo, opciones: { connection: ConnectionOptions; prefix: string; esperas?: readonly number[] }): Worker<DatosBienvenida | DatosVencerSuscripcion, ResultadoBienvenida | ResultadoVencimiento> {
  const esperas = opciones.esperas ?? ESPERAS_SUSCRIPCIONES_MS;
  return new Worker<DatosBienvenida | DatosVencerSuscripcion, ResultadoBienvenida | ResultadoVencimiento>(COLA_SUSCRIPCIONES, (job) => (job.name === TAREA_VENCER_SUSCRIPCION
    ? procesarVencimiento(bd, job.data as DatosVencerSuscripcion)
    : procesarBienvenida(bd, job.data as DatosBienvenida, enviar)), {
    connection: opciones.connection, prefix: opciones.prefix, concurrency: 4, settings: { backoffStrategy: (hechos: number) => esperaSuscripciones(hechos, esperas) },
  });
}
