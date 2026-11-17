// HU-1708 · Cobranza y suspensión contra PostgreSQL real (REQ-088, CP-150, RN-18-8), con el SMTP simulado y el reloj
// fijo: tres reintentos fallidos y suspensión el día 10; el pago tardío que reactiva; el cobro de pruebas aprobado;
// el enlace por correo con Stripe; la idempotencia; la cancelación al fin sin renovar y la bajada aplicada.
import { prisma, resolverPagoRenovacion } from '@aptio/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { avanzarRenovacion, intentoManual, type OpcionesCobranza, renovarSuscripciones } from '../src/cobranza.js';
import type { Correo } from '../src/correo.js';

const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const PID = process.pid;
const SLUG = `cobranza-productora-${PID}`;
const SLUG_INICIAL = `cobranza-inicial-${PID}`;
const FIN = new Date('2026-12-10T15:00:00Z');
const dia = (n: number, horas = 0) => new Date(FIN.getTime() + n * 86_400_000 + horas * 3_600_000);
const orgs: string[] = [];

function entorno(precio: number | null = 490) {
  const enviados: Correo[] = [];
  const comprobantes: string[] = [];
  const o: OpcionesCobranza = {
    enviar: async (c) => { enviados.push(c); }, encolarComprobante: async (id) => { comprobantes.push(id); }, entorno: 'pruebas', webUrl: 'https://app.aptio.example',
    precio: async () => precio, organizaciones: orgs,
  };
  return { o, enviados, comprobantes };
}

async function limpiar() {
  const ids = (await prisma.organizacion.findMany({ where: { slug: { startsWith: `cobranza-${PID}-` } }, select: { id: true } })).map((x) => x.id);
  await prisma.auditoria.deleteMany({ where: { organizacionId: { in: ids } } });
  await prisma.cobro.deleteMany({ where: { renovacion: { organizacionId: { in: ids } } } });
  await prisma.renovacion.deleteMany({ where: { organizacionId: { in: ids } } });
  await prisma.suscripcion.deleteMany({ where: { organizacionId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { organizacionId: { in: ids } } });
  await prisma.organizacion.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { slug: { in: [SLUG, SLUG_INICIAL] } } });
  orgs.length = 0;
}

async function suscripcion(datos: { pasarela?: string; ultimos4?: string | null; cancelarAlFin?: boolean; bajada?: boolean } = {}) {
  const plan = await prisma.plan.upsert({ where: { slug: SLUG }, create: { slug: SLUG, nombre: 'Productora', precioMes: 1290 }, update: {} });
  const inicial = await prisma.plan.upsert({ where: { slug: SLUG_INICIAL }, create: { slug: SLUG_INICIAL, nombre: 'Inicial', precioMes: 490 }, update: {} });
  const org = await prisma.organizacion.create({ data: { nombre: 'Minera Andina SAC', slug: `cobranza-${PID}-${orgs.length}-${Math.random().toString(36).slice(2, 8)}` } });
  orgs.push(org.id);
  await prisma.usuario.create({ data: { email: `admin-${org.slug}@worker.example`, nombre: 'Ana Quispe', rol: 'ADMINISTRADOR', organizacionId: org.id } });
  return prisma.suscripcion.create({
    data: {
      organizacionId: org.id, planId: plan.id, ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, inicioPeriodo: new Date('2026-11-10T15:00:00Z'), finPeriodo: FIN,
      pasarela: datos.pasarela ?? 'pruebas', ultimos4Digitos: datos.ultimos4 === undefined ? '1111' : datos.ultimos4, cancelarAlFin: datos.cancelarAlFin ?? false,
      planProgramadoId: datos.bajada ? inicial.id : null,
    },
  });
}

const leer = (id: string) => prisma.suscripcion.findUniqueOrThrow({ where: { id }, include: { renovaciones: true } });
const acciones = async (organizacionId: string) => (await prisma.auditoria.findMany({ where: { organizacionId }, orderBy: { creadoEn: 'asc' }, select: { accion: true } })).map((a) => a.accion);

