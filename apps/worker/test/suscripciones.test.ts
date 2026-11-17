// HU-1703 · Cola `suscripciones` contra PostgreSQL y Redis reales, con el SMTP simulado (CP-143): la bienvenida sale con
// el plan, el total con IGV, el comprobante y el enlace para crear la clave; una solicitud sin alta no recibe correo; si
// el SMTP falla, la cola reintenta y el correo sale una sola vez.
import { COLA_SUSCRIPCIONES, type DatosBienvenida, INTENTOS_SUSCRIPCIONES, opcionesRedis, opcionesTareaBienvenida } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearTrabajadorSuscripciones, procesarBienvenida } from '../src/suscripciones.js';
import type { Correo } from '../src/correo.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PREFIJO = `aptio-pruebas-suscripciones-${process.pid}`;
const SLUG = `plan-worker-${process.pid}`;
const CORREO = 'admin-bienvenida@worker.example';
const ENLACE = 'https://app.aptio.example/clave?token=abc';

function smtp(fallar = 0) {
  const enviados: Correo[] = [];
  let n = 0;
  return { enviados, enviar: async (c: Correo) => { n += 1; if (n <= fallar) throw new Error('SMTP caído'); enviados.push(c); } };
}

async function limpiar() {
  const orgs = (await prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: CORREO }, select: { organizacionId: true } })).map((s) => s.organizacionId).filter((x): x is string => !!x);
  await prisma.suscripcion.deleteMany({ where: { plan: { slug: SLUG } } });
  await prisma.solicitudSuscripcion.deleteMany({ where: { correoAdmin: CORREO } });
  await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  await prisma.plan.deleteMany({ where: { slug: SLUG } });
}

async function solicitud(aprobada: boolean, ruc: string | null = '20131312955') {
  const plan = await prisma.plan.upsert({ where: { slug: SLUG }, create: { slug: SLUG, nombre: 'Productora', precioMes: 1290 }, update: {} });
  const s = await prisma.solicitudSuscripcion.create({
    data: {
      planId: plan.id, ciclo: 'MENSUAL', razonSocial: 'Minera Andina SAC', ruc, tipoComprobante: ruc ? 'FACTURA' : 'BOLETA', nombreAdmin: 'Ana Quispe', correoAdmin: CORREO,
      subtotal: 1290, igv: 232.2, total: 1522.2, pasarela: 'prueba', estado: aprobada ? 'APROBADA' : 'RECHAZADA',
    },
  });
  if (!aprobada) return s;
  const org = await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `minera-worker-${s.id.slice(0, 8)}` } });
  await prisma.suscripcion.create({
    data: { organizacionId: org.id, planId: plan.id, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, inicioPeriodo: new Date('2026-11-17T15:00:00Z'), finPeriodo: new Date('2026-12-17T15:00:00Z'), pasarela: 'prueba', solicitudId: s.id },
  });
  return prisma.solicitudSuscripcion.update({ where: { id: s.id }, data: { organizacionId: org.id } });
}

describe.skipIf(!hayBase)('cola suscripciones (HU-1703)', () => {
  beforeEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  it('el id es fijo por solicitud y hay 3 reintentos', () => {
    expect(opcionesTareaBienvenida('s1')).toMatchObject({ jobId: 'bienvenida-s1', attempts: INTENTOS_SUSCRIPCIONES });
    expect(INTENTOS_SUSCRIPCIONES).toBe(4);
  });

  it('CP-143 · la bienvenida lleva el plan, el total con IGV, el período, la factura y el enlace para crear la clave', async () => {
    const s = await solicitud(true);
    const correo = smtp();
    expect(await procesarBienvenida(prisma, { solicitudId: s.id, enlace: ENLACE }, correo.enviar)).toEqual({ estado: 'enviado' });
    expect(correo.enviados).toHaveLength(1);
    const c = correo.enviados[0]!;
    expect(c.para).toBe(CORREO);
    expect(c.asunto).toBe('Bienvenido a Aptio SCORM · Plan Productora');
    expect(c.texto).toContain('Hola, Ana Quispe:');
    expect(c.texto).toContain('Plan: Productora (mensual)');
    expect(c.texto).toContain('Total pagado: S/ 1,522.20 (incluye IGV de 18 %)');
    expect(c.texto).toContain('Período pagado hasta el 17 de diciembre de 2026');
    expect(c.texto).toContain('factura a nombre del RUC 20131312955');
    expect(c.texto).toContain(ENLACE);
  });

  it('HU-1704 · una suscripción en dólares muestra el total en USD', async () => {
    const s = await solicitud(true);
    await prisma.solicitudSuscripcion.update({ where: { id: s.id }, data: { moneda: 'USD', subtotal: 349, igv: 62.82, total: 411.82 } });
    const correo = smtp();
    await procesarBienvenida(prisma, { solicitudId: s.id, enlace: ENLACE }, correo.enviar);
    expect(correo.enviados[0]!.texto).toContain('Total pagado: US$ 411.82 (incluye IGV de 18 %)');
  });

  it('una solicitud rechazada o sin organización no recibe correo', async () => {
    const s = await solicitud(false);
    const correo = smtp();
    expect((await procesarBienvenida(prisma, { solicitudId: s.id, enlace: ENLACE }, correo.enviar)).estado).toBe('omitido');
    expect((await procesarBienvenida(prisma, { solicitudId: '00000000-0000-4000-8000-000000000000', enlace: ENLACE }, correo.enviar)).motivo).toBe('la solicitud no existe');
    expect(correo.enviados).toHaveLength(0);
  });

  it('si el SMTP falla, la cola reintenta y la bienvenida sale una vez', async () => {
    const s = await solicitud(true, null);
    const correo = smtp(1);
    const cola = new Queue<DatosBienvenida>(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: PREFIJO });
    const eventos = new QueueEvents(COLA_SUSCRIPCIONES, { connection: opcionesRedis(), prefix: PREFIJO });
    const trabajador = crearTrabajadorSuscripciones(prisma, correo.enviar, { connection: opcionesRedis(), prefix: PREFIJO, esperas: [50, 50, 50] });
    try {
      await eventos.waitUntilReady();
      const job = await cola.add('suscripcion-bienvenida', { solicitudId: s.id, enlace: ENLACE }, opcionesTareaBienvenida(s.id));
      await cola.add('suscripcion-bienvenida', { solicitudId: s.id, enlace: ENLACE }, opcionesTareaBienvenida(s.id));
      await job.waitUntilFinished(eventos, 10_000);
      expect(correo.enviados).toHaveLength(1);
      expect(correo.enviados[0]!.texto).toContain('Comprobante: boleta de venta');
    } finally {
      await trabajador.close();
      await cola.obliterate({ force: true });
      await cola.close();
      await eventos.close();
    }
  });
});
