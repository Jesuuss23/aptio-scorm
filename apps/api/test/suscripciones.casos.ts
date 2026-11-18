// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (los planes y la versión son globales).
// HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-2, RN-18-3) contra PostgreSQL y Redis: el
// checkout toma el precio del plan publicado (404 si es a medida, oculto o ficticio en producción; 409 si el correo ya
// es de un usuario); el webhook firmado aprueba y crea en una transacción la organización vacía, su administrador, la
// suscripción activa y el lead «Suscripción», y encola la bienvenida; un evento repetido no crea nada; una firma errada da
// 401; un pago rechazado no provisiona nada; en producción la pasarela de pruebas no existe y, sin otra activa, 503.
// HU-1704: la pasarela de pruebas se llama `pruebas` y cada pago aprobado deja su cobro.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { idTareaBienvenida } from '@aptio/colas';
import { finPeriodo } from '@aptio/schema/suscripciones';
import { hashearClave, ID_PLANES_AJUSTES, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import { firmar, SuscripcionesService } from '../src/ventas/suscripciones.service.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@suscripciones.test`;
const slug = (n: string) => `${n}-${sufijo}`;
const RUTA = `/precios-sus-${sufijo}`;

describe.skipIf(!hayBase && !process.env.CI)('alta de suscripción (HU-1703)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let cookie = '';
  let paginaId = '';
  const entornoOriginal = process.env.SITIO_ENTORNO;
  const secretoOriginal = process.env.PAGO_PRUEBA_SECRETO;
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.planesAjustes.findUnique>> = null;
  const panel = (m: 'get' | 'post' | 'patch' | 'put', r: string) => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookie);
  const servicio = () => app.get(SuscripcionesService);
  const sinLimite = () => { app.get(LimitePublicoService).reiniciar(); servicio().reiniciarLimite(); };
  const empresa = (correo: string, extra: Record<string, unknown> = {}) => ({
    plan: slug('productora'), ciclo: 'MENSUAL', razonSocial: 'Minera Andina SAC', ruc: '20131312955', nombreAdmin: 'Ana Quispe', correoAdmin: correo, consentimiento: true,
    paginaEntrada: '/precios', utm_source: 'google', utm_campaign: 'lanzamiento', ...extra,
  });
  const checkout = (cuerpo: Record<string, unknown>) => { sinLimite(); return request(servidor).post('/api/v1/publico/checkout').send(cuerpo); };
  const estado = (id: string) => { sinLimite(); return request(servidor).get(`/api/v1/publico/checkout/${id}`); };
  const evento = (d: { id: string; tipo: string; solicitudId: string; ultimos4?: string; motivo?: string }) => Buffer.from(JSON.stringify(d));
  const webhook = (cuerpo: Buffer, firma: string | null = firmar(SECRETO, cuerpo), pasarela = 'pruebas') => {
    const r = request(servidor).post(`/api/v1/webhooks/pago/${pasarela}`).set('Content-Type', 'application/json');
    return (firma ? r.set('X-Aptio-Firma', firma) : r).send(cuerpo.toString('utf8'));
  };
  const solicitudesDe = (correo: string) => prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: correo } });

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'pruebas';
    process.env.PAGO_PRUEBA_SECRETO = SECRETO;
    ajustesPrevios = await prisma.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    await prisma.planesAjustes.upsert({ where: { id: ID_PLANES_AJUSTES }, create: { id: ID_PLANES_AJUSTES, mostrarAnual: true, descuentoAnual: 20, conIgv: false }, update: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } });
    await prisma.plan.createMany({
      data: [
        { slug: slug('productora'), nombre: 'Productora', precioMes: 1290, visible: true, orden: 90 },
        { slug: slug('empresa'), nombre: 'Empresa', precioMes: null, visible: true, orden: 91, textoBoton: 'Hablar con ventas' },
        { slug: slug('oculto'), nombre: 'Oculto', precioMes: 300, visible: false, orden: 92 },
        { slug: slug('ficticio'), nombre: 'Ficticio', precioMes: 200, visible: true, orden: 93, ficticio: true },
      ],
    });
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave: await hashearClave(CLAVE), emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    cookie = await ingresarCookie(servidor, correoDe('super'), CLAVE);
    // Una página publicada con el bloque de precios: la versión lleva los planes (en pruebas, también el ficticio).
    const p = await panel('post', '/sitio/paginas').send({ ruta: RUTA, titulo: 'Precios' });
    paginaId = p.body.id;
    const b = await panel('post', `/sitio/paginas/${paginaId}/bloques`).send({ tipo: 'precios' });
    await panel('patch', `/sitio/paginas/${paginaId}/bloques/${b.body.id}`).send({ visible: true });
    await panel('patch', `/sitio/paginas/${paginaId}`).send({ accion: 'publicar' });
    const publicada = await panel('post', '/sitio/publicar');
    if (publicada.status !== 201) throw new Error(`No se pudo publicar el sitio de prueba: ${publicada.status} ${JSON.stringify(publicada.body)}`);
    await servicio().colaSuscripciones.obliterate({ force: true }).catch(() => undefined);
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'pruebas';
  });

  afterAll(async () => {
    await servicio()?.colaSuscripciones.obliterate({ force: true }).catch(() => undefined);
    await app?.close();
    if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoOriginal;
    if (secretoOriginal === undefined) delete process.env.PAGO_PRUEBA_SECRETO;
    else process.env.PAGO_PRUEBA_SECRETO = secretoOriginal;
    const solicitudes = await prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: { endsWith: `-${sufijo}@suscripciones.test` } } });
    const ids = solicitudes.map((s) => s.id);
    const orgs = solicitudes.map((s) => s.organizacionId).filter((x): x is string => !!x);
    await prisma.auditoria.deleteMany({ where: { OR: [{ entidadId: { in: ids } }, { organizacionId: { in: orgs } }] } });
    await prisma.cobro.deleteMany({ where: { solicitudSuscripcionId: { in: ids } } });
    await prisma.suscripcion.deleteMany({ where: { solicitudId: { in: ids } } });
    await prisma.solicitudSuscripcion.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@suscripciones.test` } } });
    await prisma.plan.deleteMany({ where: { slug: { endsWith: `-${sufijo}` } } });
    await prisma.planesAjustes.deleteMany();
    if (ajustesPrevios) await prisma.planesAjustes.create({ data: ajustesPrevios });
    if (paginaId) {
      await prisma.auditoria.deleteMany({ where: { entidadId: paginaId } });
      await prisma.sitioPagina.deleteMany({ where: { id: paginaId } });
    }
    const usuarios = await prisma.usuario.findMany({ where: { email: correoDe('super') }, select: { id: true } });
    const uids = usuarios.map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: uids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: uids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
  });

  it('el checkout solo vende planes publicados con precio: 404 a medida, oculto, inexistente o ficticio en producción', async () => {
    for (const p of [slug('empresa'), slug('oculto'), 'no-existe']) {
      const r = await checkout(empresa(correoDe('nadie'), { plan: p }));
      expect(r.status).toBe(404);
      expect(r.body.codigo).toBe('PLAN_NO_DISPONIBLE');
    }
    expect((await checkout(empresa(correoDe('ficticio'), { plan: slug('ficticio') }))).status).toBe(201);
    process.env.SITIO_ENTORNO = 'produccion';
    expect((await checkout(empresa(correoDe('nadie'), { plan: slug('ficticio') }))).status).toBe(404);
  });

  it('valida la empresa con el RUC de SUNAT y el consentimiento (422 con el campo de cada error); el anual sale del precio efectivo', async () => {
    const r = await checkout(empresa(correoDe('malo'), { ruc: '20131312956', consentimiento: false, razonSocial: '' }));
    expect(r.status).toBe(422);
    expect(r.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['razonSocial', 'ruc', 'consentimiento']);
    expect((await checkout(empresa(correoDe('malo'), { ciclo: 'SEMANAL' }))).body.detalles[0].campo).toBe('ciclo');
    expect(await solicitudesDe(correoDe('malo'))).toHaveLength(0);

    // HU-1712 · Sin RUC es boleta y pasa de S/ 700: pide el DNI del comprador.
    const sinDni = await checkout(empresa(correoDe('anual'), { ciclo: 'ANUAL', ruc: '' }));
    expect(sinDni.status).toBe(422);
    expect(sinDni.body.detalles).toEqual([{ campo: 'dni', mensaje: 'Las boletas de más de S/ 700 necesitan el DNI del comprador' }]);
    expect(await solicitudesDe(correoDe('anual'))).toHaveLength(0);
    const anual = await checkout(empresa(correoDe('anual'), { ciclo: 'ANUAL', ruc: '', dni: '40506089' }));
    expect(anual.status).toBe(201);
    expect(await prisma.solicitudSuscripcion.findUniqueOrThrow({ where: { id: anual.body.id } })).toMatchObject({ tipoComprobante: 'BOLETA', dniReceptor: '40506089' });
    expect(anual.body).toMatchObject({ estado: 'PENDIENTE', tipoComprobante: 'BOLETA', pasarela: 'pruebas', pago: { tipo: 'simulado' }, resumen: { ciclo: 'ANUAL', subtotal: 12384, igv: 2229.12, total: 14613.12, moneda: 'PEN' } });
  });

  it('409 CORREO_EN_USO si el correo ya es de un usuario', async () => {
    const r = await checkout(empresa(correoDe('super').toUpperCase()));
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('CORREO_EN_USO');
  });

  it('CP-143 · pago aprobado: organización vacía, administrador, suscripción activa, lead «Suscripción» y bienvenida en cola', async () => {
    const correo = correoDe('ana');
    const c = await checkout(empresa(correo));
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ tipoComprobante: 'FACTURA', resumen: { plan: slug('productora'), nombrePlan: 'Productora', ciclo: 'MENSUAL', subtotal: 1290, igv: 232.2, total: 1522.2 } });
    expect((await estado(c.body.id)).body).toMatchObject({ estado: 'PENDIENTE', finPeriodo: null, correoAdmin: correo });

    const antes = Date.now();
    const cuerpo = evento({ id: `evt_${sufijo}_ok`, tipo: 'pago.aprobado', solicitudId: c.body.id, ultimos4: '4242' });
    const w = await webhook(cuerpo);
    expect(w.status).toBe(200);
    expect(w.body).toEqual({ recibido: true, duplicado: false });

    const s = (await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id }, include: { suscripcion: true, organizacion: { include: { usuarios: true, proyectos: true, clientes: true, cursos: true } } } }))!;
    expect(s).toMatchObject({ estado: 'APROBADA', eventoPagoId: `evt_${sufijo}_ok` });
    expect(s.organizacion).toMatchObject({ nombre: 'Minera Andina SAC', ruc: '20131312955', estado: 'ACTIVA' });
    expect(s.organizacion!.slug).toMatch(/^minera-andina-sac-[0-9a-f]{8}$/);
    expect([s.organizacion!.proyectos, s.organizacion!.clientes, s.organizacion!.cursos]).toEqual([[], [], []]);
    expect(s.organizacion!.usuarios).toHaveLength(1);
    expect(s.organizacion!.usuarios[0]).toMatchObject({ email: correo, nombre: 'Ana Quispe', rol: 'ADMINISTRADOR', hashClave: null, activo: true });
    expect(s.suscripcion).toMatchObject({ estado: 'ACTIVA', ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, moneda: 'PEN', pasarela: 'pruebas', ultimos4Digitos: '4242' });
    expect(await prisma.cobro.findMany({ where: { solicitudSuscripcionId: c.body.id } })).toMatchObject([{ suscripcionId: s.suscripcion!.id, eventoPagoId: `evt_${sufijo}_ok`, moneda: 'PEN', pasarela: 'pruebas', ultimos4Digitos: '4242', estado: 'APROBADO' }]);
    const inicio = s.suscripcion!.inicioPeriodo;
    expect(inicio.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(s.suscripcion!.finPeriodo.toISOString()).toBe(finPeriodo(inicio, 'MENSUAL').toISOString());

    const lead = await prisma.lead.findUnique({ where: { correo } });
    expect(lead).toMatchObject({ origen: 'suscripcion', via: 'suscripcion', nombre: 'Ana Quispe', empresa: 'Minera Andina SAC', etapa: 'GANADO', paginaEntrada: '/precios', utmSource: 'google', utmCampaign: 'lanzamiento', consentimiento: true });
    expect(await prisma.auditoria.count({ where: { accion: 'SUSCRIPCION_CREADA', organizacionId: s.organizacionId } })).toBe(1);

    // La bienvenida va en cola con el enlace de crear la clave (72 h); el token sirve para crearla.
    await servicio().ultimoEncolado;
    const job = await servicio().colaSuscripciones.getJob(idTareaBienvenida(c.body.id));
    expect(job?.data.solicitudId).toBe(c.body.id);
    expect(job?.data.enlace).toMatch(/\/clave\?token=[\w-]+$/);
    const token = await prisma.tokenAcceso.findFirstOrThrow({ where: { usuarioId: s.organizacion!.usuarios[0]!.id, tipo: 'INVITACION' } });
    expect(token.expira.getTime() - inicio.getTime()).toBeGreaterThan(71 * 3600_000);
    const t = decodeURIComponent(job!.data.enlace.split('token=')[1]!);
    expect((await request(servidor).post('/api/v1/auth/clave/restablecer').send({ token: t, clave: 'una-clave-nueva-123' })).status).toBe(204);
    expect((await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo, clave: 'una-clave-nueva-123' })).status).toBe(200);

    const e = await estado(c.body.id);
    expect(e.body).toMatchObject({ estado: 'APROBADA', nombrePlan: 'Productora', total: 1522.2, moneda: 'PEN', motivoRechazo: null });
    expect(e.body.finPeriodo).toBe(s.suscripcion!.finPeriodo.toISOString());
  });

  it('RN-18-3 · el mismo evento dos veces (o otro evento de una solicitud ya resuelta) no crea otra organización', async () => {
    const correo = correoDe('doble');
    const c = await checkout(empresa(correo, { razonSocial: 'Doble Pago EIRL' }));
    const cuerpo = evento({ id: `evt_${sufijo}_doble`, tipo: 'pago.aprobado', solicitudId: c.body.id });
    const [a, b] = await Promise.all([webhook(cuerpo), webhook(cuerpo)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.duplicado, b.body.duplicado].sort()).toEqual([false, true]);
    expect((await webhook(cuerpo)).body).toEqual({ recibido: true, duplicado: true });
    expect((await webhook(evento({ id: `evt_${sufijo}_otro`, tipo: 'pago.rechazado', solicitudId: c.body.id }))).body.duplicado).toBe(true);
    expect(await prisma.organizacion.count({ where: { nombre: 'Doble Pago EIRL' } })).toBe(1);
    expect(await prisma.usuario.count({ where: { email: correo } })).toBe(1);
    expect((await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id } }))?.estado).toBe('APROBADA');
  });

  it('una firma errada o ausente da 401 y no cambia nada; un evento sin la forma esperada da 422', async () => {
    const c = await checkout(empresa(correoDe('firma')));
    const cuerpo = evento({ id: `evt_${sufijo}_firma`, tipo: 'pago.aprobado', solicitudId: c.body.id });
    const mala = await webhook(cuerpo, firmar('otro-secreto', cuerpo));
    expect(mala.status).toBe(401);
    expect(mala.body.codigo).toBe('FIRMA_NO_VALIDA');
    expect((await webhook(cuerpo, null)).status).toBe(401);
    // La firma es sobre los bytes tal como llegan: el mismo JSON con otro espaciado no pasa.
    expect((await webhook(Buffer.from(JSON.stringify(JSON.parse(cuerpo.toString()), null, 2)), firmar(SECRETO, cuerpo))).status).toBe(401);
    expect((await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id } }))?.estado).toBe('PENDIENTE');
    expect(await prisma.usuario.count({ where: { email: correoDe('firma') } })).toBe(0);
    const raro = Buffer.from('{"id":"x","tipo":"otro"}');
    expect((await webhook(raro)).status).toBe(422);
    expect((await webhook(cuerpo, firmar(SECRETO, cuerpo), 'desconocida')).status).toBe(404);
  });

  it('pago rechazado con la tarjeta de prueba: la solicitud se cierra con el motivo y no se provisiona nada', async () => {
    const correo = correoDe('rechazo');
    const c = await checkout(empresa(correo, { razonSocial: 'Rechazo SAC' }));
    expect((await request(servidor).post(`/api/v1/publico/checkout/${c.body.id}/pago-prueba`).send({ tarjeta: '5555 5555 5555 4444' })).status).toBe(422);
    const r = await request(servidor).post(`/api/v1/publico/checkout/${c.body.id}/pago-prueba`).send({ tarjeta: '4000 0000 0000 0002' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'RECHAZADA', motivoRechazo: 'La tarjeta de prueba fue rechazada', finPeriodo: null });
    expect(await prisma.organizacion.count({ where: { nombre: 'Rechazo SAC' } })).toBe(0);
    expect(await prisma.usuario.count({ where: { email: correo } })).toBe(0);
    expect(await prisma.lead.count({ where: { correo } })).toBe(0);
    await servicio().ultimoEncolado;
    expect(await servicio().colaSuscripciones.getJob(idTareaBienvenida(c.body.id))).toBeUndefined();
    // Reintentar es un checkout nuevo; la tarjeta que aprueba lo provisiona.
    const otro = await checkout(empresa(correo, { razonSocial: 'Rechazo SAC' }));
    const ok = await request(servidor).post(`/api/v1/publico/checkout/${otro.body.id}/pago-prueba`).send({ tarjeta: '4111-1111-1111-1111' });
    expect(ok.body.estado).toBe('APROBADA');
    expect((await prisma.suscripcion.findUnique({ where: { solicitudId: otro.body.id } }))?.ultimos4Digitos).toBe('1111');
  });

  it('en producción la pasarela de pruebas no existe: sin otra activa, 503 PAGO_NO_DISPONIBLE', async () => {
    const c = await checkout(empresa(correoDe('pendiente-prod')));
    process.env.SITIO_ENTORNO = 'produccion';
    const r = await checkout(empresa(correoDe('prod')));
    expect(r.status).toBe(503);
    expect(r.body.codigo).toBe('PAGO_NO_DISPONIBLE');
    expect(await solicitudesDe(correoDe('prod'))).toHaveLength(0);
    expect((await request(servidor).post(`/api/v1/publico/checkout/${c.body.id}/pago-prueba`).send({ tarjeta: '4111111111111111' })).status).toBe(404);
    const cuerpo = evento({ id: `evt_${sufijo}_prod`, tipo: 'pago.aprobado', solicitudId: c.body.id });
    expect((await webhook(cuerpo)).status).toBe(404);
    expect((await estado('00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
