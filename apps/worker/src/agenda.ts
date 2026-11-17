/**
 * HU-1605 · Cola `agenda`: la invitación, los recordatorios a las 24 h y a 1 h y la cancelación de una demo (RN-17-5,
 * CP-136). Antes de enviar vuelve a leer la cita: si se canceló, ya empezó o el aviso ya salió, no envía nada (los
 * recordatorios también respetan el interruptor «Recordatorios por correo»). La invitación y la cancelación llevan el
 * iCalendar (`METHOD:REQUEST` o `METHOD:CANCEL`) y copia al asesor. Si el SMTP falla, la cola reintenta con espera
 * creciente; la cita no cambia.
 */
import { leerAjustesSitio, type PrismaClient } from '@aptio/db';
import { type AvisoAgenda, COLA_AGENDA, type DatosAgenda, ESPERAS_AGENDA_MS, INTENTOS_AGENDA } from '@aptio/colas';
import { enlaceGoogleCalendar, invitacionIcs, textoFechaCita, type CitaCalendario } from '@aptio/schema/agenda';
import { NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { type ConnectionOptions, Worker } from 'bullmq';
import type { Correo, EnviarCorreo } from './correo.js';

export interface OpcionesAgenda { sitioUrl: string; ahora?: () => Date }
export interface ResultadoAviso { estado: 'enviado' | 'omitido'; motivo?: string }

type Cita = NonNullable<Awaited<ReturnType<typeof leerCita>>>;
const leerCita = (bd: PrismaClient, id: string) => bd.agendaCita.findUnique({ where: { id }, include: { tipo: true, asesor: true } });

const CAMPO_ENVIADO: Record<AvisoAgenda, 'invitacionEnviadaEn' | 'recordatorio24hEnviadoEn' | 'recordatorio1hEnviadoEn' | 'cancelacionEnviadaEn'> = {
  invitacion: 'invitacionEnviadaEn', recordatorio24h: 'recordatorio24hEnviadoEn', recordatorio1h: 'recordatorio1hEnviadoEn', cancelacion: 'cancelacionEnviadaEn',
};

const T = {
  es: {
    asunto: { invitacion: 'Tu demo está agendada', recordatorio24h: 'Mañana es tu demo', recordatorio1h: 'Tu demo empieza en 1 hora', cancelacion: 'Tu demo se canceló' },
    hola: (n: string) => `Hola${n ? `, ${n}` : ''}:`,
    cuerpo: {
      invitacion: 'Tu demo quedó confirmada.', recordatorio24h: 'Te recordamos que mañana es tu demo.', recordatorio1h: 'Tu demo empieza en 1 hora.',
      cancelacion: 'Tu demo se canceló. Si quieres, agenda otra fecha en el sitio.',
    },
    cuando: 'Cuándo', duracion: (m: number) => `${m} minutos`, con: 'Con', enlace: 'Enlace de la videollamada', google: 'Añadir a Google Calendar', cancelar: 'Si no puedes asistir, cancela aquí',
    reprogramar: 'Para cambiar la fecha, cancela y vuelve a agendar.', firma: (m: string) => `El equipo de ${m}`,
  },
  en: {
    asunto: { invitacion: 'Your demo is booked', recordatorio24h: 'Your demo is tomorrow', recordatorio1h: 'Your demo starts in 1 hour', cancelacion: 'Your demo was cancelled' },
    hola: (n: string) => `Hi${n ? ` ${n}` : ''},`,
    cuerpo: {
      invitacion: 'Your demo is confirmed.', recordatorio24h: 'A reminder that your demo is tomorrow.', recordatorio1h: 'Your demo starts in 1 hour.',
      cancelacion: 'Your demo was cancelled. You can book another date on our site.',
    },
    cuando: 'When', duracion: (m: number) => `${m} minutes`, con: 'With', enlace: 'Video call link', google: 'Add to Google Calendar', cancelar: "If you can't make it, cancel here",
    reprogramar: 'To change the date, cancel and book again.', firma: (m: string) => `The ${m} team`,
  },
} as const;

export const nombreTipo = (c: Pick<Cita, 'idioma' | 'tipo'>) => (c.idioma === 'en' && c.tipo.nombreEn ? c.tipo.nombreEn : c.tipo.nombreEs);
export const enlaceCancelar = (sitioUrl: string, token: string) => `${sitioUrl.replace(/\/+$/, '')}/_cita?t=${encodeURIComponent(token)}`;

/** Los datos del evento: el UID es fijo por cita para que la cancelación reemplace la invitación en el calendario. */
export function calendarioDe(c: Cita, marca: string, cancelar: string | null): CitaCalendario {
  const t = T[c.idioma === 'en' ? 'en' : 'es'];
  return {
    uid: `cita-${c.id}@aptio`, inicio: c.inicio, fin: c.fin, titulo: `${nombreTipo(c)} · ${marca}`,
    descripcion: [`${t.enlace}: ${c.asesor.enlaceVideollamada}`, ...(cancelar ? [`${t.cancelar}: ${cancelar}`] : [])].join('\n'),
    enlace: c.asesor.enlaceVideollamada, organizador: { nombre: c.asesor.nombre, correo: c.asesor.correo }, asistente: { nombre: c.nombre, correo: c.correo },
    secuencia: c.estado === 'cancelada' ? 1 : 0, creada: c.creadoEn,
  };
}

/** El correo de un aviso: texto plano en el idioma de la cita, siempre con la hora de Lima. */
export function correoDeAviso(c: Cita, aviso: AvisoAgenda, d: { marca: string; cancelar: string | null }): Correo {
  const i = c.idioma === 'en' ? 'en' : 'es';
  const t = T[i];
  const cal = calendarioDe(c, d.marca, d.cancelar);
  const minutos = Math.round((c.fin.getTime() - c.inicio.getTime()) / 60_000);
  const lineas = [
    t.hola(c.nombre), '', t.cuerpo[aviso], '',
    `${nombreTipo(c)} (${t.duracion(minutos)})`,
    `${t.cuando}: ${textoFechaCita(c.inicio, i)}`,
    `${t.con}: ${c.asesor.nombre}`,
    ...(aviso === 'cancelacion' ? [] : [
      `${t.enlace}: ${c.asesor.enlaceVideollamada}`, '',
      `${t.google}: ${enlaceGoogleCalendar(cal)}`,
      ...(d.cancelar ? ['', `${t.cancelar}: ${d.cancelar}`, t.reprogramar] : []),
    ]),
    '', t.firma(d.marca),
  ];
  const conCalendario = aviso === 'invitacion' || aviso === 'cancelacion';
  return {
    para: c.correo, asunto: `${t.asunto[aviso]} · ${nombreTipo(c)}`, texto: lineas.join('\n'),
    ...(conCalendario ? { copia: c.asesor.correo, calendario: { metodo: aviso === 'cancelacion' ? 'CANCEL' : 'REQUEST', contenido: invitacionIcs(cal, aviso === 'cancelacion' ? 'CANCEL' : 'REQUEST'), archivo: 'invitacion.ics' } as const } : {}),
  };
}

/** ¿Este aviso todavía tiene sentido? Devuelve el motivo para no enviarlo, o null. */
export function motivoParaOmitir(c: Cita, aviso: AvisoAgenda, ahora: Date, recordatorios: boolean): string | null {
  if (c[CAMPO_ENVIADO[aviso]]) return 'ya enviado';
  if (aviso === 'cancelacion') return c.estado === 'cancelada' ? null : 'la cita no está cancelada';
  if (c.estado !== 'confirmada') return `la cita está ${c.estado}`;
  if (aviso !== 'invitacion') {
    if (!recordatorios) return 'los recordatorios por correo están apagados';
    if (c.inicio.getTime() <= ahora.getTime()) return 'la cita ya empezó';
  }
  return null;
}

/** Un aviso de la cola: lee la cita, decide si sigue, envía y marca la fecha de envío. */
export async function procesarAvisoAgenda(bd: PrismaClient, datos: DatosAgenda, enviar: EnviarCorreo, op: OpcionesAgenda): Promise<ResultadoAviso> {
  const ahora = (op.ahora ?? (() => new Date()))();
  const c = await leerCita(bd, datos.citaId);
  if (!c) return { estado: 'omitido', motivo: 'la cita no existe' };
  const ajustes = await bd.agendaAjustes.findUnique({ where: { id: 'agenda' } });
  const motivo = motivoParaOmitir(c, datos.aviso, ahora, ajustes?.recordatoriosCorreo ?? true);
  if (motivo) return { estado: 'omitido', motivo };
  const marca = (await leerAjustesSitio(bd).catch(() => null))?.nombre || NOMBRE_POR_DEFECTO;
  const cancelar = datos.token && datos.aviso !== 'cancelacion' ? enlaceCancelar(op.sitioUrl, datos.token) : null;
  await enviar(correoDeAviso(c, datos.aviso, { marca, cancelar }));
  await bd.agendaCita.update({ where: { id: c.id }, data: { [CAMPO_ENVIADO[datos.aviso]]: ahora } });
  return { estado: 'enviado' };
}

export const esperaAgenda = (n: number, esperas: readonly number[] = ESPERAS_AGENDA_MS) => esperas[Math.min(Math.max(n, 1), esperas.length) - 1]!;

/** El trabajador de la cola `agenda`. Las pruebas acortan las esperas y fijan el reloj. */
export function crearTrabajadorAgenda(bd: PrismaClient, enviar: EnviarCorreo, opciones: OpcionesAgenda & { connection: ConnectionOptions; prefix: string; esperas?: readonly number[] }): Worker<DatosAgenda, ResultadoAviso> {
  const esperas = opciones.esperas ?? ESPERAS_AGENDA_MS;
  return new Worker<DatosAgenda, ResultadoAviso>(COLA_AGENDA, (job) => procesarAvisoAgenda(bd, job.data, enviar, opciones), {
    connection: opciones.connection, prefix: opciones.prefix, concurrency: 4, settings: { backoffStrategy: (hechos: number) => esperaAgenda(hechos, esperas) },
  });
}

export { INTENTOS_AGENDA };
