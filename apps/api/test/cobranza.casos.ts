// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas (las pasarelas son globales).
// HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8, PNT-36) contra PostgreSQL y Redis:
// - el aviso global de cobranza para cualquier rol, y la renovación en la suscripción del administrador;
// - con el pago pendiente se sigue trabajando; suspendida, la escritura responde 403 SUSCRIPCION_SUSPENDIDA (generar,
//   crear) y la lectura, la exportación y el pago siguen (200/404, nunca 403);
// - «Pagar ahora» con la pasarela de pruebas: la tarjeta que rechaza no cambia nada; la que aprueba reactiva con un
//   período nuevo desde el pago, deja el cobro de la renovación y su comprobante en cola; el evento repetido no duplica;
// - Ventas › Suscripciones del superadmin con el filtro, «Reintentar ahora» (encolado y auditado) y el aislamiento.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type DatosTrabajo, type NombreCola, TAREA_INTENTO_RENOVACION } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';
import { CobranzaService } from '../src/ventas/cobranza.service.js';
import { SuscripcionesService } from '../src/ventas/suscripciones.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-cobranza';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@cobranza.test`;
const VARIABLES = ['SITIO_ENTORNO', 'PAGO_PRUEBA_SECRETO', 'WEB_URL'] as const;
const DIA = 86_400_000;
const NADA = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hayBase && !process.env.CI)('cobranza y suspensión (HU-1708)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId = '';
  let otraId = '';
  let clienteId = '';
  let adminId = '';
  let suscripcionId = '';
  let otraSuscripcionId = '';
  let renovacionId = '';
  let proyectoId = '';
  let fin = new Date();
  const cookies: Record<string, string> = {};
  const originales: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};
  let pasarelasPrevias: Awaited<ReturnType<typeof prisma.pasarelaConfig.findMany>> = [];
  const colas = { encolar: (_c: NombreCola, _d: DatosTrabajo, _j?: string) => Promise.resolve() };

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  beforeAll(async () => {
    for (const v of VARIABLES) originales[v] = process.env[v];
    Object.assign(process.env, { SITIO_ENTORNO: 'pruebas', PAGO_PRUEBA_SECRETO: SECRETO, WEB_URL: 'https://consola.aptio.example' });
    pasarelasPrevias = await prisma.pasarelaConfig.findMany();
    await prisma.pasarelaConfig.deleteMany(); // por defecto: solo la de pruebas, visible
    const plan = await prisma.plan.create({ data: { slug: `productora-${sufijo}`, nombre: 'Productora', precioMes: 1290, capsulasMes: 20, visible: true, orden: 90 } });
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Estudio Quipu', slug: `quipu-cobranza-${sufijo}` } })).id;
    otraId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `otra-cobranza-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (n: string, rol: Rol, organizacionId: string | null = orgId) => prisma.usuario.create({ data: { nombre: n, email: correoDe(n), rol, organizacionId, hashClave, emailVerificado: true } });
    adminId = (await crear('admin', Rol.ADMINISTRADOR)).id;
    await crear('productor', Rol.PRODUCTOR);
    await crear('otro-admin', Rol.ADMINISTRADOR, otraId);
    await crear('super', Rol.SUPERADMIN, null);
    // El período terminó hace 11 días: el worker ya creó la renovación (como lo hace `renovar-suscripciones`).
    fin = new Date(Date.now() - 11 * DIA);
    const base = { planId: plan.id, ciclo: 'MENSUAL' as const, precioPactadoSinIgv: 1290, moneda: 'PEN', inicioPeriodo: new Date(fin.getTime() - 30 * DIA), finPeriodo: fin, pasarela: 'pruebas', ultimos4Digitos: '0002' };
    suscripcionId = (await prisma.suscripcion.create({ data: { ...base, organizacionId: orgId } })).id;
    otraSuscripcionId = (await prisma.suscripcion.create({ data: { ...base, organizacionId: otraId, finPeriodo: new Date(Date.now() + 10 * DIA) } })).id;
    renovacionId = (await prisma.renovacion.create({
      data: {
        organizacionId: orgId, suscripcionId, planId: plan.id, periodoInicio: fin, periodoFin: new Date(fin.getTime() + 31 * DIA), montoSinIgv: 1290, igv: 232.2, total: 1522.2,
        moneda: 'PEN', pasarela: 'pruebas', intentos: 1, proximoIntento: new Date(fin.getTime() + DIA),
      },
    })).id;
    const p = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'LOTO', creadoPorId: adminId, pantallasObjetivo: 10 } });
    await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'TEMA', tema: 'LOTO', estado: 'listo' } });
    proyectoId = p.id;
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'productor', 'otro-admin', 'super']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    const cobros = (await prisma.cobro.findMany({ where: { renovacion: { organizacionId: { in: [orgId, otraId] } } }, select: { id: true } })).map((c) => c.id);
    const colaComprobantes = app?.get(SuscripcionesService).colaComprobantes;
    if (colaComprobantes) for (const id of cobros) await colaComprobantes.remove(id).catch(() => undefined);
    const colaSuscripciones = app?.get(CobranzaService).colaSuscripciones;
    if (colaSuscripciones) for (const j of await colaSuscripciones.getJobs(['waiting', 'delayed', 'prioritized'])) if (j?.data.renovacionId === renovacionId) await j.remove().catch(() => undefined);
    await app?.close();
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraId] } } });
    await prisma.consumoCapsula.deleteMany({ where: { organizacionId: orgId } });
    await prisma.generacion.deleteMany({ where: { proyectoId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.renovacion.deleteMany({ where: { organizacionId: { in: [orgId, otraId] } } });
    await prisma.suscripcion.deleteMany({ where: { id: { in: [suscripcionId, otraSuscripcionId] } } });
    const usuarios = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@cobranza.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: [orgId, otraId] } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraId] } } });
    await prisma.plan.deleteMany({ where: { slug: `productora-${sufijo}` } });
    await prisma.pasarelaConfig.deleteMany();
    if (pasarelasPrevias.length) await prisma.pasarelaConfig.createMany({ data: pasarelasPrevias });
  });

  it('al día, el aviso no aparece y la suscripción no trae renovación', async () => {
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { estado: 'ACTIVA' } });
    expect((await como('productor').get('/organizacion/cobranza')).body).toMatchObject({ estado: 'AL_DIA', puedePagar: false, regularizar: '/plan' });
    expect((await como('super').get('/organizacion/cobranza')).body.estado).toBe('AL_DIA');
    expect((await como('admin').get('/organizacion/suscripcion')).body).toMatchObject({ estado: 'ACTIVA', renovacion: null });
    expect((await como('admin').post('/organizacion/suscripcion/renovacion/pago')).body.codigo).toBe('SIN_PAGO_PENDIENTE');
  });

  it('con el pago pendiente, el aviso lo ven todos y se sigue trabajando', async () => {
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { estado: 'PAGO_PENDIENTE' } });
    const aviso = await como('productor').get('/organizacion/cobranza');
    expect(aviso.status).toBe(200);
    expect(aviso.body).toMatchObject({ estado: 'PAGO_PENDIENTE', total: 1522.2, moneda: 'PEN', finPeriodo: fin.toISOString(), puedePagar: false });
    expect(aviso.body.suspensionEn).toBe(new Date(fin.getTime() + 10 * DIA).toISOString());
    expect((await como('admin').get('/organizacion/cobranza')).body.puedePagar).toBe(true);
    const s = await como('admin').get('/organizacion/suscripcion');
    expect(s.body).toMatchObject({ estado: 'PAGO_PENDIENTE', renovacion: { id: renovacionId, estado: 'PENDIENTE', total: 1522.2, intentos: 1, plan: { nombre: 'Productora' } } });
    expect((await como('productor').post(`/proyectos/${proyectoId}/generaciones`)).status).toBe(202);
  });

  it('CP-150 · suspendida: la escritura responde 403 SUSCRIPCION_SUSPENDIDA; leer, exportar y pagar siguen', async () => {
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { estado: 'SUSPENDIDA' } });
    await prisma.renovacion.update({ where: { id: renovacionId }, data: { estado: 'VENCIDA', intentos: 4, proximoIntento: null, suspendidaEn: new Date(fin.getTime() + 10 * DIA) } });
    const generar = await como('productor').post(`/proyectos/${proyectoId}/generaciones`);
    expect(generar.status).toBe(403);
    expect(generar.body).toMatchObject({ codigo: 'SUSCRIPCION_SUSPENDIDA', detalles: [{ regularizar: '/plan', renovacionId, total: 1522.2, moneda: 'PEN', puedePagar: false }] });
    expect(generar.body.mensaje).toContain('Pide al administrador');
    const crear = await como('admin').post('/clientes', { nombre: 'Cliente nuevo', idiomas: ['es'] });
    expect(crear.status).toBe(403);
    expect(crear.body.detalles[0].puedePagar).toBe(true);
    // Leer y descargar lo entregado, validar o exportar, y la sesión: nunca 403 por la suspensión.
    expect((await como('productor').get('/proyectos')).status).toBe(200);
    expect((await como('productor').get(`/proyectos/${proyectoId}`)).status).toBe(200);
    for (const [ruta, datos] of [[`/cursos/${NADA}/validar`, { formato: 'SCORM12' }], [`/cursos/${NADA}/exportaciones`, { formato: 'SCORM12' }]] as const) {
      const r = await como('productor').post(ruta, datos);
      expect([ruta, r.status]).toEqual([ruta, 404]);
    }
    expect((await como('admin').get('/organizacion/cobranza')).body).toMatchObject({ estado: 'SUSPENDIDA', puedePagar: true });
    // La otra organización sigue normal.
    expect((await como('otro-admin').post('/clientes', { nombre: 'Cliente de otra', idiomas: ['es'] })).status).not.toBe(403);
    expect((await como('otro-admin').post('/organizacion/suscripcion/renovacion/pago')).body.codigo).toBe('SIN_PAGO_PENDIENTE');
    expect((await como('productor').post('/organizacion/suscripcion/renovacion/pago')).status).toBe(403);
  });

  it('«Pagar ahora» con la tarjeta que rechaza no cambia nada; con la que aprueba reactiva desde el día del pago', async () => {
    const inicio = await como('admin').post('/organizacion/suscripcion/renovacion/pago');
    expect(inicio.status).toBe(200);
    expect(inicio.body).toMatchObject({ pago: { tipo: 'simulado' }, renovacion: { id: renovacionId, estado: 'VENCIDA' }, suscripcion: { estado: 'SUSPENDIDA' } });
    expect((await como('admin').post('/organizacion/suscripcion/renovacion/pago-prueba', { tarjeta: '1234' })).status).toBe(422);
    const rechazo = await como('admin').post('/organizacion/suscripcion/renovacion/pago-prueba', { tarjeta: '4000 0000 0000 0002' });
    expect(rechazo.status).toBe(200);
    expect(rechazo.body).toMatchObject({ renovacion: { estado: 'VENCIDA', motivoRechazo: 'La tarjeta de prueba fue rechazada' }, suscripcion: { estado: 'SUSPENDIDA' } });

    const antes = Date.now();
    const ok = await como('admin').post('/organizacion/suscripcion/renovacion/pago-prueba', { tarjeta: '4111 1111 1111 1111' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ renovacion: { estado: 'APROBADA' }, suscripcion: { estado: 'ACTIVA', renovacion: null } });
    const s = await prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } });
    expect(s.inicioPeriodo.getTime()).toBeGreaterThanOrEqual(antes - 1_000);
    expect(s.ultimos4Digitos).toBe('1111');
    const cobros = await prisma.cobro.findMany({ where: { renovacionId } });
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ suscripcionId, eventoPagoId: `prueba_${renovacionId}`, ultimos4Digitos: '1111' });
    await app.get(SuscripcionesService).ultimoEncolado;
    expect((await app.get(SuscripcionesService).colaComprobantes.getJob(cobros[0]!.id))?.data).toEqual({ cobroId: cobros[0]!.id });
    expect(await prisma.auditoria.count({ where: { accion: 'SUSCRIPCION_REACTIVADA', entidadId: renovacionId } })).toBe(1);
    // Ya al día: la escritura vuelve y pagar otra vez no hay qué.
    expect((await como('admin').post('/clientes', { nombre: 'Cliente tras pagar', idiomas: ['es'] })).status).toBe(201);
    expect((await como('admin').post('/organizacion/suscripcion/renovacion/pago-prueba', { tarjeta: '4111 1111 1111 1111' })).body.codigo).toBe('SIN_PAGO_PENDIENTE');
  });

  it('Ventas › Suscripciones: el superadmin filtra y reintenta (encolado y auditado); nadie más', async () => {
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { estado: 'PAGO_PENDIENTE', finPeriodo: fin } });
    await prisma.renovacion.update({ where: { id: renovacionId }, data: { estado: 'PENDIENTE', eventoPagoId: null, periodoInicio: fin } });
    expect((await como('admin').get('/ventas/suscripciones')).status).toBe(403);
    expect((await como('admin').post(`/ventas/suscripciones/${suscripcionId}/reintentar`)).status).toBe(403);
    expect((await como('super').get('/ventas/suscripciones?estado=OTRO')).status).toBe(422);
    const lista = await como('super').get('/ventas/suscripciones?estado=PAGO_PENDIENTE');
    expect(lista.status).toBe(200);
    const fila = lista.body.suscripciones.find((x: { id: string }) => x.id === suscripcionId);
    expect(fila).toMatchObject({ organizacion: { id: orgId, nombre: 'Estudio Quipu' }, estado: 'PAGO_PENDIENTE', reintentable: true, ultimos4Digitos: '1111', renovacion: { id: renovacionId, total: 1522.2 } });
    expect(lista.body.suscripciones.some((x: { id: string }) => x.id === otraSuscripcionId)).toBe(false);

    const r = await como('super').post(`/ventas/suscripciones/${suscripcionId}/reintentar`);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ encolado: true, suscripcion: { id: suscripcionId } });
    const tareas = (await app.get(CobranzaService).colaSuscripciones.getJobs(['waiting', 'delayed', 'prioritized'])).filter((j) => j?.data.renovacionId === renovacionId);
    expect(tareas.map((j) => j.name)).toEqual([TAREA_INTENTO_RENOVACION]);
    expect(await prisma.auditoria.count({ where: { accion: 'RENOVACION_REINTENTO_PEDIDO', entidadId: renovacionId } })).toBe(1);
    expect((await como('super').post(`/ventas/suscripciones/${otraSuscripcionId}/reintentar`)).body.codigo).toBe('SIN_PAGO_PENDIENTE');
    expect((await como('super').post(`/ventas/suscripciones/${NADA}/reintentar`)).status).toBe(404);
  });
});
