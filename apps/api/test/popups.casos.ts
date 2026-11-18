// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (los popups son globales).
// HU-1603 · Popups (REQ-076, PNT-31, RN-17-3, CP-132) contra PostgreSQL: alta, cambios validados, orden, borrado,
// reinicio de resultados, auditoría y permisos; `GET /s/_popups.json` en vivo (apagado y ficticio no salen), los eventos
// de `POST /s/_popup` con su límite por IP y el correo de un popup que entra a Leads con origen «Popup».
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { LeadsService } from '../src/captacion/leads.service.js';
import { LIMITE_EVENTOS_POPUP, PopupsService } from '../src/captacion/popups.service.js';
import { CorreoService } from '../src/correo/correo.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import { ingresarCookie } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@popups.test`;
const BASE = { nombre: 'Guía de microaprendizaje', tipo: 'modal', disparador: 'intencion_salida', titulo: 'Llévate la guía', texto: '12 páginas con plantillas.', boton: 'Enviarme la guía', accion: 'pedir_correo' };

describe.skipIf(!hayBase && !process.env.CI)('popups (HU-1603)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let respaldo: Awaited<ReturnType<typeof prisma.sitioPopup.findMany>> = [];
  let entornoAnterior: string | undefined;
  const cookies: Record<string, string> = {};
  const panel = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', r: string, quien: 'super' | 'admin' = 'super') => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);

  beforeAll(async () => {
    entornoAnterior = process.env.SITIO_ENTORNO;
    respaldo = await prisma.sitioPopup.findMany();
    await prisma.sitioPopup.deleteMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org popups', slug: `popups-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CorreoService).useValue({ enviar: async () => undefined }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const quien of ['super', 'admin'] as const) {
      cookies[quien] = await ingresarCookie(servidor, correoDe(quien), CLAVE);
    }
  });

  beforeEach(() => {
    app.get(PopupsService).reiniciarLimite();
    app.get(LeadsService).reiniciarLimite();
    app.get(LimitePublicoService).reiniciar();
    process.env.SITIO_ENTORNO = 'produccion';
  });

  afterAll(async () => {
    await app?.close();
    if (entornoAnterior === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoAnterior;
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@visitante-popup.example` } } });
    await prisma.sitioPopup.deleteMany();
    for (const f of respaldo) await prisma.sitioPopup.create({ data: { ...f, paginas: f.paginas as string[] } });
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@popups.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `popups-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    const id = '00000000-0000-4000-9800-000000000001';
    const rutas: ['get' | 'post' | 'patch' | 'put' | 'delete', string][] = [
      ['get', '/captacion/popups'], ['post', '/captacion/popups'], ['patch', `/captacion/popups/${id}`], ['delete', `/captacion/popups/${id}`], ['put', '/captacion/popups/orden'], ['post', `/captacion/popups/${id}/reiniciar`],
    ];
    for (const [m, r] of rutas) {
      expect((await request(servidor)[m](`/api/v1${r}`)).status).toBe(401);
      expect((await panel(m, r, 'admin').send({})).status).toBe(403);
    }
  });

  it('se crea apagado y con 7 días; los cambios se validan, se ordenan, se reinician y quedan en Auditoría', async () => {
    const creado = await panel('post', '/captacion/popups').send(BASE);
    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({ ...BASE, idioma: 'es', paginas: ['*'], frecuenciaDias: 7, visible: false, orden: 0, impresiones: 0, conversiones: 0, tasaConversion: null, valorDisparador: null });
    const id = creado.body.id as string;

    const malo = await panel('patch', `/captacion/popups/${id}`).send({ tipo: 'barra', frecuenciaDias: 3, accion: 'enlace_interno', enlaceDestino: 'https://evil.example', paginas: ['/pago'] });
    expect(malo.status).toBe(422);
    expect(malo.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['disparador', 'paginas', 'enlaceDestino', 'frecuenciaDias']);
    expect((await panel('patch', `/captacion/popups/${id}`).send({ html: '<b>' })).status).toBe(422);

    const bien = await panel('patch', `/captacion/popups/${id}`).send({ paginas: ['/', '/blog/*'], frecuenciaDias: 14, visible: true });
    expect(bien.status).toBe(200);
    expect(bien.body).toMatchObject({ paginas: ['/', '/blog/*'], frecuenciaDias: 14, visible: true, titulo: BASE.titulo });

    const otro = await panel('post', '/captacion/popups').send({ ...BASE, nombre: 'Demo', tipo: 'deslizable', disparador: 'desplazamiento', valorDisparador: 50, accion: 'enlace_interno', enlaceDestino: '/agendar-demo' });
    expect(otro.body.orden).toBe(1);
    expect((await panel('put', '/captacion/popups/orden').send({ ids: [otro.body.id] })).body.codigo).toBe('ORDEN_INCOMPLETO');
    const orden = await panel('put', '/captacion/popups/orden').send({ ids: [otro.body.id, id] });
    expect(orden.body.popups.map((p: { nombre: string; orden: number }) => [p.nombre, p.orden])).toEqual([['Demo', 0], ['Guía de microaprendizaje', 1]]);

    await prisma.sitioPopup.update({ where: { id }, data: { impresiones: 2140, conversiones: 146 } });
    expect((await panel('get', '/captacion/popups')).body.popups[1]).toMatchObject({ impresiones: 2140, conversiones: 146, tasaConversion: 6.8 });
    const reinicio = await panel('post', `/captacion/popups/${id}/reiniciar`);
    expect([reinicio.status, reinicio.body.impresiones, reinicio.body.conversiones]).toEqual([200, 0, 0]);

    expect((await panel('delete', `/captacion/popups/${otro.body.id}`)).status).toBe(204);
    expect((await panel('get', '/captacion/popups')).body.popups.map((p: { orden: number }) => p.orden)).toEqual([0]);
    expect((await panel('delete', `/captacion/popups/${otro.body.id}`)).status).toBe(404);

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: correoDe('super') } });
    const acciones = (await prisma.auditoria.findMany({ where: { usuarioId: usuario.id, entidad: 'SitioPopup' }, orderBy: { creadoEn: 'asc' } })).map((a) => a.accion);
    expect(acciones).toEqual(['POPUP_CREADO', 'POPUP_EDITADO', 'POPUP_CREADO', 'POPUPS_ORDENADOS', 'POPUP_RESULTADOS_REINICIADOS', 'POPUP_BORRADO']);
    await prisma.sitioPopup.deleteMany();
  });

  it('CP-132 · /s/_popups.json en vivo: solo los activos, sin los ficticios en producción y sin nombre ni resultados', async () => {
    const activo = await panel('post', '/captacion/popups').send({ ...BASE, visible: true });
    await panel('post', '/captacion/popups').send({ ...BASE, nombre: 'Apagado' });
    await panel('post', '/captacion/popups').send({ ...BASE, nombre: 'Ficticio', visible: true, ficticio: true });
    const res = await request(servidor).get('/s/_popups.json');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=30');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body.popups).toEqual([{
      id: activo.body.id, tipo: 'modal', idioma: 'es', disparador: 'intencion_salida', valorDisparador: null, paginas: ['*'], titulo: BASE.titulo, texto: BASE.texto, boton: BASE.boton,
      accion: 'pedir_correo', enlaceDestino: null, frecuenciaDias: 7,
    }]);
    process.env.SITIO_ENTORNO = 'pruebas';
    expect((await request(servidor).get('/s/_popups.json')).body.popups).toHaveLength(2);
    // Apagarlo vale sin republicar.
    await panel('patch', `/captacion/popups/${activo.body.id}`).send({ visible: false });
    process.env.SITIO_ENTORNO = 'produccion';
    expect((await request(servidor).get('/s/_popups.json')).body.popups).toEqual([]);
    await prisma.sitioPopup.deleteMany();
  });

  it('POST /s/_popup cuenta impresiones y clics de enlace, ignora los apagados y tiene límite por IP', async () => {
    const enlace = await panel('post', '/captacion/popups').send({ ...BASE, accion: 'enlace_interno', enlaceDestino: '/agendar-demo', visible: true });
    const correo = await panel('post', '/captacion/popups').send({ ...BASE, visible: true });
    const apagado = await panel('post', '/captacion/popups').send(BASE);
    const evento = (popupId: string, ev: string) => request(servidor).post('/s/_popup').send({ popupId, evento: ev });
    expect((await evento(enlace.body.id, 'impresion')).status).toBe(204);
    await evento(enlace.body.id, 'conversion');
    await evento(correo.body.id, 'impresion');
    await evento(correo.body.id, 'conversion');
    await evento(apagado.body.id, 'impresion');
    expect((await evento('no-es-un-id', 'impresion')).status).toBe(400);
    expect((await evento(enlace.body.id, 'otro')).status).toBe(400);
    const filas = await prisma.sitioPopup.findMany({ where: { id: { in: [enlace.body.id, correo.body.id, apagado.body.id] } } });
    const de = (id: string) => filas.find((f) => f.id === id)!;
    expect([de(enlace.body.id).impresiones, de(enlace.body.id).conversiones]).toEqual([1, 1]);
    expect([de(correo.body.id).impresiones, de(correo.body.id).conversiones]).toEqual([1, 0]);
    expect([de(apagado.body.id).impresiones, de(apagado.body.id).conversiones]).toEqual([0, 0]);
    // Ningún dato personal: la tabla solo guarda contadores.
    expect(Object.keys(de(enlace.body.id))).not.toContain('ip');

    app.get(PopupsService).reiniciarLimite();
    for (let i = 0; i < LIMITE_EVENTOS_POPUP; i++) await evento(enlace.body.id, 'impresion');
    const tope = await evento(enlace.body.id, 'impresion');
    expect([tope.status, tope.body.codigo]).toEqual([429, 'DEMASIADAS_SOLICITUDES']);
    await prisma.sitioPopup.deleteMany();
  });

  it('el correo de un popup entra a Leads con origen «popup» y suma la conversión del popup', async () => {
    const p = await panel('post', '/captacion/popups').send({ ...BASE, visible: true });
    const res = await request(servidor).post('/api/v1/publico/leads').send({
      correo: `ana-${sufijo}@visitante-popup.example`, consentimiento: true, via: 'popup', popupId: p.body.id, idioma: 'es', paginaFormulario: '/precios', paginaEntrada: '/', utm_source: 'linkedin',
    });
    expect(res.status).toBe(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { correo: `ana-${sufijo}@visitante-popup.example` } });
    expect(lead).toMatchObject({ origen: 'popup', via: 'popup', paginaEntrada: '/', paginaFormulario: '/precios', utmSource: 'linkedin', consentimiento: true });
    expect((await prisma.sitioPopup.findUniqueOrThrow({ where: { id: p.body.id } })).conversiones).toBe(1);
    // Sin consentimiento no entra (Ley 29733) ni cuenta.
    const sin = await request(servidor).post('/api/v1/publico/leads').send({ correo: `beto-${sufijo}@visitante-popup.example`, consentimiento: false, via: 'popup', popupId: p.body.id });
    expect(sin.status).toBe(422);
    expect((await prisma.sitioPopup.findUniqueOrThrow({ where: { id: p.body.id } })).conversiones).toBe(1);
    await prisma.sitioPopup.deleteMany();
  });
});
