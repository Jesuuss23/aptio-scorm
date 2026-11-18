// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (los ajustes del sitio son globales).
// HU-1601 · Leads con origen, página de entrada y UTM (REQ-074, PNT-34, CP-128, RN-17-1) contra PostgreSQL: la entrada
// pública en JSON y la del formulario HTML sin JavaScript, un lead por correo con la atribución del primer contacto,
// asistente de IA por el referente, el campo trampa, el límite por IP, el aviso al correo de leads que no bloquea, el
// listado con filtros, el cambio de etapa con auditoría, el CSV neutralizado, y los permisos (401 y 403).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, ID_AJUSTES, prisma, Rol } from '@aptio/db';
import { AJUSTES_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LeadsService, LIMITE_LEADS } from '../src/captacion/leads.service.js';
import { CorreoService, type Correo } from '../src/correo/correo.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@leads.test`;
const visitante = (n: string) => `${n}-${sufijo}@visitante.example`;

describe.skipIf(!hayBase && !process.env.CI)('leads con origen y UTM (HU-1601)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let leads: LeadsService;
  const cookies: Record<string, string> = {};
  const enviados: Correo[] = [];
  let correoFalla = false;
  let respaldoLeads: Awaited<ReturnType<typeof prisma.lead.findMany>> = [];
  let respaldoAjustes: Awaited<ReturnType<typeof prisma.sitioAjustes.findMany>> = [];
  const panel = (m: 'get' | 'patch', r: string, quien: 'super' | 'admin' = 'super') => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
  const publico = (cuerpo: object) => request(servidor).post('/api/v1/publico/leads').send(cuerpo);
  const lead = (correo: string) => prisma.lead.findUniqueOrThrow({ where: { correo } });

  beforeAll(async () => {
    respaldoLeads = await prisma.lead.findMany();
    respaldoAjustes = await prisma.sitioAjustes.findMany();
    await prisma.lead.deleteMany();
    await prisma.sitioAjustes.deleteMany();
    await prisma.sitioAjustes.create({ data: { id: ID_AJUSTES, datos: { ...AJUSTES_POR_DEFECTO, correoLeads: 'ventas@aptio.test' } as object } });
    const org = await prisma.organizacion.create({ data: { nombre: 'Org leads', slug: `leads-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CorreoService).useValue({ enviar: async (c: Correo) => { if (correoFalla) throw new Error('SMTP caído'); enviados.push(c); } })
      .compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    leads = app.get(LeadsService);
    for (const quien of ['super', 'admin'] as const) {
      cookies[quien] = await ingresarCookie(servidor, correoDe(quien), CLAVE);
    }
  });

  beforeEach(() => {
    leads.reiniciarLimite();
    app.get(LimitePublicoService).reiniciar();
    correoFalla = false;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.lead.deleteMany();
    if (respaldoLeads.length) await prisma.lead.createMany({ data: respaldoLeads.map((l) => ({ ...l, historialContactos: l.historialContactos as object })) });
    await prisma.sitioAjustes.deleteMany();
    for (const f of respaldoAjustes) await prisma.sitioAjustes.create({ data: { ...f, datos: f.datos as object } });
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@leads.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `leads-${sufijo}` } });
  });

  it('CP-128 · llegó con utm_source=linkedin y deja su correo en el popup: origen Popup, página de entrada y UTM linkedin', async () => {
    const res = await publico({
      correo: visitante('popup').toUpperCase(), consentimiento: true, via: 'popup',
      paginaEntrada: '/s/precios?utm_source=linkedin', paginaFormulario: '/s/blog/guia', referente: 'https://www.linkedin.com/feed/?trk=x',
      utm_source: 'LinkedIn', utm_medium: 'social', utm_campaign: 'Lanzamiento Q4',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ recibido: true });
    expect(res.headers['cache-control']).toBe('no-store');
    const l = await lead(visitante('popup'));
    expect(l).toMatchObject({
      origen: 'popup', via: 'popup', paginaEntrada: '/precios', paginaFormulario: '/blog/guia', utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'Lanzamiento Q4',
      referente: 'https://www.linkedin.com/feed/', etapa: 'NUEVO', consentimiento: true, totalContactos: 1, nombre: '',
    });
    expect(l.consentimientoEn).toBeInstanceOf(Date);
    // El panel lo muestra con su origen, su entrada y su UTM.
    const lista = await panel('get', '/captacion/leads?origen=popup');
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ total: 1, pagina: 1, porPagina: 25, leads: [{ correo: visitante('popup'), origen: 'popup', paginaEntrada: '/precios', utmSource: 'linkedin' }] });
  });

  it('el mismo correo otra vez: conserva el primer origen, entrada y UTM, completa lo que faltaba y suma al historial', async () => {
    const res = await publico({ correo: visitante('popup'), consentimiento: true, nombre: 'Rocío Mendoza', empresa: 'Colegio Nuevo Horizonte', mensaje: 'Quiero una demo', paginaEntrada: '/', paginaFormulario: '/contacto', utm_source: 'google' });
    expect(res.status).toBe(201);
    const l = await lead(visitante('popup'));
    expect(l).toMatchObject({ origen: 'popup', via: 'popup', paginaEntrada: '/precios', utmSource: 'linkedin', nombre: 'Rocío Mendoza', empresa: 'Colegio Nuevo Horizonte', mensaje: 'Quiero una demo', totalContactos: 2 });
    expect(l.historialContactos).toMatchObject([{ via: 'popup', pagina: '/blog/guia' }, { via: 'formulario', pagina: '/contacto', mensaje: 'Quiero una demo' }]);
    expect(await prisma.lead.count({ where: { correo: visitante('popup') } })).toBe(1);
  });

  it('con referente de un asistente de IA el origen es Asistente IA y la vía guarda el canal', async () => {
    await publico({ correo: visitante('ia'), nombre: 'Elena Soto', consentimiento: true, via: 'formulario', paginaEntrada: '/', referente: 'https://www.perplexity.ai/search?q=scorm' });
    expect(await lead(visitante('ia'))).toMatchObject({ origen: 'asistente_ia', via: 'formulario', referente: 'https://www.perplexity.ai/search', utmSource: null });
  });

  it('valida como datos no confiables: 422 con el campo de cada error y nada guardado', async () => {
    const res = await publico({ correo: 'no-es-correo', nombre: '<b>x</b>', via: 'fax' });
    expect(res.status).toBe(422);
    expect(res.body.codigo).toBe('NO_VALIDO');
    expect(res.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['via', 'correo', 'nombre', 'consentimiento']);
    const sinConsentimiento = await publico({ correo: visitante('sin'), nombre: 'Ana', consentimiento: false });
    expect(sinConsentimiento.status).toBe(422);
    expect(sinConsentimiento.body.detalles).toEqual([{ campo: 'consentimiento', mensaje: 'Acepta el tratamiento de tus datos personales para poder contactarte' }]);
    expect(await prisma.lead.count({ where: { correo: { in: [visitante('sin'), 'no-es-correo'] } } })).toBe(0);
  });

  it('con el campo trampa lleno responde igual y no guarda nada', async () => {
    const res = await publico({ correo: visitante('bot'), nombre: 'Bot', consentimiento: true, website: 'https://spam.example' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ recibido: true });
    expect(await prisma.lead.count({ where: { correo: visitante('bot') } })).toBe(0);
  });

  it(`límite propio por IP: ${LIMITE_LEADS.envios} envíos cada 10 minutos, después 429 con Retry-After`, async () => {
    for (let i = 0; i < LIMITE_LEADS.envios; i += 1) expect((await publico({ correo: visitante(`l${i}`), nombre: 'X', consentimiento: true })).status).toBe(201);
    const res = await publico({ correo: visitante('l9'), nombre: 'X', consentimiento: true });
    expect(res.status).toBe(429);
    expect(res.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(await prisma.lead.count({ where: { correo: visitante('l9') } })).toBe(0);
  });

  it('avisa al correo de leads; si el correo falla, el lead igual queda guardado', async () => {
    enviados.length = 0;
    await publico({ correo: visitante('aviso'), nombre: 'Luis Gamarra', consentimiento: true, mensaje: 'Hola', utm_source: 'google', utm_medium: 'cpc' });
    await leads.ultimoAviso;
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: 'ventas@aptio.test', asunto: 'Lead nuevo · Formulario · Luis Gamarra' });
    expect(enviados[0]!.texto).toContain('UTM: google / cpc');
    expect(enviados[0]!.texto).toContain('Mensaje:\nHola');

    correoFalla = true;
    const res = await publico({ correo: visitante('sin-smtp'), nombre: 'Tomás', consentimiento: true });
    expect(res.status).toBe(201);
    await leads.ultimoAviso;
    expect(await prisma.lead.count({ where: { correo: visitante('sin-smtp') } })).toBe(1);
  });

  it('el formulario HTML sin JavaScript: 303 a la página de gracias, o la página de errores con 422', async () => {
    const ok = await request(servidor).post('/s/_lead').type('form').send({
      nombre: 'Gabriela Ponce', correo: visitante('html'), consentimiento: 'on', via: 'formulario', idioma: 'es',
      paginaFormulario: '/contacto', paginaEntrada: '', referente: '', utm_source: '', website: '',
    });
    expect(ok.status).toBe(303);
    expect(ok.headers.location).toBe('/s/_gracias');
    // Sin el script no hay entrada ni UTM: la entrada es la página del formulario.
    expect(await lead(visitante('html'))).toMatchObject({ origen: 'formulario', paginaEntrada: '/contacto', paginaFormulario: '/contacto', utmSource: null });

    const en = await request(servidor).post('/s/_lead').type('form').send({ nombre: 'Ann', correo: visitante('html-en'), consentimiento: 'on', idioma: 'en', paginaFormulario: '/en' });
    expect(en.headers.location).toBe('/s/en/_gracias');

    const mal = await request(servidor).post('/s/_lead').type('form').send({ nombre: 'Ana', correo: 'mal', paginaFormulario: '/contacto' });
    expect(mal.status).toBe(422);
    expect(mal.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(mal.headers['content-security-policy']).toContain("script-src 'self'");
    expect(mal.headers['cache-control']).toBe('private, no-store');
    expect(mal.text).toContain('<li>Escribe un correo válido, por ejemplo nombre@empresa.com</li>');
    expect(mal.text).toContain('href="/s/contacto#contacto"');

    const trampa = await request(servidor).post('/s/_lead').type('form').send({ nombre: 'Bot', correo: visitante('html-bot'), consentimiento: 'on', website: 'x' });
    expect(trampa.status).toBe(303);
    expect(await prisma.lead.count({ where: { correo: visitante('html-bot') } })).toBe(0);
  });

  it('el formulario HTML también respeta el límite por IP con una página 429', async () => {
    for (let i = 0; i < LIMITE_LEADS.envios; i += 1) await request(servidor).post('/s/_lead').type('form').send({ correo: 'mal' });
    const res = await request(servidor).post('/s/_lead').type('form').send({ nombre: 'X', correo: visitante('html-l'), consentimiento: 'on' });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.text).toContain('Recibimos varios envíos seguidos desde tu conexión');
  });

  it('el listado pagina y filtra por origen y etapa; el cambio de etapa queda en Auditoría', async () => {
    const todos = await panel('get', '/captacion/leads?porPagina=2');
    expect(todos.body.leads).toHaveLength(2);
    expect(todos.body.total).toBeGreaterThanOrEqual(8);
    const fechas = todos.body.leads.map((l: { creadoEn: string }) => l.creadoEn);
    expect([...fechas].sort().reverse()).toEqual(fechas);
    expect((await panel('get', '/captacion/leads?origen=asistente_ia')).body).toMatchObject({ total: 1, leads: [{ correo: visitante('ia') }] });
    expect((await panel('get', '/captacion/leads?origen=otro')).status).toBe(422);
    expect((await panel('get', '/captacion/leads?porPagina=500')).status).toBe(422);

    const id = (await lead(visitante('ia'))).id;
    const cambio = await panel('patch', `/captacion/leads/${id}`).send({ etapa: 'CONTACTADO' });
    expect(cambio.status).toBe(200);
    expect(cambio.body).toMatchObject({ id, etapa: 'CONTACTADO', origen: 'asistente_ia' });
    expect((await panel('get', '/captacion/leads?etapa=CONTACTADO')).body).toMatchObject({ total: 1, leads: [{ id }] });
    expect((await panel('patch', `/captacion/leads/${id}`).send({ etapa: 'GANADISIMO' })).status).toBe(422);
    expect((await panel('patch', `/captacion/leads/${crypto.randomUUID()}`).send({ etapa: 'DEMO' })).status).toBe(404);
    const aud = await prisma.auditoria.findMany({ where: { accion: 'LEAD_ETAPA_CAMBIADA', entidadId: id } });
    expect(aud).toHaveLength(1);
    expect(aud[0]!.datos).toEqual({ antes: 'NUEVO', etapa: 'CONTACTADO' });
  });

  it('exporta el CSV con los filtros, neutraliza las fórmulas y lo audita', async () => {
    await publico({ correo: visitante('formula'), nombre: '=HYPERLINK("http://malo.example")', empresa: '+51 999', consentimiento: true, via: 'popup' });
    const res = await panel('get', '/captacion/leads/exportar.csv?origen=popup');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    const filas = res.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(filas[0]).toMatch(/^"Fecha","Nombre","Correo"/);
    expect(filas).toHaveLength(3);
    expect(res.text).toContain('"\'=HYPERLINK(""http://malo.example"")"');
    expect(res.text).toContain('"\'+51 999"');
    expect(res.text).not.toContain(visitante('ia'));
    const aud = await prisma.auditoria.findMany({ where: { accion: 'LEADS_EXPORTADOS', usuario: { email: correoDe('super') } } });
    expect(aud.at(-1)!.datos).toEqual({ filas: 2, filtros: { origen: 'popup' } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    const id = crypto.randomUUID();
    for (const [m, r] of [['get', '/captacion/leads'], ['get', '/captacion/leads/exportar.csv'], ['patch', `/captacion/leads/${id}`]] as const) {
      expect([r, (await request(servidor)[m](`/api/v1${r}`)).status]).toEqual([r, 401]);
      expect([r, (await panel(m, r, 'admin')).status]).toEqual([r, 403]);
    }
  });
});
