// HU-1605 · Cola `agenda` contra PostgreSQL y Redis reales, con el SMTP simulado y el reloj fijo (RN-17-5, CP-136): la
// invitación sale con la videollamada, el .ics y el enlace para cancelar, con copia al asesor; los recordatorios a las
// 24 h y a 1 h salen una sola vez; una cita cancelada no recibe recordatorios y sí su cancelación (METHOD:CANCEL).
import { COLA_AGENDA, type DatosAgenda, ESPERAS_AGENDA_MS, INTENTOS_AGENDA, opcionesRedis, opcionesTareaAgenda } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { deLima } from '@aptio/schema/agenda';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearTrabajadorAgenda, enlaceCancelar, procesarAvisoAgenda } from '../src/agenda.js';
import type { Correo } from '../src/correo.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PREFIJO = `aptio-pruebas-agenda-${process.pid}`;
const CORREO_VISITANTE = 'visitante-agenda@worker.example';
const SITIO = 'https://aptio.example';
const INICIO = deLima('2026-11-18', '10:00');

function smtp(fallar = 0) {
  const enviados: Correo[] = [];
  let n = 0;
  const enviar = async (c: Correo) => {
    n += 1;
    if (n <= fallar) throw new Error('SMTP caído');
    enviados.push(c);
  };
  return { enviados, enviar };
}

