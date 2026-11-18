// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (los planes, las pasarelas y la
// versión son globales).
// HU-1704 · Pasarelas de pago y webhooks (REQ-084, REQ-110, CP-144, CP-145, RN-18-9) contra PostgreSQL y Redis, con
// Stripe simulado (un `fetch` falso: no sale a internet) y sus eventos firmados como los firma Stripe:
// - Ventas › Pasarelas: listar sin secretos, mostrar/ocultar, modo y orden, con auditoría;
// - precios en USD del plan y las monedas que se ofrecen;
// - pago en dólares con Stripe Checkout y su webhook firmado; un cobro por evento, sin datos de tarjeta;
// - CP-144: el mismo evento varias veces a la vez deja un solo cobro y un solo trabajo «emitir comprobante»;
// - CP-145: una firma inválida da 401 y no cambia ninguna suscripción ni cobro;
// - el monto distinto deja un cobro sin alta, y el reembolso auditado de un cobro sin alta.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, ID_PLANES_AJUSTES, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import type { Fetch } from '../src/ventas/pasarelas/contrato.js';
import { firmarStripe, PasarelaStripe } from '../src/ventas/pasarelas/stripe.js';
import { PasarelasService } from '../src/ventas/pasarelas.service.js';
import { firmar, SuscripcionesService } from '../src/ventas/suscripciones.service.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const SECRETO = 'secreto-de-las-pruebas-e2e-pasarelas';
const WHSEC = 'whsec_pruebas_e2e_de_aptio';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@pasarelas.test`;
const slug = (n: string) => `${n}-${sufijo}`;
const RUTA = `/precios-pas-${sufijo}`;
const VARIABLES = ['SITIO_ENTORNO', 'PAGO_PRUEBA_SECRETO', 'STRIPE_LLAVE_SECRETA_PRUEBAS', 'STRIPE_SECRETO_WEBHOOK_PRUEBAS', 'SITIO_URL', 'SITIO_BASE'] as const;

describe.skipIf(!hayBase && !process.env.CI)('pasarelas de pago y webhooks (HU-1704)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let cookie = '';
  let paginaId = '';
  let planId = '';
  const originales = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.planesAjustes.findUnique>> = null;
  let pasarelasPrevias: Awaited<ReturnType<typeof prisma.pasarelaConfig.findMany>> = [];
  /** Lo que respondió Stripe (simulado) y si el próximo reembolso falla. */
  const stripe = { llamadas: [] as { url: string; cuerpo: URLSearchParams }[], reembolsoFalla: false };
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    const cuerpo = new URLSearchParams(String(init?.body ?? ''));
    stripe.llamadas.push({ url: String(url), cuerpo });
    const r = (status: number, d: unknown) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/checkout/sessions')) return r(200, { id: `cs_test_${cuerpo.get('client_reference_id')}`, url: `https://checkout.stripe.com/c/pay/cs_test_${sufijo}` });
    if (String(url).endsWith('/refunds')) return stripe.reembolsoFalla ? r(400, { error: { message: 'Charge already refunded' } }) : r(200, { id: `re_${sufijo}_${stripe.llamadas.length}`, status: 'succeeded' });
    return r(404, {});
  }) as Fetch;

  const panel = (m: 'get' | 'post' | 'patch' | 'put', ruta: string) => request(servidor)[m](`/api/v1${ruta}`).set('Cookie', cookie);
  const servicio = () => app.get(SuscripcionesService);
  const sinLimite = () => { app.get(LimitePublicoService).reiniciar(); servicio().reiniciarLimite(); };
  const empresa = (correo: string, extra: Record<string, unknown> = {}) => ({
    plan: slug('productora'), ciclo: 'MENSUAL', razonSocial: 'Andes Learning SAC', ruc: '', nombreAdmin: 'Luis Rojas', correoAdmin: correo, consentimiento: true, ...extra,
  });
  const checkout = (cuerpo: Record<string, unknown>) => { sinLimite(); return request(servidor).post('/api/v1/publico/checkout').send(cuerpo); };
  const webhookPruebas = (o: Record<string, unknown>) => {
    const cuerpo = JSON.stringify(o);
    return request(servidor).post('/api/v1/webhooks/pago/pruebas').set('Content-Type', 'application/json').set('X-Aptio-Firma', firmar(SECRETO, cuerpo)).send(cuerpo);
  };
  const eventoStripe = (solicitudId: string, id: string, extra: Record<string, unknown> = {}, tipo = 'checkout.session.completed') => JSON.stringify({
    id, type: tipo, data: { object: { id: `cs_test_${solicitudId}`, client_reference_id: solicitudId, payment_status: 'paid', payment_intent: `pi_${id}`, amount_total: 41182, currency: 'usd', ...extra } },
  });
  const webhookStripe = (cuerpo: string, firma: string | null = firmarStripe(WHSEC, cuerpo, Math.floor(Date.now() / 1000))) => {
    const r = request(servidor).post('/api/v1/webhooks/pago/stripe').set('Content-Type', 'application/json');
    return (firma ? r.set('Stripe-Signature', firma) : r).send(cuerpo);
  };
  const pasarela = (codigo: string, cambio: Record<string, unknown>) => panel('patch', `/ventas/pasarelas/${codigo}`).send(cambio);
  const publicar = async () => {
    const r = await panel('post', '/sitio/publicar');
    if (r.status !== 201) throw new Error(`No se pudo publicar: ${r.status} ${JSON.stringify(r.body)}`);
  };

  beforeAll(async () => {
    Object.assign(process.env, { SITIO_ENTORNO: 'pruebas', PAGO_PRUEBA_SECRETO: SECRETO, STRIPE_LLAVE_SECRETA_PRUEBAS: 'sk_test_e2e', STRIPE_SECRETO_WEBHOOK_PRUEBAS: WHSEC, SITIO_URL: 'https://aptio.example', SITIO_BASE: '/s' });
    ajustesPrevios = await prisma.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    pasarelasPrevias = await prisma.pasarelaConfig.findMany();
    await prisma.pasarelaConfig.deleteMany();
    await prisma.planesAjustes.upsert({ where: { id: ID_PLANES_AJUSTES }, create: { id: ID_PLANES_AJUSTES, mostrarAnual: true, descuentoAnual: 20, conIgv: false }, update: { mostrarAnual: true, descuentoAnual: 20, conIgv: false } });
    planId = (await prisma.plan.create({ data: { slug: slug('productora'), nombre: 'Productora', precioMes: 1290, visible: true, orden: 95 } })).id;
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave: await hashearClave(CLAVE), emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    app.get(PasarelasService).reemplazar(new PasarelaStripe(process.env, http));
    cookie = await ingresarCookie(servidor, correoDe('super'), CLAVE);
    const p = await panel('post', '/sitio/paginas').send({ ruta: RUTA, titulo: 'Precios' });
    paginaId = p.body.id;
    const b = await panel('post', `/sitio/paginas/${paginaId}/bloques`).send({ tipo: 'precios' });
    await panel('patch', `/sitio/paginas/${paginaId}/bloques/${b.body.id}`).send({ visible: true });
    await panel('patch', `/sitio/paginas/${paginaId}`).send({ accion: 'publicar' });
    await servicio().colaComprobantes.obliterate({ force: true }).catch(() => undefined);
  });

  beforeEach(() => {
    process.env.SITIO_ENTORNO = 'pruebas';
  });

  afterAll(async () => {
    await servicio()?.colaComprobantes.obliterate({ force: true }).catch(() => undefined);
    await servicio()?.colaSuscripciones.obliterate({ force: true }).catch(() => undefined);
    await app?.close();
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
    const solicitudes = await prisma.solicitudSuscripcion.findMany({ where: { correoAdmin: { endsWith: `-${sufijo}@pasarelas.test` } } });
    const ids = solicitudes.map((s) => s.id);
    const orgs = solicitudes.map((s) => s.organizacionId).filter((x): x is string => !!x);
    const cobros = (await prisma.cobro.findMany({ where: { solicitudSuscripcionId: { in: ids } }, select: { id: true } })).map((c) => c.id);
    await prisma.auditoria.deleteMany({ where: { OR: [{ entidadId: { in: [...ids, ...cobros] } }, { organizacionId: { in: orgs } }] } });
    await prisma.cobro.deleteMany({ where: { id: { in: cobros } } });
    await prisma.suscripcion.deleteMany({ where: { solicitudId: { in: ids } } });
    await prisma.solicitudSuscripcion.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@pasarelas.test` } } });
    await prisma.plan.deleteMany({ where: { slug: { endsWith: `-${sufijo}` } } });
    await prisma.planesAjustes.deleteMany();
    if (ajustesPrevios) await prisma.planesAjustes.create({ data: ajustesPrevios });
    await prisma.pasarelaConfig.deleteMany();
    if (pasarelasPrevias.length) await prisma.pasarelaConfig.createMany({ data: pasarelasPrevias });
    if (paginaId) {
      await prisma.auditoria.deleteMany({ where: { entidadId: paginaId } });
      await prisma.sitioPagina.deleteMany({ where: { id: paginaId } });
    }
    const uids = (await prisma.usuario.findMany({ where: { email: correoDe('super') }, select: { id: true } })).map((u) => u.id);
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: uids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: uids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
  });

  it('Ventas › Pasarelas: lista en orden sin secretos, cambia visible y modo, ordena y audita', async () => {
    const l = await panel('get', '/ventas/pasarelas');
    expect(l.status).toBe(200);
    expect(l.body.pasarelas.map((p: { codigo: string }) => p.codigo)).toEqual(['pruebas', 'culqi', 'stripe']);
    expect(l.body.pasarelas[0]).toMatchObject({ codigo: 'pruebas', visible: true, modo: 'pruebas', monedas: ['PEN', 'USD'], flujo: 'simulado', simulada: true, activa: true, variablesFaltantes: [] });
    expect(l.body.pasarelas[1]).toMatchObject({ codigo: 'culqi', visible: false, activa: false, monedas: ['PEN'], flujo: 'formulario', variablesFaltantes: ['CULQI_LLAVE_PUBLICA_PRUEBAS', 'CULQI_LLAVE_SECRETA_PRUEBAS', 'CULQI_SECRETO_WEBHOOK_PRUEBAS'] });
    expect(l.body.pasarelas[2]).toMatchObject({ codigo: 'stripe', visible: false, activa: true, monedas: ['USD'], flujo: 'redireccion' });
    expect(JSON.stringify(l.body)).not.toMatch(/sk_test_e2e|whsec_|secreto-de-las/);

    const s = await pasarela('stripe', { visible: true, nombre: ' Tarjeta internacional ' });
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ codigo: 'stripe', visible: true, nombre: 'Tarjeta internacional' });
    expect(await prisma.auditoria.count({ where: { accion: 'PASARELA_EDITADA', entidadId: 'stripe' } })).toBeGreaterThanOrEqual(1);
    const prod = await pasarela('stripe', { modo: 'produccion' });
    expect(prod.body).toMatchObject({ modo: 'produccion', activa: false, variablesFaltantes: ['STRIPE_LLAVE_SECRETA_PRODUCCION', 'STRIPE_SECRETO_WEBHOOK_PRODUCCION'] });
    expect((await pasarela('stripe', { modo: 'pruebas' })).body.activa).toBe(true);
    expect((await pasarela('pruebas', { modo: 'produccion' })).status).toBe(422);
    expect((await pasarela('paypal', { visible: true })).status).toBe(404);
    expect((await panel('put', '/ventas/pasarelas/orden').send({ codigos: ['stripe', 'pruebas'] })).body.codigo).toBe('ORDEN_INCOMPLETO');
    const o = await panel('put', '/ventas/pasarelas/orden').send({ codigos: ['stripe', 'pruebas', 'culqi'] });
    expect(o.body.pasarelas.map((p: { codigo: string }) => p.codigo)).toEqual(['stripe', 'pruebas', 'culqi']);
    expect(await prisma.auditoria.count({ where: { accion: 'PASARELAS_ORDEN_CAMBIADO' } })).toBeGreaterThanOrEqual(1);
    expect((await request(servidor).get('/api/v1/ventas/pasarelas')).status).toBe(401);
  });

  it('el plan guarda precios en USD y el público los ve solo si una pasarela visible cobra en dólares', async () => {
    const r = await panel('patch', `/ventas/planes/${planId}`).send({ precioMesUsd: 349 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ precioMesUsd: 349, precioAnualUsd: null, precioAnualUsdEfectivo: 3350 });
    expect((await panel('patch', `/ventas/planes/${planId}`).send({ precioMesUsd: 0 })).status).toBe(422);
    await publicar();
    const pub = await request(servidor).get(`/api/v1/publico/planes/${slug('productora')}`);
    expect(pub.body).toMatchObject({ precioMes: 1290, precioMesUsd: 349, precioAnualUsd: 3350, monedas: ['PEN', 'USD'] });
    // Sin pasarelas visibles que cobren en dólares (Stripe y la simulada ocultas), no hay USD.
    await pasarela('stripe', { visible: false });
    await pasarela('pruebas', { visible: false });
    expect((await request(servidor).get(`/api/v1/publico/planes/${slug('productora')}`)).body).toMatchObject({ precioMesUsd: null, precioAnualUsd: null, monedas: ['PEN'] });
    expect((await checkout(empresa(correoDe('sin-pasarela')))).status).toBe(503);
    await pasarela('stripe', { visible: true });
    await pasarela('pruebas', { visible: true });
  });

  it('RN-18-9 · en dólares cobra Stripe Checkout; su webhook firmado activa la suscripción en USD con un cobro sin datos de tarjeta', async () => {
    const correo = correoDe('usd');
    const c = await checkout(empresa(correo, { moneda: 'USD', razonSocial: 'Global Learning LLC' }));
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ pasarela: 'stripe', resumen: { subtotal: 349, igv: 62.82, total: 411.82, moneda: 'USD' }, pago: { tipo: 'redireccion', url: `https://checkout.stripe.com/c/pay/cs_test_${sufijo}` } });
    const sesion = stripe.llamadas.find((l) => l.cuerpo.get('client_reference_id') === c.body.id)!;
    expect(sesion.cuerpo.get('line_items[0][price_data][unit_amount]')).toBe('41182');
    expect(sesion.cuerpo.get('success_url')).toBe(`https://aptio.example/s/pago?plan=${slug('productora')}&checkout=${c.body.id}`);
    // Los soles siguen con la simulada (Stripe no cobra en soles).
    expect((await checkout(empresa(correoDe('pen')))).body).toMatchObject({ pasarela: 'pruebas', pago: { tipo: 'simulado' }, resumen: { moneda: 'PEN' } });

    const w = await webhookStripe(eventoStripe(c.body.id, `evt_${sufijo}_usd`));
    expect(w.status).toBe(200);
    expect(w.body).toEqual({ recibido: true, duplicado: false });
    const s = (await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id }, include: { suscripcion: true, cobros: true } }))!;
    expect(s).toMatchObject({ estado: 'APROBADA', moneda: 'USD', pasarela: 'stripe' });
    expect(s.suscripcion).toMatchObject({ estado: 'ACTIVA', moneda: 'USD', precioPactadoSinIgv: 349, pasarela: 'stripe', ultimos4Digitos: null });
    expect(s.cobros).toHaveLength(1);
    expect(s.cobros[0]).toMatchObject({ suscripcionId: s.suscripcion!.id, moneda: 'USD', pasarela: 'stripe', tokenPago: `pi_evt_${sufijo}_usd`, estado: 'APROBADO' });
    expect(Number(s.cobros[0]!.monto)).toBe(411.82);
    expect((await request(servidor).get(`/api/v1/publico/checkout/${c.body.id}`)).body).toMatchObject({ estado: 'APROBADA', moneda: 'USD', total: 411.82 });
    // Un evento que no es de pago se acepta sin crear nada.
    expect((await webhookStripe(eventoStripe(c.body.id, `evt_${sufijo}_otro`, {}, 'payment_intent.created'))).body).toEqual({ recibido: true, duplicado: false, ignorado: true });
    expect((await checkout(empresa(correoDe('usd-anual'), { moneda: 'EUR' }))).body.detalles[0].campo).toBe('moneda');
  });

  it('CP-144 · el mismo evento enviado varias veces a la vez deja un solo cobro y un solo trabajo «emitir comprobante»', async () => {
    const c = await checkout(empresa(correoDe('cp144'), { razonSocial: 'Repetido SAC' }));
    expect(c.body.pasarela).toBe('pruebas');
    const ev = { id: `evt_${sufijo}_cp144`, tipo: 'pago.aprobado', solicitudId: c.body.id, ultimos4: '1111', monto: 1522.2, moneda: 'PEN' };
    const rs = await Promise.all([webhookPruebas(ev), webhookPruebas(ev), webhookPruebas(ev)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(rs.filter((r) => r.body.duplicado === false)).toHaveLength(1);
    expect((await webhookPruebas(ev)).body.duplicado).toBe(true);
    const cobros = await prisma.cobro.findMany({ where: { solicitudSuscripcionId: c.body.id } });
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ eventoPagoId: `evt_${sufijo}_cp144`, ultimos4Digitos: '1111', moneda: 'PEN' });
    expect(await prisma.organizacion.count({ where: { nombre: 'Repetido SAC' } })).toBe(1);
    await servicio().ultimoEncolado;
    const trabajos = (await servicio().colaComprobantes.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'])).filter((j) => j.data.cobroId === cobros[0]!.id);
    expect(trabajos).toHaveLength(1);
    expect(trabajos[0]!.id).toBe(cobros[0]!.id);
    expect(trabajos[0]!.name).toBe('emitir-comprobante');
  });

  it('CP-145 · una firma inválida da 401 y no cambia ninguna suscripción ni cobro', async () => {
    const activa = (await prisma.solicitudSuscripcion.findFirstOrThrow({ where: { correoAdmin: correoDe('usd') }, include: { suscripcion: true } }));
    const antes = activa.suscripcion!;
    const c = await checkout(empresa(correoDe('cp145'), { moneda: 'USD' }));
    const ahora = Math.floor(Date.now() / 1000);
    const cuerpo = eventoStripe(c.body.id, `evt_${sufijo}_cp145`);
    const casos = [firmarStripe('whsec_otro', cuerpo, ahora), firmarStripe(WHSEC, cuerpo, ahora - 3600), `t=${ahora}`, null];
    for (const firma of casos) {
      const r = await webhookStripe(cuerpo, firma);
      expect(r.status).toBe(401);
      expect(r.body.codigo).toBe('FIRMA_NO_VALIDA');
    }
    // Firmado para otro cuerpo, o un evento falso contra la suscripción ya activa.
    expect((await webhookStripe(cuerpo, firmarStripe(WHSEC, eventoStripe(c.body.id, 'evt_otro'), ahora))).status).toBe(401);
    expect((await webhookStripe(eventoStripe(activa.id, `evt_${sufijo}_falso`, {}, 'checkout.session.expired'), firmarStripe('whsec_otro', 'x', ahora))).status).toBe(401);
    expect((await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id } }))?.estado).toBe('PENDIENTE');
    expect(await prisma.cobro.count({ where: { solicitudSuscripcionId: c.body.id } })).toBe(0);
    expect(await prisma.suscripcion.findUnique({ where: { id: antes.id } })).toEqual(antes);
    expect(await prisma.cobro.count({ where: { solicitudSuscripcionId: activa.id } })).toBe(1);
    expect(await prisma.auditoria.count({ where: { accion: 'PAGO_FIRMA_NO_VALIDA', datos: { path: ['pasarela'], equals: 'stripe' } } })).toBeGreaterThanOrEqual(6);
  });

  it('un monto distinto deja el cobro sin alta; el superadmin lo reembolsa con auditoría (SUP-291)', async () => {
    const c = await checkout(empresa(correoDe('monto'), { moneda: 'USD', razonSocial: 'Monto Raro SAC' }));
    const w = await webhookStripe(eventoStripe(c.body.id, `evt_${sufijo}_monto`, { amount_total: 100 }));
    expect(w.status).toBe(200);
    const s = (await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id }, include: { suscripcion: true, cobros: true } }))!;
    expect(s.estado).toBe('APROBADA');
    expect(s.suscripcion).toBeNull();
    expect(s.motivoRechazo).toMatch(/^MONTO_NO_COINCIDE/);
    expect(await prisma.organizacion.count({ where: { nombre: 'Monto Raro SAC' } })).toBe(0);
    expect(s.cobros).toHaveLength(1);
    expect(await prisma.auditoria.count({ where: { accion: 'PAGO_MONTO_NO_COINCIDE', entidadId: c.body.id } })).toBe(1);
    const cobro = s.cobros[0]!;

    const lista = await panel('get', '/ventas/cobros?sinAlta=true');
    expect(lista.body.cobros.find((x: { id: string }) => x.id === cobro.id)).toMatchObject({ reembolsable: true, estado: 'APROBADO', moneda: 'USD', razonSocial: 'Monto Raro SAC', motivoSinAlta: expect.stringMatching(/^MONTO_NO_COINCIDE/) });
    expect(JSON.stringify(lista.body)).not.toMatch(/tokenPago|pi_evt/);

    // Si la pasarela falla, el cobro sigue aprobado.
    stripe.reembolsoFalla = true;
    const fallo = await panel('post', `/ventas/cobros/${cobro.id}/reembolsar`);
    expect(fallo.status).toBe(502);
    expect(fallo.body.mensaje).toBe('Charge already refunded');
    expect((await prisma.cobro.findUnique({ where: { id: cobro.id } }))?.estado).toBe('APROBADO');
    stripe.reembolsoFalla = false;

    const r = await panel('post', `/ventas/cobros/${cobro.id}/reembolsar`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'REEMBOLSADO', reembolsable: false });
    expect(r.body.reembolsoId).toMatch(/^re_/);
    const llamada = stripe.llamadas.at(-1)!;
    expect(llamada.url).toBe('https://api.stripe.com/v1/refunds');
    expect(Object.fromEntries(llamada.cuerpo)).toEqual({ payment_intent: `pi_evt_${sufijo}_monto`, amount: '100' });
    expect(await prisma.auditoria.count({ where: { accion: 'COBRO_REEMBOLSADO', entidadId: cobro.id } })).toBe(1);
    expect((await panel('post', `/ventas/cobros/${cobro.id}/reembolsar`)).body.codigo).toBe('COBRO_YA_REEMBOLSADO');
    const conAlta = await prisma.cobro.findFirstOrThrow({ where: { solicitud: { correoAdmin: correoDe('usd') } } });
    expect((await panel('post', `/ventas/cobros/${conAlta.id}/reembolsar`)).body.codigo).toBe('COBRO_CON_SUSCRIPCION');
    expect((await panel('get', `/ventas/cobros/${cobro.id}`)).body.estado).toBe('REEMBOLSADO');
    expect((await panel('post', '/ventas/cobros/00000000-0000-4000-8000-000000000000/reembolsar')).status).toBe(404);
  });

  it('un pago aprobado que llega con la solicitud ya cerrada también deja su cobro sin alta', async () => {
    const c = await checkout(empresa(correoDe('tarde'), { moneda: 'USD' }));
    expect((await webhookStripe(eventoStripe(c.body.id, `evt_${sufijo}_vence`, { payment_status: 'unpaid' }, 'checkout.session.expired'))).status).toBe(200);
    expect((await prisma.solicitudSuscripcion.findUnique({ where: { id: c.body.id } }))?.estado).toBe('RECHAZADA');
    expect((await webhookStripe(eventoStripe(c.body.id, `evt_${sufijo}_tarde`))).body.duplicado).toBe(false);
    expect(await prisma.cobro.findMany({ where: { solicitudSuscripcionId: c.body.id } })).toMatchObject([{ suscripcionId: null, eventoPagoId: `evt_${sufijo}_tarde` }]);
    expect(await prisma.auditoria.count({ where: { accion: 'PAGO_SIN_SOLICITUD_PENDIENTE', entidadId: c.body.id } })).toBe(1);
  });
});
