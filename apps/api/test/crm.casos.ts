// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (las conexiones son globales).
// HU-1602 · Integración con CRM (REQ-075, PNT-34, RN-17-2, CP-129, CP-130) contra PostgreSQL y Redis: conexiones y
// mapeo, la clave del webhook y su regeneración, «Enviar prueba» con la firma verificable (CP-130), el lead que entra en
// la cola de cada conexión activa al llegar y al cambiar de etapa, el «Reintentar» de la fila, auditoría y permisos.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COLA_CRM, type DatosEnvioCrm, INTENTOS_CRM, opcionesRedis } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { CABECERA_ENTREGA, CABECERA_EVENTO, CABECERA_FIRMA, verificarFirma } from '@aptio/schema/crm-envio';
import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { CrmService } from '../src/captacion/crm.service.js';
import { LeadsService } from '../src/captacion/leads.service.js';
import { CorreoService } from '../src/correo/correo.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@crm.test`;
const visitante = (n: string) => `${n}-${sufijo}@visitante-crm.example`;
const PREFIJO = `prueba-crm-${sufijo}`;

describe.skipIf(!hayBase && !process.env.CI)('integración con CRM (HU-1602)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let crm: CrmService;
  let leads: LeadsService;
  let cola: Queue<DatosEnvioCrm>;
  let prefijoAnterior: string | undefined;
  const cookies: Record<string, string> = {};
  const entorno: Record<string, string | undefined> = {};
  const recibidos: { url: string; init: RequestInit }[] = [];
  let respaldo: Awaited<ReturnType<typeof prisma.crmConexion.findMany>> = [];
  const panel = (m: 'get' | 'patch' | 'post', r: string, quien: 'super' | 'admin' = 'super') => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
  const publico = (correo: string) => request(servidor).post('/api/v1/publico/leads').send({ correo, nombre: 'Visitante CRM', consentimiento: true, via: 'formulario', paginaFormulario: '/contacto' });
  const trabajos = async (envioId: string) => (await cola.getJobs(['waiting', 'delayed', 'prioritized'])).filter((j) => j.data.envioId === envioId);

  beforeAll(async () => {
    prefijoAnterior = process.env.COLAS_PREFIJO;
    process.env.COLAS_PREFIJO = PREFIJO;
    respaldo = await prisma.crmConexion.findMany();
    await prisma.crmConexion.deleteMany();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org crm', slug: `crm-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CorreoService).useValue({ enviar: async () => undefined }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    crm = app.get(CrmService);
    leads = app.get(LeadsService);
    crm.deps = {
      entorno,
      resolver: async () => ['93.184.216.34'],
      obtener: async (url, init) => {
        recibidos.push({ url, init });
        return new Response(null, { status: 204 });
      },
    };
    cola = new Queue<DatosEnvioCrm>(COLA_CRM, { connection: opcionesRedis(), prefix: PREFIJO });
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  beforeEach(() => {
    leads.reiniciarLimite();
    app.get(LimitePublicoService).reiniciar();
    for (const k of Object.keys(entorno)) delete entorno[k];
    recibidos.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await cola?.obliterate({ force: true }).catch(() => undefined);
    await cola?.close();
    if (prefijoAnterior === undefined) delete process.env.COLAS_PREFIJO;
    else process.env.COLAS_PREFIJO = prefijoAnterior;
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@visitante-crm.example` } } });
    await prisma.crmConexion.deleteMany();
    for (const f of respaldo) await prisma.crmConexion.create({ data: { ...f, mapeo: f.mapeo as object } });
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@crm.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `crm-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    const lead = await prisma.lead.create({ data: { correo: visitante('permisos'), origen: 'formulario', via: 'formulario', paginaEntrada: '/' } });
    const rutas: ['get' | 'patch' | 'post', string][] = [['get', '/captacion/crm'], ['patch', '/captacion/crm'], ['post', '/captacion/crm/webhook/secreto'], ['post', '/captacion/crm/webhook/probar'], ['post', `/captacion/leads/${lead.id}/sincronizar`]];
    for (const [m, r] of rutas) {
      expect((await request(servidor)[m](`/api/v1${r}`)).status).toBe(401);
      expect((await panel(m, r, 'admin').send({ tipo: 'hubspot' })).status).toBe(403);
    }
  });

  it('las cuatro conexiones empiezan apagadas, con el mapeo de por defecto y lo que les falta', async () => {
    const res = await panel('get', '/captacion/crm');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.conexiones.map((c: { tipo: string; activa: boolean; faltan: string[] }) => [c.tipo, c.activa, c.faltan])).toEqual([
      ['hubspot', false, ['HUBSPOT_TOKEN']], ['pipedrive', false, ['PIPEDRIVE_TOKEN']], ['zoho', false, ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN']], ['webhook', false, ['url', 'secreto']],
    ]);
    expect(res.body.conexiones[0]).toMatchObject({ nombre: 'HubSpot', configurada: false, mapeo: { correo: 'email', nombre: 'firstname', empresa: 'company', mensaje: 'message' }, url: null, secreto: null });
    expect(res.body).toMatchObject({ cabeceraFirma: 'X-Aptio-Firma', toleranciaSegundos: 300 });
    expect(res.body.campos).toHaveLength(14);
  });

  it('un CRM se activa solo con su clave en el entorno; el mapeo se valida y queda en Auditoría', async () => {
    const sinClave = await panel('patch', '/captacion/crm').send({ tipo: 'hubspot', activa: true });
    expect([sinClave.status, sinClave.body.codigo, sinClave.body.mensaje]).toEqual([422, 'FALTA_CLAVE', 'No se puede activar HubSpot: define HUBSPOT_TOKEN en el entorno del servidor']);
    const malo = await panel('patch', '/captacion/crm').send({ tipo: 'hubspot', mapeo: { correo: 'correo', etapa: 'mi etapa' } });
    expect([malo.status, malo.body.detalles.map((d: { campo: string }) => d.campo)]).toEqual([422, ['mapeo.etapa']]);
    expect((await panel('patch', '/captacion/crm').send({ tipo: 'hubspot', url: 'https://x.pe' })).body.codigo).toBe('NO_VALIDO');
    entorno.HUBSPOT_TOKEN = 'pat-na1-prueba';
    const ok = await panel('patch', '/captacion/crm').send({ tipo: 'hubspot', activa: true, mapeo: { correo: 'email', nombre: 'firstname', etapa: 'aptio_etapa', origen: '' } });
    expect(ok.status).toBe(200);
    expect(ok.body.conexiones[0]).toMatchObject({ activa: true, configurada: true, faltan: [], mapeo: { correo: 'email', nombre: 'firstname', etapa: 'aptio_etapa' } });
    const a = await prisma.auditoria.findFirst({ where: { accion: 'CRM_CONEXION_EDITADA', entidadId: 'hubspot' }, orderBy: { creadoEn: 'desc' } });
    expect(a?.datos).toEqual({ tipo: 'hubspot', activa: true, mapeo: { correo: 'email', nombre: 'firstname', etapa: 'aptio_etapa' } });
  });

  it('el webhook: https:// público, al activarlo se genera la clave y «Regenerar» la cambia sin dejarla en Auditoría', async () => {
    expect((await panel('patch', '/captacion/crm').send({ tipo: 'webhook', activa: true })).body.codigo).toBe('FALTA_URL');
    for (const url of ['http://hooks.ventas.pe/aptio', 'https://10.0.0.8/hook', 'https://localhost/hook']) expect((await panel('patch', '/captacion/crm').send({ tipo: 'webhook', url })).status).toBe(422);
    expect((await panel('patch', '/captacion/crm').send({ tipo: 'webhook', mapeo: { correo: 'email' } })).body.codigo).toBe('NO_VALIDO');
    const res = await panel('patch', '/captacion/crm').send({ tipo: 'webhook', url: 'https://hooks.ventas.pe/aptio', activa: true });
    const w = res.body.conexiones[3];
    expect(w).toMatchObject({ tipo: 'webhook', activa: true, configurada: true, url: 'https://hooks.ventas.pe/aptio', mapeo: null });
    expect(w.secreto).toMatch(/^whsec_/);
    const nueva = await panel('post', '/captacion/crm/webhook/secreto');
    expect(nueva.status).toBe(200);
    expect(nueva.body.conexiones[3].secreto).toMatch(/^whsec_/);
    expect(nueva.body.conexiones[3].secreto).not.toBe(w.secreto);
    const a = await prisma.auditoria.findFirst({ where: { accion: 'CRM_SECRETO_REGENERADO' }, orderBy: { creadoEn: 'desc' } });
    expect(JSON.stringify(a?.datos)).not.toContain('whsec_');
  });

  it('CP-130 · «Enviar prueba» manda lead.prueba con firma HMAC verificable con la clave del panel', async () => {
    const { secreto } = (await panel('get', '/captacion/crm')).body.conexiones[3];
    const res = await panel('post', '/captacion/crm/webhook/probar');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, mensaje: expect.stringMatching(/^El webhook respondió 204 a la entrega /) });
    const [p] = recibidos;
    const h = p!.init.headers as Record<string, string>;
    expect([p!.url, h[CABECERA_EVENTO], h[CABECERA_ENTREGA]]).toEqual(['https://hooks.ventas.pe/aptio', 'lead.prueba', expect.stringMatching(/^[0-9a-f-]{36}$/)]);
    expect(verificarFirma(h[CABECERA_FIRMA], String(p!.init.body), secreto)).toEqual({ ok: true });
    expect(await prisma.auditoria.findFirst({ where: { accion: 'CRM_PRUEBA_ENVIADA', entidadId: 'webhook' } })).toMatchObject({ datos: { tipo: 'webhook', ok: true } });
    // Un CRM sin su clave no se llama: la prueba dice qué falta.
    expect((await panel('post', '/captacion/crm/pipedrive/probar')).body).toEqual({ ok: false, mensaje: 'Falta la clave: define PIPEDRIVE_TOKEN en el entorno del servidor' });
    expect((await panel('post', '/captacion/crm/salesforce/probar')).status).toBe(404);
  });

  it('un lead nuevo entra a la cola de cada conexión activa; cambiar su etapa lo vuelve a encolar', async () => {
    expect((await publico(visitante('nuevo'))).status).toBe(201);
    await leads.ultimoEnvio;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { correo: visitante('nuevo') }, include: { envios: { include: { conexion: true } } } });
    expect(lead.envios.map((e) => [e.conexion.tipo, e.estado]).sort()).toEqual([['hubspot', 'pendiente'], ['webhook', 'pendiente']]);
    for (const e of lead.envios) {
      const [t] = await trabajos(e.id);
      expect(t).toMatchObject({ name: 'crm-enviar', data: { evento: 'lead.creado' }, opts: { attempts: INTENTOS_CRM, backoff: { type: 'crm' } } });
    }
    const lista = await panel('get', '/captacion/leads');
    const fila = lista.body.leads.find((l: { correo: string }) => l.correo === visitante('nuevo'));
    expect(fila.crm).toMatchObject({ estado: 'pendiente', texto: 'Pendiente', envios: [{ tipo: 'hubspot', estado: 'pendiente' }, { tipo: 'webhook', estado: 'pendiente' }] });
    expect((await panel('patch', `/captacion/leads/${lead.id}`).send({ etapa: 'DEMO' })).status).toBe(200);
    const hub = lead.envios.find((e) => e.conexion.tipo === 'hubspot')!;
    expect((await trabajos(hub.id)).map((j) => j.data.evento).sort()).toEqual(['lead.actualizado', 'lead.creado']);
  });

  it('«Reintentar» vuelve a encolar solo lo que no se envió, lo audita, y sin conexiones activas responde 422', async () => {
    await publico(visitante('reintento'));
    await leads.ultimoEnvio;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { correo: visitante('reintento') }, include: { envios: { include: { conexion: true } } } });
    const hub = lead.envios.find((e) => e.conexion.tipo === 'hubspot')!;
    const web = lead.envios.find((e) => e.conexion.tipo === 'webhook')!;
    await prisma.leadEnvio.update({ where: { id: hub.id }, data: { estado: 'error', intentos: 4, motivo: 'HubSpot respondió 500: Service unavailable' } });
    await prisma.leadEnvio.update({ where: { id: web.id }, data: { estado: 'enviado', intentos: 1, enviadoEn: new Date() } });
    const fila = (await panel('get', '/captacion/leads')).body.leads.find((l: { id: string }) => l.id === lead.id);
    expect(fila.crm).toMatchObject({ estado: 'error', texto: 'Error: HubSpot respondió 500: Service unavailable' });
    const res = await panel('post', `/captacion/leads/${lead.id}/sincronizar`);
    expect([res.status, res.body]).toEqual([202, { encolados: ['hubspot'] }]);
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: hub.id } })).toMatchObject({ estado: 'pendiente', motivo: null });
    expect(await prisma.leadEnvio.findUniqueOrThrow({ where: { id: web.id } })).toMatchObject({ estado: 'enviado' });
    expect(await prisma.auditoria.findFirst({ where: { accion: 'LEAD_SINCRONIZACION_REINTENTADA', entidadId: lead.id } })).toMatchObject({ entidad: 'Lead', datos: { encolados: ['hubspot'] } });
    expect((await panel('post', '/captacion/leads/00000000-0000-4000-8000-000000000999/sincronizar')).status).toBe(404);
    // Al apagar las conexiones, la columna deja de mostrarlas y «Reintentar» no tiene a dónde enviar.
    await prisma.crmConexion.updateMany({ data: { activa: false } });
    expect((await panel('get', '/captacion/leads')).body.leads.find((l: { id: string }) => l.id === lead.id).crm).toEqual({ estado: 'sin_envio', texto: 'Sin enviar', envios: [] });
    expect((await panel('post', `/captacion/leads/${lead.id}/sincronizar`)).body.codigo).toBe('SIN_CONEXIONES');
  });
});
