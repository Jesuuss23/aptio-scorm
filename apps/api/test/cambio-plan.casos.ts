// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas de ventas (las pasarelas, los planes y la
// versión publicada son globales).
// HU-1706 · Cambio de plan y cancelación (REQ-086, CP-147, RN-18-7, RN-18-2) contra PostgreSQL y Redis:
// - la vista previa con el prorrateo al céntimo y las reglas (plan publicado, con precio, distinto, mismo ciclo y moneda);
// - CP-147: de Inicial a Productora con 15 de 30 días se cobra S/ 472,00 y, con el webhook, la cuota nueva rige de
//   inmediato, con su cobro y su comprobante en cola; el evento repetido no crea otro cobro;
// - el pago rechazado no cambia el plan; el monto distinto deja el cobro sin acreditar; otra organización no ve el cambio;
// - la bajada queda programada sin cobro; cancelar programa la tarea de vencimiento y reanudar la quita;
// - vencida, la suscripción no genera cápsulas nuevas (402 SUSCRIPCION_CANCELADA) y la cápsula en revisión se regenera.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type DatosTrabajo, idTareaVencer, type NombreCola } from '@aptio/colas';
import { hashearClave, ID_PLANES_AJUSTES, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';
import { CambioPlanService } from '../src/ventas/cambio-plan.service.js';
import { firmar, SuscripcionesService } from '../src/ventas/suscripciones.service.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-cambio-plan';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@cambio-plan.test`;
const slug = (n: string) => `${n}-${sufijo}`;
const RUTA = `/precios-cambio-${sufijo}`;
const VARIABLES = ['SITIO_ENTORNO', 'PAGO_PRUEBA_SECRETO', 'WEB_URL'] as const;
const APROBADA = '4111 1111 1111 1111';
const RECHAZADA = '4000 0000 0000 0002';
const DIA = 86_400_000;

describe.skipIf(!hayBase && !process.env.CI)('cambio de plan y cancelación (HU-1706)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId = '';
  let otraId = '';
  let clienteId = '';
  let adminId = '';
  let suscripcionId = '';
  let inicialId = '';
  let productoraId = '';
  let paginaId = '';
  const cookies: Record<string, string> = {};
  const originales: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};
  let pasarelasPrevias: Awaited<ReturnType<typeof prisma.pasarelaConfig.findMany>> = [];
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.planesAjustes.findUnique>> = null;
  const servicio = () => app?.get(SuscripcionesService);
  const colas = { encolar: (_c: NombreCola, _d: DatosTrabajo, _j?: string) => Promise.resolve() };

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object = {}) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const webhook = (cuerpo: Buffer) =>
    request(servidor).post('/api/v1/webhooks/pago/pruebas').set('Content-Type', 'application/json').set('X-Aptio-Firma', firmar(SECRETO, cuerpo)).send(cuerpo.toString());
  /** El período de la suscripción: empezó hace `pasados` días y dura 30. */
  const periodo = async (pasados: number, extra: Record<string, unknown> = {}) => {
    const inicio = new Date(Date.now() - pasados * DIA);
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { inicioPeriodo: inicio, finPeriodo: new Date(inicio.getTime() + 30 * DIA), ...extra } });
  };
  const enPlan = (planId: string, precio: number) => prisma.suscripcion.update({ where: { id: suscripcionId }, data: { planId, precioPactadoSinIgv: precio } });
  async function proyecto(nombre: string) {
    const p = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre, creadoPorId: adminId, pantallasObjetivo: 10 } });
    await prisma.materialFuente.create({ data: { proyectoId: p.id, tipo: 'TEMA', tema: 'LOTO', estado: 'listo' } });
    return p.id;
  }

  beforeAll(async () => {
    for (const v of VARIABLES) originales[v] = process.env[v];
    Object.assign(process.env, { SITIO_ENTORNO: 'pruebas', PAGO_PRUEBA_SECRETO: SECRETO, WEB_URL: 'https://consola.aptio.example' });
    pasarelasPrevias = await prisma.pasarelaConfig.findMany();
    await prisma.pasarelaConfig.deleteMany(); // por defecto: solo la de pruebas, visible
    ajustesPrevios = await prisma.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    await prisma.planesAjustes.upsert({ where: { id: ID_PLANES_AJUSTES }, create: { id: ID_PLANES_AJUSTES, mostrarAnual: true, descuentoAnual: 20, conIgv: false }, update: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } });
    inicialId = (await prisma.plan.create({ data: { slug: slug('inicial'), nombre: 'Inicial', precioMes: 490, capsulasMes: 8, capsulaAdicional: 69, visible: true, orden: 80 } })).id;
    productoraId = (await prisma.plan.create({ data: { slug: slug('productora'), nombre: 'Productora', precioMes: 1290, capsulasMes: 20, capsulaAdicional: 69, visible: true, orden: 81 } })).id;
    await prisma.plan.createMany({
      data: [
        { slug: slug('empresa'), nombre: 'Empresa', precioMes: null, visible: true, orden: 82, textoBoton: 'Hablar con ventas' },
        { slug: slug('oculto'), nombre: 'Oculto', precioMes: 2990, visible: false, orden: 83 },
      ],
    });
    const org = await prisma.organizacion.create({ data: { nombre: 'Estudio Quipu', slug: `quipu-cambio-${sufijo}` } });
    orgId = org.id;
    otraId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `otra-cambio-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (n: string, rol: Rol, organizacionId: string | null = orgId) => prisma.usuario.create({ data: { nombre: n, email: correoDe(n), rol, organizacionId, hashClave, emailVerificado: true } });
    adminId = (await crear('admin', Rol.ADMINISTRADOR)).id;
    await crear('productor', Rol.PRODUCTOR);
    await crear('otro-admin', Rol.ADMINISTRADOR, otraId);
    await crear('super', Rol.SUPERADMIN, null);
    const inicio = new Date(Date.now() - 15 * DIA);
    suscripcionId = (await prisma.suscripcion.create({
      data: { organizacionId: orgId, planId: inicialId, ciclo: 'MENSUAL', precioPactadoSinIgv: 490, moneda: 'PEN', inicioPeriodo: inicio, finPeriodo: new Date(inicio.getTime() + 30 * DIA), pasarela: 'pruebas' },
    })).id;
    await prisma.suscripcion.create({
      data: { organizacionId: otraId, planId: inicialId, ciclo: 'MENSUAL', precioPactadoSinIgv: 490, moneda: 'PEN', inicioPeriodo: inicio, finPeriodo: new Date(inicio.getTime() + 30 * DIA), pasarela: 'pruebas' },
    });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['admin', 'productor', 'otro-admin', 'super']) {
      cookies[n] = await ingresarCookie(servidor, correoDe(n), CLAVE);
    }
    // Una página publicada con el bloque de precios: la versión lleva los planes.
    const p = await como('super').post('/sitio/paginas', { ruta: RUTA, titulo: 'Precios' });
    paginaId = p.body.id;
    const b = await como('super').post(`/sitio/paginas/${paginaId}/bloques`, { tipo: 'precios' });
    await como('super').patch(`/sitio/paginas/${paginaId}/bloques/${b.body.id}`, { visible: true });
    await como('super').patch(`/sitio/paginas/${paginaId}`, { accion: 'publicar' });
    const publicada = await como('super').post('/sitio/publicar');
    if (publicada.status !== 201) throw new Error(`No se pudo publicar el sitio de prueba: ${publicada.status} ${JSON.stringify(publicada.body)}`);
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'pruebas';
  });

  afterAll(async () => {
    const cambios = (await prisma.cambioPlan.findMany({ where: { organizacionId: { in: [orgId, otraId] } }, select: { id: true } })).map((c) => c.id);
    const cobros = (await prisma.cobro.findMany({ where: { cambioPlanId: { in: cambios } }, select: { id: true } })).map((c) => c.id);
    const cola = servicio()?.colaComprobantes;
    if (cola) for (const id of cobros) await cola.remove(id).catch(() => undefined);
    await app?.get(CambioPlanService).colaSuscripciones.remove(idTareaVencer(suscripcionId)).catch(() => undefined);
    await app?.close();
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.auditoria.deleteMany({ where: { OR: [{ organizacionId: { in: [orgId, otraId] } }, { entidadId: { in: [...cobros, ...cambios, paginaId] } }] } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    const usuarios = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@cambio-plan.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: usuarios } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios } } });
    if (paginaId) await prisma.sitioPagina.deleteMany({ where: { id: paginaId } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraId] } } });
    await prisma.plan.deleteMany({ where: { slug: { endsWith: `-${sufijo}` } } });
    await prisma.planesAjustes.deleteMany();
    if (ajustesPrevios) await prisma.planesAjustes.create({ data: ajustesPrevios });
    await prisma.pasarelaConfig.deleteMany();
    if (pasarelasPrevias.length) await prisma.pasarelaConfig.createMany({ data: pasarelasPrevias });
  });

  it('solo el administrador ve su suscripción, con los planes publicados y si cada uno sería subida o bajada', async () => {
    expect((await como('productor').get('/organizacion/suscripcion')).status).toBe(403);
    const r = await como('admin').get('/organizacion/suscripcion');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      plan: { slug: slug('inicial'), nombre: 'Inicial', capsulasMes: 8 }, ciclo: 'MENSUAL', precioPactadoSinIgv: 490, moneda: 'PEN', estado: 'ACTIVA', cancelarAlFin: false,
      canceladaEn: null, planProgramado: null, pagoDisponible: true,
    });
    const propios = r.body.planes.filter((p: { slug: string }) => p.slug.endsWith(sufijo));
    expect(propios).toEqual([
      { slug: slug('inicial'), nombre: 'Inicial', capsulasMes: 8, precioCiclo: 490, actual: true, tipo: null },
      { slug: slug('productora'), nombre: 'Productora', capsulasMes: 20, precioCiclo: 1290, actual: false, tipo: 'SUBIDA' },
      { slug: slug('empresa'), nombre: 'Empresa', capsulasMes: null, precioCiclo: null, actual: false, tipo: null },
    ]);
    expect((await como('admin').get('/organizacion/cuota')).body.planes).toBe('/plan');
  });

  it('la vista previa prorratea por día y no guarda nada; rechaza planes que no se pueden elegir', async () => {
    const vista = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('productora') });
    expect(vista.status).toBe(200);
    expect(vista.body).toMatchObject({
      id: null, tipo: 'SUBIDA', estado: 'VISTA_PREVIA', planOrigen: { slug: slug('inicial') }, planDestino: { slug: slug('productora'), capsulasMes: 20 }, precioNuevoSinIgv: 1290,
      diasRestantes: 15, diasPeriodo: 30, diferenciaSinIgv: 400, igv: 72, total: 472, moneda: 'PEN', pasarela: null,
    });
    expect(await prisma.cambioPlan.count({ where: { organizacionId: orgId } })).toBe(0);
    for (const plan of [slug('inicial'), slug('empresa'), slug('oculto'), 'no-existe']) {
      const mal = await como('admin').post('/organizacion/suscripcion/cambio', { plan, confirmar: true });
      expect(mal.status).toBe(422);
      expect(mal.body.detalles[0].campo).toBe('plan');
    }
    expect((await como('admin').post('/organizacion/suscripcion/cambio', {})).status).toBe(422);
    expect((await como('productor').post('/organizacion/suscripcion/cambio', { plan: slug('productora') })).status).toBe(403);
  });

  let cambioId = '';
  it('el pago rechazado no cambia el plan', async () => {
    const c = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('productora'), confirmar: true });
    expect(c.body).toMatchObject({ estado: 'PENDIENTE', total: 472, pasarela: 'pruebas', pago: { tipo: 'simulado' } });
    const r = await como('admin').post(`/organizacion/suscripcion/cambios/${c.body.id}/pago-prueba`, { tarjeta: RECHAZADA });
    expect(r.body).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'La tarjeta de prueba fue rechazada', suscripcion: { plan: { slug: slug('inicial') } } });
    expect(await prisma.cobro.count({ where: { cambioPlanId: c.body.id } })).toBe(0);
    expect(await prisma.auditoria.count({ where: { accion: 'PLAN_CAMBIO_RECHAZADO', entidadId: c.body.id } })).toBe(1);
  });

  it('CP-147 · de Inicial a Productora a mitad del mes: se cobra la diferencia y la cuota nueva rige de inmediato', async () => {
    expect((await como('productor').get('/organizacion/cuota')).body).toMatchObject({ incluidas: 8 });
    const c = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('productora'), confirmar: true });
    cambioId = c.body.id;
    expect(c.body).toMatchObject({ estado: 'PENDIENTE', diferenciaSinIgv: 400, igv: 72, total: 472 });
    const r = await como('admin').post(`/organizacion/suscripcion/cambios/${cambioId}/pago-prueba`, { tarjeta: APROBADA });
    expect(r.body).toMatchObject({ estado: 'APROBADO', motivoRechazo: null, suscripcion: { plan: { slug: slug('productora'), capsulasMes: 20 }, precioPactadoSinIgv: 1290 } });
    expect((await como('productor').get('/organizacion/cuota')).body).toMatchObject({ incluidas: 20 });
    const cambio = await prisma.cambioPlan.findUniqueOrThrow({ where: { id: cambioId }, include: { cobros: true } });
    expect(cambio.cobros).toHaveLength(1);
    expect(cambio.cobros[0]).toMatchObject({ suscripcionId, solicitudSuscripcionId: null, compraCapsulasId: null, pasarela: 'pruebas', ultimos4Digitos: '1111', moneda: 'PEN' });
    expect(Number(cambio.cobros[0]!.monto)).toBe(472);
    await servicio().ultimoEncolado;
    expect((await servicio().colaComprobantes.getJob(cambio.cobros[0]!.id))?.data).toEqual({ cobroId: cambio.cobros[0]!.id });
    expect(await prisma.auditoria.count({ where: { accion: 'PLAN_CAMBIADO', entidadId: cambioId } })).toBe(1);
    expect(await prisma.auditoria.count({ where: { accion: 'PLAN_CAMBIO_INICIADO', organizacionId: orgId, usuarioId: adminId } })).toBe(2);

    // El mismo evento otra vez: repetido, sin otro cobro.
    const cuerpo = Buffer.from(JSON.stringify({ id: `prueba_${cambioId}`, tipo: 'pago.aprobado', solicitudId: cambioId, ultimos4: '1111', monto: 472, moneda: 'PEN' }));
    expect((await webhook(cuerpo)).body).toEqual({ recibido: true, duplicado: true });
    expect(await prisma.cobro.count({ where: { cambioPlanId: cambioId } })).toBe(1);
  });

  it('un pago con otro monto deja el cobro sin acreditar y el plan como estaba; otra organización no ve el cambio', async () => {
    await enPlan(inicialId, 490);
    const c = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('productora'), confirmar: true });
    const cuerpo = Buffer.from(JSON.stringify({ id: `evt_${sufijo}_monto`, tipo: 'pago.aprobado', solicitudId: c.body.id, ultimos4: '1111', monto: 100, moneda: 'PEN' }));
    expect((await webhook(cuerpo)).body).toEqual({ recibido: true, duplicado: false });
    const cambio = await prisma.cambioPlan.findUniqueOrThrow({ where: { id: c.body.id }, include: { cobros: true } });
    expect(cambio.estado).toBe('RECHAZADO');
    expect(cambio.motivoRechazo).toMatch(/^MONTO_NO_COINCIDE/);
    expect(cambio.cobros).toMatchObject([{ suscripcionId: null, cambioPlanId: cambio.id }]);
    expect((await prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })).planId).toBe(inicialId);
    expect((await como('otro-admin').get(`/organizacion/suscripcion/cambios/${cambio.id}`)).status).toBe(404);
    expect((await como('otro-admin').post(`/organizacion/suscripcion/cambios/${cambio.id}/pago-prueba`, { tarjeta: APROBADA })).status).toBe(404);
    // En el panel de cobros, es un cambio de plan reembolsable.
    const cobro = (await como('super').get(`/ventas/cobros/${cambio.cobros[0]!.id}`)).body;
    expect(cobro).toMatchObject({ concepto: 'CAMBIO_PLAN', cambioPlanId: cambio.id, solicitudId: null, razonSocial: 'Estudio Quipu', correoAdmin: correoDe('admin'), nombrePlan: 'Cambio de Inicial a Productora', reembolsable: true });
  });

  it('la bajada queda programada para la renovación, sin cobro; «Seguir con mi plan» la quita', async () => {
    await enPlan(productoraId, 1290);
    const antes = await prisma.cambioPlan.count({ where: { organizacionId: orgId } });
    const vista = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('inicial') });
    expect(vista.body).toMatchObject({ tipo: 'BAJADA', estado: 'VISTA_PREVIA', diferenciaSinIgv: 0, total: 0 });
    const r = await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('inicial'), confirmar: true });
    expect(r.body).toMatchObject({ id: null, tipo: 'BAJADA', estado: 'PROGRAMADO', total: 0, suscripcion: { plan: { slug: slug('productora') }, planProgramado: { slug: slug('inicial') } } });
    expect(r.body.rigeDesde).toBe(r.body.suscripcion.finPeriodo);
    expect(await prisma.cambioPlan.count({ where: { organizacionId: orgId } })).toBe(antes);
    expect((await como('productor').get('/organizacion/cuota')).body.incluidas).toBe(20);
    expect(await prisma.auditoria.count({ where: { accion: 'PLAN_CAMBIO_PROGRAMADO', entidadId: suscripcionId } })).toBe(1);
    const seguir = await como('admin').post('/organizacion/suscripcion/reanudar');
    expect(seguir.body).toMatchObject({ planProgramado: null, cancelarAlFin: false });
  });

  it('cancelar rige al fin del período y programa su vencimiento; reanudar lo quita', async () => {
    const cola = app.get(CambioPlanService).colaSuscripciones;
    const c = await como('admin').post('/organizacion/suscripcion/cancelar');
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ estado: 'ACTIVA', cancelarAlFin: true });
    const tarea = await cola.getJob(idTareaVencer(suscripcionId));
    expect(tarea?.data).toEqual({ suscripcionId });
    const fin = new Date(c.body.finPeriodo).getTime();
    expect(Math.abs(tarea!.timestamp + tarea!.opts.delay! - fin)).toBeLessThan(5_000);
    expect((await como('admin').post('/organizacion/suscripcion/cancelar')).body.cancelarAlFin).toBe(true);
    expect(await prisma.auditoria.count({ where: { accion: 'SUSCRIPCION_CANCELACION_PEDIDA', entidadId: suscripcionId } })).toBe(1);
    // Mientras tanto, la cuota sigue y se puede generar.
    expect((await como('productor').get('/organizacion/cuota')).body).toMatchObject({ cancelada: false, incluidas: 20 });

    const r = await como('admin').post('/organizacion/suscripcion/reanudar');
    expect(r.body).toMatchObject({ estado: 'ACTIVA', cancelarAlFin: false });
    expect(await cola.getJob(idTareaVencer(suscripcionId))).toBeUndefined();
    expect(await prisma.auditoria.count({ where: { accion: 'SUSCRIPCION_REANUDADA', entidadId: suscripcionId } })).toBe(2);
  });

  it('vencida, la suscripción no genera cápsulas nuevas (402 SUSCRIPCION_CANCELADA) y la cápsula en revisión se regenera', async () => {
    const enRevision = await proyecto('En revisión');
    const primera = await como('productor').post(`/proyectos/${enRevision}/generaciones`);
    expect(primera.status).toBe(202);
    await prisma.generacion.updateMany({ where: { proyectoId: enRevision }, data: { estado: 'COMPLETADO', terminadoEn: new Date() } });
    await prisma.proyecto.update({ where: { id: enRevision }, data: { estado: 'REVISION' } });
    // El fin del período pasó con la cancelación pedida (la tarea retrasada todavía no corrió: ya cuenta como cancelada).
    await periodo(31, { cancelarAlFin: true });
    const nuevo = await proyecto('Nueva tras cancelar');
    const r = await como('productor').post(`/proyectos/${nuevo}/generaciones`);
    expect(r.status).toBe(402);
    expect(r.body.codigo).toBe('SUSCRIPCION_CANCELADA');
    expect(r.body.mensaje).toContain('Las cápsulas en revisión siguen editables');
    expect(r.body.detalles[0]).toMatchObject({ cancelada: true, incluidas: 0, disponibles: 0, oferta: null, puedeComprar: false });
    expect((await como('productor').post(`/proyectos/${enRevision}/generaciones`)).status).toBe(202);
    expect((await como('admin').get('/organizacion/suscripcion')).body).toMatchObject({ estado: 'CANCELADA', cancelarAlFin: true });
    expect((await como('admin').post('/organizacion/suscripcion/cambio', { plan: slug('inicial') })).body.codigo).toBe('SUSCRIPCION_CANCELADA');
    expect((await como('admin').post('/organizacion/suscripcion/reanudar')).status).toBe(409);
    expect((await como('admin').post('/organizacion/cuota/adicionales', { cantidad: 1 })).body.codigo).toBe('SUSCRIPCION_CANCELADA');

    // Ya en CANCELADA (como la deja la tarea del worker), igual.
    await prisma.suscripcion.update({ where: { id: suscripcionId }, data: { estado: 'CANCELADA', canceladaEn: new Date() } });
    expect((await como('productor').post(`/proyectos/${nuevo}/generaciones`)).body.codigo).toBe('SUSCRIPCION_CANCELADA');
  });
});