async function cita(datos: { estado?: string; idioma?: string } = {}) {
  const asesor = await prisma.agendaAsesor.create({ data: { nombre: 'Carla Montoya', correo: 'carla@worker.example', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij', ficticio: true } });
  const tipo = await prisma.agendaTipo.create({ data: { nombreEs: 'Demo del generador', nombreEn: 'Generator demo', minutos: 30, ficticio: true, asesores: { connect: { id: asesor.id } } } });
  return prisma.agendaCita.create({
    data: {
      tipoId: tipo.id, asesorId: asesor.id, inicio: INICIO, fin: new Date(INICIO.getTime() + 30 * 60_000), nombre: 'Mariana Paredes', correo: CORREO_VISITANTE,
      empresa: 'Minera Andina', tokenCancelacionHash: `hash-${Math.random()}`, estado: datos.estado ?? 'confirmada', idioma: datos.idioma ?? 'es',
    },
  });
}

async function limpiar() {
  await prisma.agendaCita.deleteMany({ where: { correo: CORREO_VISITANTE } });
  await prisma.agendaTipo.deleteMany({ where: { ficticio: true, nombreEs: 'Demo del generador', citas: { none: {} } } });
  await prisma.agendaAsesor.deleteMany({ where: { correo: 'carla@worker.example' } });
}

describe.skipIf(!hayBase)('cola agenda (HU-1605)', () => {
  beforeEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  it('los reintentos por SMTP son 30 s, 2 min y 8 min y el id es fijo por cita y aviso', () => {
    expect([ESPERAS_AGENDA_MS, INTENTOS_AGENDA]).toEqual([[30_000, 120_000, 480_000], 4]);
    expect(opcionesTareaAgenda('c1', 'recordatorio24h', 5000)).toMatchObject({ jobId: 'agenda-c1-recordatorio24h', delay: 5000, attempts: 4 });
    expect(opcionesTareaAgenda('c1', 'invitacion', -10).delay).toBe(0);
  });

  it('CP-136 · la invitación lleva la videollamada, el .ics REQUEST, Google Calendar y el enlace para cancelar, con copia al asesor', async () => {
    const c = await cita();
    const s = smtp();
    const r = await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'invitacion', token: 'tok-123' }, s.enviar, { sitioUrl: SITIO, ahora: () => deLima('2026-11-16', '10:00') });
    expect(r).toEqual({ estado: 'enviado' });
    const m = s.enviados[0]!;
    expect(m).toMatchObject({ para: CORREO_VISITANTE, copia: 'carla@worker.example', asunto: 'Tu demo está agendada · Demo del generador' });
    expect(m.texto).toContain('miércoles 18 de noviembre de 2026, 10:00 (hora de Lima)');
    expect(m.texto).toContain('https://meet.google.com/abc-defg-hij');
    expect(m.texto).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(m.texto).toContain(enlaceCancelar(SITIO, 'tok-123'));
    expect(m.calendario?.metodo).toBe('REQUEST');
    expect(m.calendario?.contenido.replace(/\r\n /g, '')).toContain(`UID:cita-${c.id}@aptio`);
    expect((await prisma.agendaCita.findUniqueOrThrow({ where: { id: c.id } })).invitacionEnviadaEn).not.toBeNull();
    // Ya enviada: un trabajo repetido no la manda otra vez.
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'invitacion', token: 'tok-123' }, s.enviar, { sitioUrl: SITIO })).toEqual({ estado: 'omitido', motivo: 'ya enviado' });
    expect(s.enviados).toHaveLength(1);
  });

  it('CP-136 · los recordatorios a las 24 h y a 1 h salen una sola vez, en el idioma de la cita y sin .ics', async () => {
    const c = await cita({ idioma: 'en' });
    const s = smtp();
    const op = { sitioUrl: SITIO, ahora: () => deLima('2026-11-17', '10:00') };
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'recordatorio24h', token: 't' }, s.enviar, op)).toEqual({ estado: 'enviado' });
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'recordatorio1h', token: 't' }, s.enviar, { ...op, ahora: () => deLima('2026-11-18', '09:00') })).toEqual({ estado: 'enviado' });
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'recordatorio1h', token: 't' }, s.enviar, op)).toMatchObject({ estado: 'omitido' });
    expect(s.enviados.map((m) => m.asunto)).toEqual(['Your demo is tomorrow · Generator demo', 'Your demo starts in 1 hour · Generator demo']);
    expect(s.enviados[0]!.texto).toContain('Wednesday, November 18, 2026, 10:00 (Lima time)');
    expect(s.enviados.every((m) => !m.calendario && !m.copia)).toBe(true);
    const f = await prisma.agendaCita.findUniqueOrThrow({ where: { id: c.id } });
    expect([f.recordatorio24hEnviadoEn, f.recordatorio1hEnviadoEn].every(Boolean)).toBe(true);
  });

  it('CP-136 · una cita cancelada no recibe recordatorios y sí la cancelación con METHOD:CANCEL; una que ya empezó tampoco recibe recordatorios', async () => {
    const c = await cita({ estado: 'cancelada' });
    const s = smtp();
    const op = { sitioUrl: SITIO, ahora: () => deLima('2026-11-17', '10:00') };
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'recordatorio24h', token: 't' }, s.enviar, op)).toEqual({ estado: 'omitido', motivo: 'la cita está cancelada' });
    expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'cancelacion' }, s.enviar, op)).toEqual({ estado: 'enviado' });
    expect(s.enviados).toHaveLength(1);
    expect(s.enviados[0]).toMatchObject({ asunto: 'Tu demo se canceló · Demo del generador', copia: 'carla@worker.example', calendario: { metodo: 'CANCEL' } });
    expect(s.enviados[0]!.calendario!.contenido).toContain('STATUS:CANCELLED');
    expect(s.enviados[0]!.texto).not.toContain('_cita?t=');

    const empezada = await cita();
    expect(await procesarAvisoAgenda(prisma, { citaId: empezada.id, aviso: 'recordatorio1h', token: 't' }, s.enviar, { sitioUrl: SITIO, ahora: () => deLima('2026-11-18', '10:05') })).toEqual({ estado: 'omitido', motivo: 'la cita ya empezó' });
  });

  it('con los recordatorios apagados en el panel no sale ninguno; la invitación sí', async () => {
    const previo = await prisma.agendaAjustes.findUnique({ where: { id: 'agenda' } });
    await prisma.agendaAjustes.upsert({ where: { id: 'agenda' }, create: { recordatoriosCorreo: false }, update: { recordatoriosCorreo: false } });
    try {
      const c = await cita();
      const s = smtp();
      const op = { sitioUrl: SITIO, ahora: () => deLima('2026-11-17', '10:00') };
      expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'recordatorio24h', token: 't' }, s.enviar, op)).toEqual({ estado: 'omitido', motivo: 'los recordatorios por correo están apagados' });
      expect(await procesarAvisoAgenda(prisma, { citaId: c.id, aviso: 'invitacion', token: 't' }, s.enviar, op)).toEqual({ estado: 'enviado' });
    } finally {
      if (previo) await prisma.agendaAjustes.update({ where: { id: 'agenda' }, data: { recordatoriosCorreo: previo.recordatoriosCorreo } });
      else await prisma.agendaAjustes.delete({ where: { id: 'agenda' } });
    }
  });

  it('por la cola: si el SMTP falla, reintenta con espera creciente y la invitación sale sin tocar la cita', async () => {
    const c = await cita();
    const s = smtp(2);
    const cola = new Queue<DatosAgenda>(COLA_AGENDA, { connection: opcionesRedis(), prefix: PREFIJO });
    const eventos = new QueueEvents(COLA_AGENDA, { connection: opcionesRedis(), prefix: PREFIJO });
    const trabajador = crearTrabajadorAgenda(prisma, s.enviar, { sitioUrl: SITIO, connection: opcionesRedis(), prefix: PREFIJO, esperas: [10, 20, 40] });
    try {
      await eventos.waitUntilReady();
      const job = await cola.add('agenda-aviso', { citaId: c.id, aviso: 'invitacion', token: 'tok' }, opcionesTareaAgenda(c.id, 'invitacion'));
      expect(await job.waitUntilFinished(eventos, 10_000)).toEqual({ estado: 'enviado' });
      expect(s.enviados).toHaveLength(1);
      const f = await prisma.agendaCita.findUniqueOrThrow({ where: { id: c.id } });
      expect(f.estado).toBe('confirmada');
      expect(f.invitacionEnviadaEn).not.toBeNull();
      // Dos intentos fallidos y el tercero que entró.
      expect((await cola.getJob(job.id!))?.attemptsMade).toBe(3);
    } finally {
      await trabajador.close();
      await eventos.close();
      await cola.obliterate({ force: true });
      await cola.close();
    }
  });
});
