// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas (las pasarelas son globales).
// HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6) contra PostgreSQL y Redis, con la cola de generación simulada:
// - CP-146: con 20 de 20 cápsulas usadas, un proyecto nuevo recibe 402 CUOTA_AGOTADA con la oferta y el enlace a planes;
//   la cápsula en revisión se vuelve a generar sin descontar;
// - la compra de adicionales (solo el administrador, de 1 a 10) con la pasarela de pruebas: rechazada no acredita;
//   aprobada acredita en la ventana, deja su cobro y la tarea de comprobante, y habilita un proyecto nuevo;
// - dos lanzamientos a la vez con 1 cápsula disponible: uno pasa y el otro recibe 402;
// - el monto distinto deja el cobro sin acreditar; sin suscripción no hay límite.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo, NombreCola } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { ventanaMensual } from '@aptio/schema/cuotas';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';
import { firmar, SuscripcionesService } from '../src/ventas/suscripciones.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-cuotas';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@cuotas.test`;
const VARIABLES = ['SITIO_ENTORNO', 'PAGO_PRUEBA_SECRETO', 'WEB_URL'] as const;
const APROBADA = '4111 1111 1111 1111';
const RECHAZADA = '4000 0000 0000 0002';

describe.skipIf(!hayBase && !process.env.CI)('cuotas de cápsulas (HU-1705)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId = '';
  let internaId = '';
  let clienteId = '';
  let clienteInternoId = '';
  let adminId = '';
  let suscripcionId = '';
  const inicio = new Date(Date.now() - 3 * 86_400_000);
  const cookies: Record<string, string> = {};
  const originales: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};
  let pasarelasPrevias: Awaited<ReturnType<typeof prisma.pasarelaConfig.findMany>> = [];
  const servicio = () => app?.get(SuscripcionesService);
  const colas = { encolar: (_c: NombreCola, _d: DatosTrabajo, _j?: string) => Promise.resolve() };

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  async function proyecto(organizacionId = orgId, cliente = clienteId, nombre = 'Cápsula') {
    const p = await prisma.proyecto.create({ data: { organizacionId, clienteId: cliente, nombre, creadoPorId: adminId, pantallasObjetivo: 10 } });
    await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'TEMA', tema: 'LOTO', estado: 'listo' } });
    return p.id;
  }
  const generar = (id: string, quien = 'productor') => como(quien).post(`/proyectos/${id}/generaciones`);
  const consumos = () => prisma.consumoCapsula.count({ where: { organizacionId: orgId } });
  const webhook = (cuerpo: Buffer) =>
    request(servidor).post('/api/v1/webhooks/pago/pruebas').set('Content-Type', 'application/json').set('X-Aptio-Firma', firmar(SECRETO, cuerpo)).send(cuerpo.toString());
  async function comprarYPagar(cantidad: number, tarjeta: string) {
    const c = await como('admin').post('/organizacion/cuota/adicionales', { cantidad });
    expect(c.status).toBe(201);
    const p = await como('admin').post(`/organizacion/cuota/adicionales/${c.body.id}/pago-prueba`, { tarjeta });
    expect(p.status).toBe(200);
    return p.body;
  }

  beforeAll(async () => {
    for (const v of VARIABLES) originales[v] = process.env[v];
    Object.assign(process.env, { SITIO_ENTORNO: 'pruebas', PAGO_PRUEBA_SECRETO: SECRETO, WEB_URL: 'https://consola.aptio.example' });
    pasarelasPrevias = await prisma.pasarelaConfig.findMany();
    await prisma.pasarelaConfig.deleteMany(); // por defecto: solo la de pruebas, visible
    const plan = await prisma.plan.create({ data: { slug: `productora-${sufijo}`, nombre: 'Productora', precioMes: 1290, capsulasMes: 20, capsulaAdicional: 69, orden: 97 } });
    const org = await prisma.organizacion.create({ data: { nombre: 'Estudio Quipu', slug: `quipu-${sufijo}` } });
    orgId = org.id;
    internaId = (await prisma.organizacion.create({ data: { nombre: 'Interna', slug: `interna-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    clienteInternoId = (await prisma.cliente.create({ data: { organizacionId: internaId, nombre: 'Banco Sur', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (n: string, rol: Rol, organizacionId = orgId) => prisma.usuario.create({ data: { nombre: n, email: correoDe(n), rol, organizacionId, hashClave, emailVerificado: true } });
    adminId = (await crear('admin', Rol.ADMINISTRADOR)).id;
    await crear('productor', Rol.PRODUCTOR);
    await crear('interno', Rol.PRODUCTOR, internaId);
    await crear('interno-admin', Rol.ADMINISTRADOR, internaId);
    suscripcionId = (await prisma.suscripcion.create({
      data: { organizacionId: orgId, planId: plan.id, ciclo: 'ANUAL', precioPactadoSinIgv: 12384, moneda: 'PEN', inicioPeriodo: inicio, finPeriodo: new Date(inicio.getTime() + 365 * 86_400_000), pasarela: 'pruebas' },
    })).id;
    // 19 de 20 cápsulas ya usadas en la ventana vigente.
    const v = ventanaMensual(inicio, new Date());
    for (let i = 0; i < 19; i++) {
      const id = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: `Usada ${i + 1}`, creadoPorId: adminId } })).id;
      await prisma.consumoCapsula.create({ data: { organizacionId: orgId, suscripcionId, proyectoId: id, ventanaInicio: v.inicio, ventanaFin: v.fin } });
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'productor', 'interno', 'interno-admin']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'pruebas';
  });

  afterAll(async () => {
    const cobros = (await prisma.cobro.findMany({ where: { compraCapsulas: { organizacionId: orgId } }, select: { id: true } })).map((c) => c.id);
    const cola = servicio()?.colaComprobantes;
    if (cola) for (const id of cobros) await cola.remove(id).catch(() => undefined);
    await app?.close();
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.auditoria.deleteMany({ where: { OR: [{ organizacionId: { in: [orgId, internaId] } }, { entidadId: { in: cobros } }] } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: [orgId, internaId] } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@cuotas.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: [orgId, internaId] } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, internaId] } } });
    await prisma.plan.deleteMany({ where: { slug: `productora-${sufijo}` } });
    await prisma.pasarelaConfig.deleteMany();
    if (pasarelasPrevias.length) await prisma.pasarelaConfig.createMany({ data: pasarelasPrevias });
  });

  it('la cuota de la ventana mensual (plan anual): usadas, disponibles y la oferta; solo el administrador compra', async () => {
    const r = await como('productor').get('/organizacion/cuota');
    expect(r.status).toBe(200);
    const v = ventanaMensual(inicio, new Date());
    expect(r.body).toEqual({
      ilimitada: false, ventanaInicio: v.inicio.toISOString(), ventanaFin: v.fin.toISOString(), incluidas: 20, adicionales: 0, usadas: 19, disponibles: 1,
      oferta: { unitario: 69, igv: 12.42, total: 81.42, moneda: 'PEN', disponible: true }, puedeComprar: false, planes: '/s/precios', cancelada: false,
    });
    expect((await como('admin').get('/organizacion/cuota')).body.puedeComprar).toBe(true);
    expect((await como('productor').post('/organizacion/cuota/adicionales', { cantidad: 1 })).status).toBe(403);
    for (const cantidad of [0, 11, 1.5, '2']) {
      const mal = await como('admin').post('/organizacion/cuota/adicionales', { cantidad });
      expect(mal.status).toBe(422);
      expect(mal.body.detalles).toEqual([{ campo: 'cantidad', mensaje: 'Elige de 1 a 10 cápsulas' }]);
    }
  });

  let enRevision = '';
  it('CP-146 · con 20 de 20, un proyecto nuevo recibe 402 con la oferta; la cápsula en revisión se regenera sin descontar', async () => {
    enRevision = await proyecto(orgId, clienteId, 'Vigésima');
    const vigesima = await generar(enRevision);
    expect(vigesima.status).toBe(202);
    expect(await consumos()).toBe(20);
    expect((await prisma.consumoCapsula.findUniqueOrThrow({ where: { proyectoId: enRevision } })).origen).toBe('CUOTA');

    const nuevo = await proyecto(orgId, clienteId, 'Vigésimo primera');
    const agotada = await generar(nuevo);
    expect(agotada.status).toBe(402);
    expect(agotada.body.codigo).toBe('CUOTA_AGOTADA');
    expect(agotada.body.mensaje).toContain('las cápsulas en revisión siguen editables');
    expect(agotada.body.detalles[0]).toMatchObject({ usadas: 20, incluidas: 20, disponibles: 0, oferta: { total: 81.42, moneda: 'PEN' }, planes: '/s/precios' });
    expect(await prisma.generacion.count({ where: { proyectoId: nuevo } })).toBe(0);
    expect((await prisma.proyecto.findUniqueOrThrow({ where: { id: nuevo } })).estado).not.toBe('GENERANDO');

    // La cápsula en revisión: su generación terminó y se vuelve a generar (y a continuar) sin descontar.
    await prisma.generacion.updateMany({ where: { proyectoId: enRevision }, data: { estado: 'COMPLETADO', terminadoEn: new Date() } });
    await prisma.proyecto.update({ where: { id: enRevision }, data: { estado: 'REVISION' } });
    const otraVez = await generar(enRevision);
    expect(otraVez.status).toBe(202);
    await prisma.generacion.update({ where: { id: otraVez.body.id }, data: { estado: 'CANCELADO' } });
    expect((await como('productor').post(`/generaciones/${otraVez.body.id}/continuar`)).status).toBe(202);
    expect(await consumos()).toBe(20);
    const lanzadas = await prisma.auditoria.findMany({ where: { accion: 'GENERACION_LANZADA', organizacionId: orgId }, orderBy: { creadoEn: 'asc' } });
    expect(lanzadas.map((a) => (a.datos as { capsula: string | null }).capsula)).toEqual(['CUOTA', null]);
  });

  it('comprar una adicional: rechazada no acredita; aprobada acredita, deja su cobro y su comprobante, y habilita un proyecto', async () => {
    const rechazada = await comprarYPagar(1, RECHAZADA);
    expect(rechazada).toMatchObject({ estado: 'RECHAZADA', cantidad: 1, total: 81.42, motivoRechazo: 'La tarjeta de prueba fue rechazada', cuota: { disponibles: 0, adicionales: 0 } });

    const iniciada = await como('admin').post('/organizacion/cuota/adicionales', { cantidad: 1 });
    expect(iniciada.body).toMatchObject({ estado: 'PENDIENTE', subtotal: 69, igv: 12.42, total: 81.42, moneda: 'PEN', pasarela: 'pruebas', pago: { tipo: 'simulado' } });
    const aprobada = await como('admin').post(`/organizacion/cuota/adicionales/${iniciada.body.id}/pago-prueba`, { tarjeta: APROBADA });
    expect(aprobada.body).toMatchObject({ estado: 'APROBADA', motivoRechazo: null, cuota: { adicionales: 1, usadas: 20, disponibles: 1 } });
    const compra = await prisma.compraCapsulas.findUniqueOrThrow({ where: { id: iniciada.body.id }, include: { cobros: true } });
    expect(compra.ventanaInicio).toEqual(ventanaMensual(inicio, new Date()).inicio);
    expect(compra.cobros).toHaveLength(1);
    expect(compra.cobros[0]).toMatchObject({ suscripcionId, solicitudSuscripcionId: null, pasarela: 'pruebas', ultimos4Digitos: '1111', moneda: 'PEN', estado: 'APROBADO' });
    expect(Number(compra.cobros[0]!.monto)).toBe(81.42);
    await servicio().ultimoEncolado;
    expect((await servicio().colaComprobantes.getJob(compra.cobros[0]!.id))?.data).toEqual({ cobroId: compra.cobros[0]!.id });
    expect(await prisma.auditoria.count({ where: { accion: 'CAPSULAS_COMPRADAS', entidadId: compra.id } })).toBe(1);
    expect(await prisma.auditoria.count({ where: { accion: 'CAPSULAS_COMPRA_INICIADA', organizacionId: orgId, usuarioId: adminId } })).toBe(2);

    // El mismo evento otra vez: repetido, sin otro cobro.
    const cuerpo = Buffer.from(JSON.stringify({ id: `prueba_${compra.id}`, tipo: 'pago.aprobado', solicitudId: compra.id, ultimos4: '1111', monto: 81.42, moneda: 'PEN' }));
    expect((await webhook(cuerpo)).body).toEqual({ recibido: true, duplicado: true });
    expect(await prisma.cobro.count({ where: { compraCapsulasId: compra.id } })).toBe(1);

    // La adicional habilita un proyecto nuevo, que consume de lo comprado.
    const nuevo = await proyecto(orgId, clienteId, 'Con adicional');
    expect((await generar(nuevo)).status).toBe(202);
    expect((await prisma.consumoCapsula.findUniqueOrThrow({ where: { proyectoId: nuevo } })).origen).toBe('ADICIONAL');
    expect((await como('productor').get('/organizacion/cuota')).body).toMatchObject({ usadas: 21, adicionales: 1, disponibles: 0 });
  });

  it('dos lanzamientos a la vez con 1 cápsula disponible: uno pasa y el otro recibe 402', async () => {
    await comprarYPagar(1, APROBADA);
    expect((await como('productor').get('/organizacion/cuota')).body.disponibles).toBe(1);
    const [a, b] = [await proyecto(orgId, clienteId, 'A la vez A'), await proyecto(orgId, clienteId, 'A la vez B')];
    const antes = await consumos();
    const res = await Promise.all([generar(a), generar(b, 'admin')]);
    expect(res.map((r) => r.status).sort()).toEqual([202, 402]);
    expect(await consumos()).toBe(antes + 1);
  });

  it('un pago con otro monto deja el cobro sin acreditar y la compra rechazada; otra organización no ve la compra', async () => {
    const c = await como('admin').post('/organizacion/cuota/adicionales', { cantidad: 2 });
    expect(c.body).toMatchObject({ subtotal: 138, igv: 24.84, total: 162.84 });
    const cuerpo = Buffer.from(JSON.stringify({ id: `evt_${sufijo}_monto`, tipo: 'pago.aprobado', solicitudId: c.body.id, ultimos4: '1111', monto: 81.42, moneda: 'PEN' }));
    expect((await webhook(cuerpo)).body).toEqual({ recibido: true, duplicado: false });
    const compra = await prisma.compraCapsulas.findUniqueOrThrow({ where: { id: c.body.id }, include: { cobros: true } });
    expect(compra.estado).toBe('RECHAZADA');
    expect(compra.motivoRechazo).toMatch(/^MONTO_NO_COINCIDE/);
    expect(compra.cobros).toMatchObject([{ suscripcionId: null, compraCapsulasId: compra.id }]);
    expect(await prisma.auditoria.count({ where: { accion: 'PAGO_MONTO_NO_COINCIDE', entidadId: compra.id } })).toBe(1);
    expect((await como('productor').get('/organizacion/cuota')).body.disponibles).toBe(0);
    expect((await como('interno').get(`/organizacion/cuota/adicionales/${compra.id}`)).status).toBe(403);
    expect((await como('interno-admin').get(`/organizacion/cuota/adicionales/${compra.id}`)).status).toBe(404);
  });

  it('sin suscripción (organización interna) no hay límite: el consumo se registra igual', async () => {
    const r = await como('interno').get('/organizacion/cuota');
    expect(r.body).toMatchObject({ ilimitada: true, incluidas: null, disponibles: null, oferta: null, puedeComprar: false });
    const id = await proyecto(internaId, clienteInternoId, 'Interna');
    expect((await generar(id, 'interno')).status).toBe(202);
    expect(await prisma.consumoCapsula.findUniqueOrThrow({ where: { proyectoId: id } })).toMatchObject({ organizacionId: internaId, suscripcionId: null, origen: 'CUOTA' });
    expect((await como('interno').get('/organizacion/cuota')).body.usadas).toBe(1);
  });
});
