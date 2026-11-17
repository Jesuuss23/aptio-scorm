/**
 * HU-1703 · Cola `suscripciones`: el correo de bienvenida de una suscripción pagada (REQ-083, CP-143). Antes de enviar
 * vuelve a leer la solicitud: si no está aprobada o no tiene organización (por ejemplo, el correo ya era de otra cuenta),
 * no envía nada. El correo lleva el plan, el ciclo, el total pagado, el comprobante que se emitirá y el enlace para crear
 * la clave del administrador. Si el SMTP falla, la cola reintenta con espera creciente; la suscripción no cambia.
 *
 * HU-1706 · La misma cola vence las suscripciones canceladas al fin del período (`suscripcion-vencer`, RN-18-7).
 * HU-1708 · Y lleva la cobranza: `renovar-suscripciones` y `renovacion-intento` (ver `cobranza.ts`).
 */
import type { PrismaClient } from '@aptio/db';
import {
  COLA_SUSCRIPCIONES, type DatosBienvenida, type DatosIntentoRenovacion, type DatosVencerSuscripcion, ESPERAS_SUSCRIPCIONES_MS, TAREA_INTENTO_RENOVACION, TAREA_RENOVAR_SUSCRIPCIONES,
  TAREA_VENCER_SUSCRIPCION,
} from '@aptio/colas';
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import { monto2 } from '@aptio/schema/suscripciones';
import { type ConnectionOptions, Worker } from 'bullmq';
import { intentoManual, type OpcionesCobranza, type PrecioDe, renovarSuscripciones, type ResumenCobranza } from './cobranza.js';
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
      // HU-1708 · También si pidió cancelar con el pago de la renovación pendiente o ya suspendida: no se renueva.
      where: { id: s.id, estado: { in: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA'] }, cancelarAlFin: true, finPeriodo: { lte: ahora } },
      data: { estado: 'CANCELADA', canceladaEn: s.finPeriodo, planProgramadoId: null },
    });
    if (r.count === 0) return { estado: 'omitido', motivo: s.estado === 'CANCELADA' ? 'ya estaba cancelada' : !s.cancelarAlFin ? 'se reanudó' : 'el período no terminó' };
    await tx.renovacion.updateMany({ where: { suscripcionId: s.id, estado: 'PENDIENTE' }, data: { estado: 'VENCIDA', proximoIntento: null } });
    await tx.auditoria.create({
      data: { organizacionId: s.organizacionId, usuarioId: null, accion: 'SUSCRIPCION_CANCELADA', entidad: 'Suscripcion', entidadId: s.id, datos: { finPeriodo: s.finPeriodo.toISOString(), planId: s.planId } },
    });
    return { estado: 'cancelada' };
  });
}

export const esperaSuscripciones = (n: number, esperas: readonly number[] = ESPERAS_SUSCRIPCIONES_MS) => esperas[Math.min(Math.max(n, 1), esperas.length) - 1]!;

type DatosSuscripciones = DatosBienvenida | DatosVencerSuscripcion | DatosIntentoRenovacion | Record<string, never>;
type ResultadoSuscripciones = ResultadoBienvenida | ResultadoVencimiento | ResumenCobranza | { estado: string };

/**
 * El trabajador de la cola `suscripciones`: la bienvenida, el vencimiento y (HU-1708) la cobranza periódica y el
 * «Reintentar ahora». Las pruebas acortan las esperas y fijan el reloj y el entorno.
 */
export function crearTrabajadorSuscripciones(bd: PrismaClient, enviar: EnviarCorreo, opciones: {
  connection: ConnectionOptions; prefix: string; esperas?: readonly number[];
  encolarComprobante?: (cobroId: string) => Promise<unknown>; entorno?: EntornoSitio; webUrl?: string; ahora?: () => Date; precio?: PrecioDe;
}): Worker<DatosSuscripciones, ResultadoSuscripciones> {
  const esperas = opciones.esperas ?? ESPERAS_SUSCRIPCIONES_MS;
  const reloj = opciones.ahora ?? (() => new Date());
  const cobranza = (): OpcionesCobranza => ({
    enviar, encolarComprobante: opciones.encolarComprobante ?? (async () => undefined), entorno: opciones.entorno, webUrl: opciones.webUrl, precio: opciones.precio,
  });
  return new Worker<DatosSuscripciones, ResultadoSuscripciones>(COLA_SUSCRIPCIONES, async (job) => {
    if (job.name === TAREA_VENCER_SUSCRIPCION) return procesarVencimiento(bd, job.data as DatosVencerSuscripcion, reloj());
    if (job.name === TAREA_RENOVAR_SUSCRIPCIONES) return renovarSuscripciones(bd, cobranza(), reloj());
    if (job.name === TAREA_INTENTO_RENOVACION) return { estado: await intentoManual(bd, cobranza(), (job.data as DatosIntentoRenovacion).renovacionId, reloj()) };
    return procesarBienvenida(bd, job.data as DatosBienvenida, enviar);
  }, {
    connection: opciones.connection, prefix: opciones.prefix, concurrency: 4, settings: { backoffStrategy: (hechos: number) => esperaSuscripciones(hechos, esperas) },
  });
}