describe.skipIf(!hayBase)('cobranza (HU-1708)', () => {
  beforeEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  it('CP-150 · con la tarjeta que rechaza: intento el día 0, reintentos 1, 3 y 7 y suspensión el día 10', async () => {
    const s = await suscripcion({ ultimos4: '0002' });
    const { o, enviados, comprobantes } = entorno();
    expect(await renovarSuscripciones(prisma, o, dia(0, -1))).toEqual({ canceladas: 0, creadas: 0, intentos: 0, cobradas: 0, suspendidas: 0 });
    expect(await renovarSuscripciones(prisma, o, dia(0))).toEqual({ canceladas: 0, creadas: 1, intentos: 1, cobradas: 0, suspendidas: 0 });
    let t = await leer(s.id);
    expect(t.estado).toBe('PAGO_PENDIENTE');
    expect(t.renovaciones).toHaveLength(1);
    const r = t.renovaciones[0]!;
    expect(r).toMatchObject({ estado: 'PENDIENTE', intentos: 1, periodoInicio: FIN, periodoFin: new Date('2027-01-10T15:00:00Z'), moneda: 'PEN', motivoRechazo: 'la tarjeta de prueba fue rechazada' });
    expect([Number(r.montoSinIgv), Number(r.igv), Number(r.total)]).toEqual([1290, 232.2, 1522.2]);
    expect(r.proximoIntento).toEqual(dia(1));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.para).toMatch(/^admin-cobranza-/);
    expect(enviados[0]!.texto).toContain('No pudimos cobrar la renovación del plan Productora');
    expect(enviados[0]!.texto).toContain(`https://app.aptio.example/plan?renovacion=${r.id}`);
    expect(enviados[0]!.texto).toContain('S/ 1,522.20 (incluye IGV de 18 %)');
    expect(enviados[0]!.texto).toContain('el 20 de diciembre de 2026 la cuenta queda en solo lectura');

    // La misma corrida otra vez, o antes de la fecha del siguiente intento: no hace nada.
    expect(await renovarSuscripciones(prisma, o, dia(0, 12))).toMatchObject({ creadas: 0, intentos: 0 });
    for (const [n, intentos] of [[1, 2], [3, 3], [7, 4]] as const) {
      expect(await renovarSuscripciones(prisma, o, dia(n))).toMatchObject({ intentos: 1, suspendidas: 0 });
      expect((await leer(s.id)).renovaciones[0]!.intentos).toBe(intentos);
    }
    expect(await renovarSuscripciones(prisma, o, dia(9, 23))).toMatchObject({ intentos: 0, suspendidas: 0 });
    expect(await renovarSuscripciones(prisma, o, dia(10))).toMatchObject({ intentos: 0, suspendidas: 1 });
    t = await leer(s.id);
    expect(t.estado).toBe('SUSPENDIDA');
    expect(t.renovaciones[0]).toMatchObject({ estado: 'VENCIDA', proximoIntento: null, suspendidaEn: dia(10) });
    expect(enviados).toHaveLength(5);
    expect(enviados[4]!.asunto).toBe('Tu cuenta de Aptio SCORM está en solo lectura');
    expect(comprobantes).toEqual([]);
    expect(await renovarSuscripciones(prisma, o, dia(11))).toMatchObject({ creadas: 0, intentos: 0, suspendidas: 0 });
    const a = await acciones(s.organizacionId);
    expect(a.filter((x) => x === 'RENOVACION_INTENTO')).toHaveLength(4);
    expect(a.filter((x) => x === 'RENOVACION_PAGO_RECHAZADO')).toHaveLength(4);
    expect(a.filter((x) => x === 'SUSCRIPCION_SUSPENDIDA')).toHaveLength(1);
  });

  it('el pago tardío reactiva la cuenta suspendida con un período nuevo desde el día del pago, una sola vez', async () => {
    const s = await suscripcion({ ultimos4: '0002' });
    const { o } = entorno();
    for (const n of [0, 1, 3, 7, 10]) await renovarSuscripciones(prisma, o, dia(n));
    const r = (await leer(s.id)).renovaciones[0]!;
    const pago = { pasarela: 'pruebas', eventoId: `evt-tardio-${r.id}`, resultado: 'aprobado' as const, monto: 1522.2, moneda: 'PEN', ultimos4: '1111' };
    const res = await prisma.$transaction((tx) => resolverPagoRenovacion(tx, r.id, pago, dia(12)));
    expect(res).toMatchObject({ desenlace: 'reactivada', duplicado: false });
    const t = await leer(s.id);
    expect(t).toMatchObject({ estado: 'ACTIVA', inicioPeriodo: dia(12), finPeriodo: new Date('2027-01-22T15:00:00Z'), ultimos4Digitos: '1111' });
    expect(t.renovaciones[0]).toMatchObject({ estado: 'APROBADA', eventoPagoId: pago.eventoId, periodoInicio: dia(12) });
    const cobro = await prisma.cobro.findUniqueOrThrow({ where: { id: res.cobroId! } });
    expect(cobro).toMatchObject({ renovacionId: r.id, suscripcionId: s.id, eventoPagoId: pago.eventoId, ultimos4Digitos: '1111' });
    expect(await prisma.$transaction((tx) => resolverPagoRenovacion(tx, r.id, pago, dia(12, 1)))).toEqual({ desenlace: 'duplicado', duplicado: true, cobroId: null });
    // Otro pago aprobado de la misma renovación ya pagada: queda como cobro sin suscripción, para reembolsarlo.
    const otro = await prisma.$transaction((tx) => resolverPagoRenovacion(tx, r.id, { ...pago, eventoId: `evt-otro-${r.id}` }, dia(12, 2)));
    expect(otro.desenlace).toBe('sin-renovacion');
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: otro.cobroId! } })).suscripcionId).toBeNull();
    expect(await acciones(s.organizacionId)).toContain('SUSCRIPCION_REACTIVADA');
    // La siguiente renovación se ancla al período nuevo.
    expect(await renovarSuscripciones(prisma, o, new Date('2027-01-22T15:00:00Z'))).toMatchObject({ creadas: 1 });
  });

  it('pagado antes del día 10, el período nuevo se ancla al fin del anterior', async () => {
    const s = await suscripcion({ pasarela: 'stripe' });
    const { o } = entorno();
    await renovarSuscripciones(prisma, o, dia(0));
    const r = (await leer(s.id)).renovaciones[0]!;
    const res = await prisma.$transaction((tx) => resolverPagoRenovacion(tx, r.id, { pasarela: 'stripe', eventoId: `evt-a-tiempo-${r.id}`, resultado: 'aprobado', monto: 1522.2, moneda: 'PEN' }, dia(4)));
    expect(res.desenlace).toBe('renovada');
    expect(await leer(s.id)).toMatchObject({ estado: 'ACTIVA', inicioPeriodo: FIN, finPeriodo: new Date('2027-01-10T15:00:00Z') });
    // Un monto distinto no renueva: el cobro queda sin suscripción.
    const s2 = await suscripcion({ pasarela: 'stripe' });
    await renovarSuscripciones(prisma, o, dia(0));
    const r2 = (await leer(s2.id)).renovaciones[0]!;
    const mal = await prisma.$transaction((tx) => resolverPagoRenovacion(tx, r2.id, { pasarela: 'stripe', eventoId: `evt-mal-${r2.id}`, resultado: 'aprobado', monto: 100, moneda: 'PEN' }, dia(1)));
    expect(mal.desenlace).toBe('monto-distinto');
    expect((await leer(s2.id)).estado).toBe('PAGO_PENDIENTE');
  });

  it('con la pasarela de pruebas y la tarjeta que aprueba, cobra el día 0 y encola el comprobante', async () => {
    const s = await suscripcion();
    const { o, enviados, comprobantes } = entorno();
    expect(await renovarSuscripciones(prisma, o, dia(0, 2))).toMatchObject({ creadas: 1, intentos: 1, cobradas: 1 });
    const t = await leer(s.id);
    expect(t).toMatchObject({ estado: 'ACTIVA', inicioPeriodo: FIN, finPeriodo: new Date('2027-01-10T15:00:00Z') });
    const cobros = await prisma.cobro.findMany({ where: { renovacionId: t.renovaciones[0]!.id } });
    expect(cobros).toHaveLength(1);
    expect(comprobantes).toEqual([cobros[0]!.id]);
    expect(enviados).toHaveLength(0);
    expect(await acciones(s.organizacionId)).toEqual(['RENOVACION_CREADA', 'RENOVACION_INTENTO', 'SUSCRIPCION_RENOVADA']);
  });

  it('con Stripe o Culqi, cada intento manda el enlace a «Pagar ahora» sin cobrar', async () => {
    const s = await suscripcion({ pasarela: 'culqi' });
    const { o, enviados, comprobantes } = entorno();
    await renovarSuscripciones(prisma, o, dia(0));
    await renovarSuscripciones(prisma, o, dia(1));
    expect(enviados.map((c) => c.asunto)).toEqual(['Renueva tu plan de Aptio SCORM · S/ 1,522.20', 'Renueva tu plan de Aptio SCORM · S/ 1,522.20']);
    expect(enviados[0]!.texto).toContain('terminó el 10 de diciembre de 2026');
    expect(comprobantes).toEqual([]);
    expect(await prisma.cobro.count({ where: { renovacion: { suscripcionId: s.id } } })).toBe(0);
    // «Reintentar ahora» avisa otra vez sin adelantar el calendario.
    expect(await intentoManual(prisma, o, (await leer(s.id)).renovaciones[0]!.id, dia(2))).toBe('avisada');
    expect((await leer(s.id)).renovaciones[0]).toMatchObject({ intentos: 2, proximoIntento: dia(3) });
    expect(enviados).toHaveLength(3);
  });

  it('el «Reintentar ahora» de pruebas cobra y reactiva aunque esté suspendida', async () => {
    const s = await suscripcion({ ultimos4: '0002' });
    const { o, comprobantes } = entorno();
    for (const n of [0, 1, 3, 7, 10]) await renovarSuscripciones(prisma, o, dia(n));
    await prisma.suscripcion.update({ where: { id: s.id }, data: { ultimos4Digitos: '1111' } });
    expect(await intentoManual(prisma, o, (await leer(s.id)).renovaciones[0]!.id, dia(15))).toBe('cobrada');
    expect(await leer(s.id)).toMatchObject({ estado: 'ACTIVA', inicioPeriodo: dia(15) });
    expect(comprobantes).toHaveLength(1);
  });

  it('dos corridas a la vez crean una sola renovación y un solo intento', async () => {
    const s = await suscripcion({ pasarela: 'stripe' });
    const { o, enviados } = entorno();
    const [a, b] = await Promise.all([renovarSuscripciones(prisma, o, dia(0)), renovarSuscripciones(prisma, o, dia(0))]);
    expect(a.creadas + b.creadas).toBe(1);
    expect(a.intentos + b.intentos).toBe(1);
    expect((await leer(s.id)).renovaciones).toHaveLength(1);
    expect(enviados).toHaveLength(1);
    const r = (await leer(s.id)).renovaciones[0]!;
    expect(await avanzarRenovacion(prisma, o, r.id, dia(0, 5))).toBe('esperar');
  });

  it('con cancelarAlFin no se renueva: pasa a CANCELADA', async () => {
    const s = await suscripcion({ cancelarAlFin: true });
    const { o } = entorno();
    expect(await renovarSuscripciones(prisma, o, dia(0))).toMatchObject({ canceladas: 1, creadas: 0 });
    const t = await leer(s.id);
    expect(t.estado).toBe('CANCELADA');
    expect(t.renovaciones).toHaveLength(0);
  });

  it('aplica la bajada programada al precio publicado vigente del plan nuevo', async () => {
    const s = await suscripcion({ pasarela: 'stripe', bajada: true });
    const { o } = entorno(490);
    await renovarSuscripciones(prisma, o, dia(0));
    const t = await prisma.suscripcion.findUniqueOrThrow({ where: { id: s.id }, include: { plan: true, renovaciones: { include: { plan: true } } } });
    expect(t).toMatchObject({ estado: 'PAGO_PENDIENTE', planProgramadoId: null, precioPactadoSinIgv: 490 });
    expect(t.plan.slug).toBe(SLUG_INICIAL);
    expect(t.renovaciones[0]!.plan.slug).toBe(SLUG_INICIAL);
    expect(Number(t.renovaciones[0]!.total)).toBe(578.2);
    // Si el plan de la bajada ya no se cobra en ese ciclo, se renueva al pactado.
    const s2 = await suscripcion({ pasarela: 'stripe', bajada: true });
    await renovarSuscripciones(prisma, entorno(null).o, dia(0));
    const t2 = await prisma.suscripcion.findUniqueOrThrow({ where: { id: s2.id }, include: { plan: true, renovaciones: true } });
    expect(t2).toMatchObject({ planProgramadoId: null, precioPactadoSinIgv: 1290 });
    expect(t2.plan.slug).toBe(SLUG);
    expect(Number(t2.renovaciones[0]!.total)).toBe(1522.2);
  });
});
