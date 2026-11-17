// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (las visitas son globales).
// HU-1607 · Resumen del sitio (REQ-080, PNT-24, CP-138) contra PostgreSQL: `POST /s/_visita` suma visitas y vistas por
// día de Lima sin guardar la IP (y no cuenta bots, al superadmin ni lo que no es válido), y `GET /sitio/resumen` da los
// indicadores con las mismas tablas de leads y citas, el reparto por origen al 100 %, la conversión por página y las
// próximas demos; solo para el superadmin.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { fechaLima } from '@aptio/schema/agenda';
import { ventanaResumen } from '@aptio/schema/resumen-sitio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { CorreoService } from '../src/correo/correo.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';
import { LIMITE_VISITAS_POR_MINUTO, ResumenService } from '../src/sitio/resumen.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@resumen.test`;
const visitante = (n: string) => `${n}-${sufijo}@visitante-resumen.example`;
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe.skipIf(!hayBase && !process.env.CI)('resumen del sitio (HU-1607)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let respaldo: Awaited<ReturnType<typeof prisma.sitioVisitaDia.findMany>> = [];
  const cookies: Record<string, string> = {};
  const panel = (r: string, quien: 'super' | 'admin' = 'super') => request(servidor).get(`/api/v1${r}`).set('Cookie', cookies[quien]!);
  const visita = (cuerpo: object, agente = NAVEGADOR) => request(servidor).post('/s/_visita').set('User-Agent', agente).send(cuerpo);
  const filas = () => prisma.sitioVisitaDia.findMany({ orderBy: [{ ruta: 'asc' }, { idioma: 'asc' }], select: { ruta: true, idioma: true, visitas: true, paginasVistas: true } });

  beforeAll(async () => {
    respaldo = await prisma.sitioVisitaDia.findMany();
    await prisma.sitioVisitaDia.deleteMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org resumen', slug: `resumen-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CorreoService).useValue({ enviar: async () => undefined }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  beforeEach(() => {
    app.get(ResumenService).reiniciarLimite();
    app.get(LimitePublicoService).reiniciar();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.agendaCita.deleteMany({ where: { correo: { endsWith: `-${sufijo}@visitante-resumen.example` } } });
    await prisma.agendaTipo.deleteMany({ where: { nombreEs: `Demo resumen ${sufijo}` } });
    await prisma.agendaAsesor.deleteMany({ where: { correo: correoDe('asesor') } });
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@visitante-resumen.example` } } });
    await prisma.sitioVisitaDia.deleteMany();
    if (respaldo.length) await prisma.sitioVisitaDia.createMany({ data: respaldo });
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@resumen.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `resumen-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión, 403 a un rol de organización y 422 con otro período', async () => {
    expect((await request(servidor).get('/api/v1/sitio/resumen')).status).toBe(401);
    expect((await panel('/sitio/resumen', 'admin')).status).toBe(403);
    expect((await panel('/sitio/resumen?periodo=1y')).body.codigo).toBe('NO_VALIDO');
    expect((await panel('/sitio/resumen?periodo=1y')).status).toBe(422);
  });

  it('POST /s/_visita suma la visita al empezar la sesión y cada vista, sin IP; bots, superadmin y lo inválido no cuentan', async () => {
    await visita({ ruta: '/', idioma: 'es', primeraPagina: true, origen: 'linkedin' }).expect(204);
    await visita({ ruta: '/precios', idioma: 'es', primeraPagina: false }).expect(204);
    await visita({ ruta: '/precios/', idioma: 'es', primeraPagina: true }).expect(204);
    await visita({ ruta: '/en', idioma: 'en', primeraPagina: true }).expect(204);
    // No cuentan: un bot, el superadmin con sesión, sin agente, una ruta interna y un cuerpo roto (204 igual).
    await visita({ ruta: '/', idioma: 'es', primeraPagina: true }, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').expect(204);
    await request(servidor).post('/s/_visita').set('User-Agent', NAVEGADOR).set('Cookie', cookies.super!).send({ ruta: '/', idioma: 'es', primeraPagina: true }).expect(204);
    await request(servidor).post('/s/_visita').set('User-Agent', '').send({ ruta: '/', idioma: 'es', primeraPagina: true }).expect(204);
    await visita({ ruta: '/_lead', idioma: 'es', primeraPagina: true }).expect(204);
    await visita({ ruta: 'precios', primeraPagina: 'si' }).expect(204);
    const r = await visita({ ruta: '/', idioma: 'es', primeraPagina: false });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(await filas()).toEqual([
      { ruta: '/', idioma: 'es', visitas: 1, paginasVistas: 2 },
      { ruta: '/en', idioma: 'en', visitas: 1, paginasVistas: 1 },
      { ruta: '/precios', idioma: 'es', visitas: 1, paginasVistas: 2 },
    ]);
    const [fila] = await prisma.sitioVisitaDia.findMany({ where: { ruta: '/' } });
    expect(fila!.dia.toISOString().slice(0, 10)).toBe(fechaLima(new Date()));
    // La tabla no tiene dónde guardar la IP, el agente ni el origen.
    expect(Object.keys(fila!).sort()).toEqual(['dia', 'id', 'idioma', 'paginasVistas', 'ruta', 'visitas']);
  });

  it('las visitas al mismo tiempo no se pierden (INSERT … ON CONFLICT atómico)', async () => {
    await Promise.all(Array.from({ length: 20 }, () => visita({ ruta: '/demo', idioma: 'es', primeraPagina: true }).expect(204)));
    expect((await prisma.sitioVisitaDia.findMany({ where: { ruta: '/demo' } }))).toMatchObject([{ visitas: 20, paginasVistas: 20 }]);
  });

  it('el límite por IP responde 429 al pasarlo', async () => {
    for (let i = 0; i < LIMITE_VISITAS_POR_MINUTO; i++) await visita({ ruta: '/limite', idioma: 'es', primeraPagina: false }).expect(204);
    const r = await visita({ ruta: '/limite', idioma: 'es', primeraPagina: false });
    expect(r.status).toBe(429);
    expect(r.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });

  it('CP-138 · con 10 leads nuevos del período, el indicador suma 10, coincide con la tabla y el origen suma 100 %', async () => {
    const v = ventanaResumen('30d', new Date());
    const enPeriodo = { creadoEn: { gte: v.actual.inicio, lt: v.actual.fin } };
    const antes = (await panel('/sitio/resumen').expect(200)).body;
    const origenes = ['formulario', 'formulario', 'formulario', 'formulario', 'popup', 'popup', 'popup', 'chatbot', 'chatbot', 'agendador'];
    await prisma.lead.createMany({
      data: origenes.map((origen, i) => ({ correo: visitante(`lead${i}`), origen, via: origen, paginaEntrada: i < 3 ? '/precios' : '/', nombre: `Lead ${i}` })),
    });
    const r = (await panel('/sitio/resumen').expect(200)).body;
    expect(r).toMatchObject({ periodo: '30d', desde: v.actual.desde, hasta: v.actual.hasta });
    expect(r.indicadores.leads.actual - antes.indicadores.leads.actual).toBe(10);
    expect(r.indicadores.leads.actual).toBe(await prisma.lead.count({ where: enPeriodo }));
    expect(r.origenes.reduce((s: number, o: { porcentaje: number }) => s + o.porcentaje, 0)).toBe(100);
    expect(r.origenes.reduce((s: number, o: { leads: number }) => s + o.leads, 0)).toBe(r.indicadores.leads.actual);
    const porOrigen = Object.fromEntries(r.origenes.map((o: { origen: string; leads: number }) => [o.origen, o.leads]));
    const antesPorOrigen = Object.fromEntries(antes.origenes.map((o: { origen: string; leads: number }) => [o.origen, o.leads]));
    expect(['formulario', 'popup', 'chatbot', 'agendador'].map((o) => porOrigen[o] - antesPorOrigen[o])).toEqual([4, 3, 2, 1]);
    // Las visitas salen del contador (2 + 20 + 1 + 1 que empezaron sesión hoy) y la serie diaria suma lo mismo.
    expect(r.indicadores.visitas).toMatchObject({ actual: 23 });
    expect(r.serie).toHaveLength(30);
    expect(r.serie.at(-1).dia).toBe(fechaLima(new Date()));
    expect(r.serie.reduce((s: number, d: { visitas: number }) => s + d.visitas, 0)).toBe(23);
    expect(r.serie.reduce((s: number, d: { leads: number }) => s + d.leads, 0)).toBe(r.indicadores.leads.actual);
    // Conversión: leads con esa página de entrada entre las visitas que empezaron en ella.
    expect(r.paginas.find((p: { ruta: string }) => p.ruta === '/precios')).toMatchObject({ visitas: 1, leads: await prisma.lead.count({ where: { ...enPeriodo, paginaEntrada: '/precios' } }) });
    expect(r.paginas.length).toBeLessThanOrEqual(5);
    // Las suscripciones llegan con el S13.
    expect(r.indicadores.suscripciones).toBeNull();
    // 7 días y trimestre también responden, con su largo.
    expect((await panel('/sitio/resumen?periodo=7d').expect(200)).body.serie).toHaveLength(7);
    expect((await panel('/sitio/resumen?periodo=90d').expect(200)).body.serie).toHaveLength(90);
  });

  it('demos: las citas creadas en el período (con cualquier estado) y las próximas confirmadas', async () => {
    const antes = (await panel('/sitio/resumen?periodo=7d').expect(200)).body;
    const tipo = await prisma.agendaTipo.create({ data: { nombreEs: `Demo resumen ${sufijo}`, minutos: 30 } });
    const asesor = await prisma.agendaAsesor.create({ data: { nombre: 'Asesora Resumen', correo: correoDe('asesor'), enlaceVideollamada: 'https://meet.example/x' } });
    const en = (min: number) => new Date(Date.now() + min * 60_000);
    const base = { tipoId: tipo.id, asesorId: asesor.id, empresa: 'Minera Andina' };
    await prisma.agendaCita.create({ data: { ...base, inicio: en(1), fin: en(31), nombre: 'Primera', correo: visitante('c1'), tokenCancelacionHash: `r1-${sufijo}` } });
    await prisma.agendaCita.create({ data: { ...base, inicio: en(2), fin: en(32), nombre: 'Cancelada', correo: visitante('c2'), estado: 'cancelada', tokenCancelacionHash: `r2-${sufijo}` } });
    const r = (await panel('/sitio/resumen?periodo=7d').expect(200)).body;
    expect(r.indicadores.demos.actual - antes.indicadores.demos.actual).toBe(2);
    expect(r.proximasDemos[0]).toMatchObject({ nombre: 'Primera', empresa: 'Minera Andina', tipo: `Demo resumen ${sufijo}`, asesor: 'Asesora Resumen', estado: 'confirmada' });
    expect(r.proximasDemos.some((d: { nombre: string }) => d.nombre === 'Cancelada')).toBe(false);
    expect(r.proximasDemos.length).toBeLessThanOrEqual(5);
  });
});
