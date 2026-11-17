// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (la agenda es global).
// HU-1605 · Agendamiento (REQ-078, PNT-33, RN-17-5, CP-135, CP-136) contra PostgreSQL y Redis: permisos y auditoría del
// panel; `GET /s/_agenda.json` en vivo (sin ficticios en producción, sin la franja ocupada); dos reservas a la vez de
// la misma franja con un solo asesor dan 201 y 409 FRANJA_OCUPADA; el lead queda con vía agendador y pasa a «Demo»; la
// invitación y los recordatorios quedan en la cola y la cancelación con el token los quita.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { idTareaAgenda } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import type { AgendaPublica } from '@aptio/schema/agenda';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AgendaService, ID_AGENDA, LIMITE_RESERVAS } from '../src/captacion/agenda.service.js';
import { LeadsService } from '../src/captacion/leads.service.js';
import { CorreoService } from '../src/correo/correo.service.js';
import { LimitePublicoService } from '../src/sitio/limite-publico.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@agenda.test`;
const visitante = (n: string) => `${n}-${sufijo}@visitante-agenda.example`;

describe.skipIf(!hayBase && !process.env.CI)('agendamiento (HU-1605)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let entornoAnterior: string | undefined;
  let ajustesPrevios: Awaited<ReturnType<typeof prisma.agendaAjustes.findUnique>> = null;
  const cookies: Record<string, string> = {};
  const panel = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', r: string, quien: 'super' | 'admin' = 'super') => request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
  const agenda = async (tipo?: string) => (await request(servidor).get(`/s/_agenda.json${tipo ? `?tipo=${tipo}` : ''}`).expect(200)).body as AgendaPublica;
  const reservar = (cuerpo: Record<string, unknown>) => request(servidor).post('/api/v1/publico/citas').send(cuerpo);
  const datos = (correo: string, extra: Record<string, unknown> = {}) => ({ nombre: 'Mariana Paredes', correo, empresa: 'Minera Andina', lms: 'Moodle', consentimiento: true, paginaFormulario: '/s/agendar-demo', utm_source: 'linkedin', ...extra });

  async function limpiar() {
    await prisma.agendaCita.deleteMany();
    await prisma.agendaTipo.deleteMany();
    await prisma.agendaAsesor.deleteMany();
    await prisma.lead.deleteMany({ where: { correo: { endsWith: `-${sufijo}@visitante-agenda.example` } } });
  }

  /** Un tipo visible de 30 min con un asesor (o los que se pidan). */
  async function tipoCon(asesores = 1, extra: { ficticio?: boolean } = {}) {
    const ids: string[] = [];
    for (let i = 0; i < asesores; i++) {
      ids.push((await panel('post', '/captacion/agenda/asesores').send({ nombre: `Asesor ${i + 1}`, correo: `asesor${i + 1}@aptio.example`, enlaceVideollamada: `https://meet.google.com/aaa-bbbb-cc${i}` }).expect(201)).body.id);
    }
    return (await panel('post', '/captacion/agenda/tipos').send({ nombreEs: 'Demo del generador', nombreEn: 'Generator demo', minutos: 30, asesorIds: ids, visible: true, ...extra }).expect(201)).body as { id: string };
  }

  beforeAll(async () => {
    entornoAnterior = process.env.SITIO_ENTORNO;
    ajustesPrevios = await prisma.agendaAjustes.findUnique({ where: { id: ID_AGENDA } });
    await limpiar();
    const org = await prisma.organizacion.create({ data: { nombre: 'Org agenda', slug: `agenda-${sufijo}` } });
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

  beforeEach(async () => {
    app.get(AgendaService).reiniciarLimite();
    app.get(LeadsService).reiniciarLimite();
    app.get(LimitePublicoService).reiniciar();
    process.env.SITIO_ENTORNO = 'produccion';
    await limpiar();
    // Sin anticipación: así siempre hay franjas hoy o mañana, sea la hora que sea.
    await prisma.agendaAjustes.upsert({ where: { id: ID_AGENDA }, create: { id: ID_AGENDA, anticipacionHoras: 0, horizonteDias: 14 }, update: { anticipacionHoras: 0, horizonteDias: 14, diasBloqueados: [], recordatoriosCorreo: true } });
  });

  afterAll(async () => {
    await app?.get(AgendaService).colaAgenda.obliterate({ force: true }).catch(() => undefined);
    await app?.close();
    if (entornoAnterior === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoAnterior;
    await limpiar();
    if (ajustesPrevios) {
      const { actualizadoEn: _a, ...previos } = ajustesPrevios;
      await prisma.agendaAjustes.update({ where: { id: ID_AGENDA }, data: previos });
    }
    else await prisma.agendaAjustes.deleteMany({ where: { id: ID_AGENDA } });
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@agenda.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `agenda-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    const id = '00000000-0000-4000-9800-000000000001';
    const rutas: ['get' | 'post' | 'patch' | 'put' | 'delete', string][] = [
      ['get', '/captacion/agenda'], ['patch', '/captacion/agenda'], ['post', '/captacion/agenda/tipos'], ['patch', `/captacion/agenda/tipos/${id}`], ['delete', `/captacion/agenda/tipos/${id}`],
      ['put', '/captacion/agenda/tipos/orden'], ['post', '/captacion/agenda/asesores'], ['patch', `/captacion/agenda/asesores/${id}`], ['delete', `/captacion/agenda/asesores/${id}`],
      ['get', '/captacion/agenda/citas'], ['patch', `/captacion/agenda/citas/${id}`],
    ];
    for (const [m, r] of rutas) {
      expect([r, (await request(servidor)[m](`/api/v1${r}`)).status]).toEqual([r, 401]);
      expect([r, (await panel(m, r, 'admin').send({})).status]).toEqual([r, 403]);
    }
  });

  it('el panel valida y audita ajustes, tipos y asesores; un tipo nuevo nace apagado y trae los feriados', async () => {
    const mal = await panel('patch', '/captacion/agenda').send({ franjas: ['9:00'], horizonteDias: 0 });
    expect(mal.status).toBe(422);
    expect(mal.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['franjas', 'horizonteDias']);
    const ok = await panel('patch', '/captacion/agenda').send({ franjas: ['15:00', '09:00'], diasBloqueados: ['2026-12-24'] }).expect(200);
    expect(ok.body).toMatchObject({ franjas: ['09:00', '15:00'], diasBloqueados: ['2026-12-24'], anticipacionHoras: 0 });

    expect((await panel('post', '/captacion/agenda/asesores').send({ nombre: 'X', correo: 'x@y.com', enlaceVideollamada: 'http://zoom.us/j/1' })).status).toBe(422);
    const asesor = (await panel('post', '/captacion/agenda/asesores').send({ nombre: 'Carla Montoya', correo: 'carla@aptio.example', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij' }).expect(201)).body;
    expect((await panel('post', '/captacion/agenda/tipos').send({ nombreEs: 'Demo', minutos: 10 })).status).toBe(422);
    expect((await panel('post', '/captacion/agenda/tipos').send({ nombreEs: 'Demo', minutos: 30, asesorIds: ['00000000-0000-4000-9800-000000000009'] })).status).toBe(422);
    const tipo = (await panel('post', '/captacion/agenda/tipos').send({ nombreEs: 'Demo del generador', minutos: 30, asesorIds: [asesor.id] }).expect(201)).body;
    expect(tipo).toMatchObject({ visible: false, orden: 0, asesorIds: [asesor.id] });
    const otro = (await panel('post', '/captacion/agenda/tipos').send({ nombreEs: 'Asesoría de migración', minutos: 45 }).expect(201)).body;
    expect((await panel('put', '/captacion/agenda/tipos/orden').send({ ids: [otro.id] })).status).toBe(422);
    const orden = (await panel('put', '/captacion/agenda/tipos/orden').send({ ids: [otro.id, tipo.id] }).expect(200)).body as { id: string }[];
    expect(orden.map((t) => t.id)).toEqual([otro.id, tipo.id]);
    await panel('patch', `/captacion/agenda/tipos/${tipo.id}`).send({ visible: true }).expect(200);

    const v = (await panel('get', '/captacion/agenda').expect(200)).body;
    expect(v.ajustes.franjas).toEqual(['09:00', '15:00']);
    expect(v.tipos.map((t: { nombreEs: string; visible: boolean }) => [t.nombreEs, t.visible])).toEqual([['Asesoría de migración', false], ['Demo del generador', true]]);
    expect(v.asesores).toEqual([expect.objectContaining({ nombre: 'Carla Montoya', citasProximas: 0 })]);
    expect(v.feriados.some((f: { nombre: string }) => f.nombre === 'Viernes Santo')).toBe(true);

    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: correoDe('super') } });
    const acciones = (await prisma.auditoria.findMany({ where: { usuarioId: u.id, accion: { startsWith: 'AGENDA_' } }, orderBy: { creadoEn: 'asc' } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(['AGENDA_AJUSTES_EDITADOS', 'AGENDA_ASESOR_CREADO', 'AGENDA_TIPO_CREADO', 'AGENDA_TIPOS_ORDENADOS', 'AGENDA_TIPO_EDITADO']));
  });

  it('la agenda pública solo ofrece tipos visibles con asesor y, en producción, sin ficticios; no dice nada del asesor', async () => {
    const vacia = await request(servidor).get('/s/_agenda.json').expect(200);
    expect(vacia.headers['cache-control']).toBe('public, max-age=0, s-maxage=15');
    expect(vacia.body).toMatchObject({ zona: 'America/Lima', tipos: [], tipoId: null, franjas: [] });
    const ficticio = await tipoCon(1, { ficticio: true });
    expect((await agenda()).tipos).toEqual([]);
    process.env.SITIO_ENTORNO = 'pruebas';
    const a = await agenda();
    expect(a.tipoId).toBe(ficticio.id);
    expect(a.franjas.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toMatch(/asesor|meet\.google/);
    expect((await request(servidor).get('/s/_agenda.json?idioma=en').expect(200)).body.tipos[0].nombre).toBe('Generator demo');
  });

  it('CP-135 · dos reservas a la vez de la misma franja con un solo asesor: 201 y 409 FRANJA_OCUPADA; después la franja ya no aparece', async () => {
    const tipo = await tipoCon(1);
    const a = await agenda(tipo.id);
    const franja = a.franjas[0]!;
    const [r1, r2] = await Promise.all([
      reservar(datos(visitante('uno'), { tipoId: tipo.id, inicio: franja.inicio })),
      reservar(datos(visitante('dos'), { tipoId: tipo.id, inicio: franja.inicio })),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const perdedor = r1.status === 409 ? r1 : r2;
    expect(perdedor.body.codigo).toBe('FRANJA_OCUPADA');
    expect((await agenda(tipo.id)).franjas.some((f) => f.inicio === franja.inicio)).toBe(false);
    expect(await prisma.agendaCita.count({ where: { estado: 'confirmada' } })).toBe(1);
    // Con un segundo asesor libre, esa misma franja vuelve a ofrecerse.
    const segundo = (await panel('post', '/captacion/agenda/asesores').send({ nombre: 'Luis Ríos', correo: 'luis@aptio.example', enlaceVideollamada: 'https://zoom.us/j/123' }).expect(201)).body;
    const t = (await panel('get', '/captacion/agenda').expect(200)).body.tipos[0];
    await panel('patch', `/captacion/agenda/tipos/${tipo.id}`).send({ asesorIds: [...t.asesorIds, segundo.id] }).expect(200);
    expect((await agenda(tipo.id)).franjas.some((f) => f.inicio === franja.inicio)).toBe(true);
  });

  it('CP-136 · reservar crea el lead con vía agendador y etapa Demo, y encola la invitación y los recordatorios que caben', async () => {
    const tipo = await tipoCon(1);
    const a = await agenda(tipo.id);
    const franja = a.franjas.at(-1)!;
    // El lead ya existía en «Contactado»: agendar lo pasa a «Demo» (SUP-254); uno en «Propuesta» no baja.
    await prisma.lead.create({ data: { correo: visitante('lead'), nombre: 'Mariana', origen: 'formulario', via: 'formulario', paginaEntrada: '/', etapa: 'CONTACTADO', consentimiento: true } });
    const r = await reservar(datos(visitante('lead'), { tipoId: tipo.id, inicio: franja.inicio })).expect(201);
    expect(r.body.recibido).toBe(true);
    expect(r.body.cita).toMatchObject({ inicio: franja.inicio, tipo: 'Demo del generador', enlace: 'https://meet.google.com/aaa-bbbb-cc0' });
    expect(r.body.cita.texto).toMatch(/\(hora de Lima\)$/);
    expect(r.body.cita.google).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    expect(r.body.cita.ics).toContain('METHOD:REQUEST');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { correo: visitante('lead') } });
    expect(lead).toMatchObject({ etapa: 'DEMO', totalContactos: 2 });
    const cita = await prisma.agendaCita.findUniqueOrThrow({ where: { id: r.body.cita.id } });
    expect(cita).toMatchObject({ leadId: lead.id, estado: 'confirmada', lms: 'Moodle', idioma: 'es' });

    const nuevo = await reservar(datos(visitante('nuevo'), { tipoId: tipo.id, inicio: a.franjas[0]!.inicio })).expect(201);
    expect(await prisma.lead.findUniqueOrThrow({ where: { correo: visitante('nuevo') } })).toMatchObject({ origen: 'agendador', via: 'agendador', etapa: 'DEMO', utmSource: 'linkedin', paginaFormulario: '/agendar-demo' });

    const servicio = app.get(AgendaService);
    await servicio.ultimoEncolado;
    const inv = await servicio.colaAgenda.getJob(idTareaAgenda(nuevo.body.cita.id, 'invitacion'));
    expect(inv?.data).toMatchObject({ citaId: nuevo.body.cita.id, aviso: 'invitacion' });
    expect(typeof inv?.data.token).toBe('string');
    // La franja más lejana (unos 14 días) tiene los dos recordatorios, con su espera hasta 24 h y 1 h antes.
    const r24 = await servicio.colaAgenda.getJob(idTareaAgenda(cita.id, 'recordatorio24h'));
    const r1 = await servicio.colaAgenda.getJob(idTareaAgenda(cita.id, 'recordatorio1h'));
    expect(r24 && r1).toBeTruthy();
    expect(Math.abs(r24!.timestamp + r24!.delay - (cita.inicio.getTime() - 24 * 3_600_000))).toBeLessThan(10_000);
    expect(Math.abs(r1!.timestamp + r1!.delay - (cita.inicio.getTime() - 3_600_000))).toBeLessThan(10_000);
  });

  it('la reserva valida los datos, el tipo y la franja; el campo trampa no guarda nada; y tiene límite por IP', async () => {
    const tipo = await tipoCon(1);
    const franja = (await agenda(tipo.id)).franjas[0]!;
    const mal = await reservar({ tipoId: tipo.id, inicio: franja.inicio, correo: 'no-es-correo' });
    expect(mal.status).toBe(422);
    expect(mal.body.detalles.map((d: { campo: string }) => d.campo)).toEqual(['correo', 'nombre', 'consentimiento']);
    expect((await reservar(datos(visitante('x'), { tipoId: '00000000-0000-4000-9800-000000000001', inicio: franja.inicio }))).body.codigo).toBe('TIPO_NO_DISPONIBLE');
    const sabado = new Date(Date.parse(franja.inicio) + 3 * 60_000).toISOString();
    expect((await reservar(datos(visitante('x'), { tipoId: tipo.id, inicio: sabado }))).body.codigo).toBe('FRANJA_NO_VALIDA');
    const trampa = await reservar(datos(visitante('bot'), { tipoId: tipo.id, inicio: franja.inicio, website: 'spam' })).expect(201);
    expect(trampa.body).toEqual({ recibido: true, cita: null });
    expect(await prisma.agendaCita.count()).toBe(0);
    app.get(AgendaService).reiniciarLimite();
    const estados: number[] = [];
    for (let i = 0; i <= LIMITE_RESERVAS.envios; i++) estados.push((await reservar({})).status);
    expect(estados.at(-1)).toBe(429);
  });

  it('CP-136 · el enlace de cancelación pide confirmar, cancela con el token, quita los recordatorios y no se puede repetir', async () => {
    const tipo = await tipoCon(1);
    const franja = (await agenda(tipo.id)).franjas.at(-1)!;
    const r = await reservar(datos(visitante('cancela'), { tipoId: tipo.id, inicio: franja.inicio, idioma: 'en' })).expect(201);
    const servicio = app.get(AgendaService);
    await servicio.ultimoEncolado;
    const token = (await servicio.colaAgenda.getJob(idTareaAgenda(r.body.cita.id, 'invitacion')))!.data.token!;

    const pagina = await request(servidor).get(`/s/_cita?t=${encodeURIComponent(token)}`).expect(200);
    expect(pagina.headers['cache-control']).toBe('private, no-store');
    expect(pagina.text).toContain('<h1>Cancel your demo</h1>');
    expect(pagina.text).toContain('Generator demo');
    expect(pagina.text).toContain('(Lima time)');
    // Abrir la página no cancela.
    expect((await prisma.agendaCita.findUniqueOrThrow({ where: { id: r.body.cita.id } })).estado).toBe('confirmada');
    expect((await request(servidor).get('/s/_cita?t=token-que-no-existe-0000')).status).toBe(404);

    const hecho = await request(servidor).post('/s/_cita').type('form').send({ t: token, idioma: 'en' }).expect(200);
    expect(hecho.text).toContain('Your demo was cancelled');
    const cita = await prisma.agendaCita.findUniqueOrThrow({ where: { id: r.body.cita.id } });
    expect(cita).toMatchObject({ estado: 'cancelada', canceladaPor: 'visitante' });
    await servicio.ultimoEncolado;
    expect(await servicio.colaAgenda.getJob(idTareaAgenda(cita.id, 'recordatorio24h'))).toBeUndefined();
    expect(await servicio.colaAgenda.getJob(idTareaAgenda(cita.id, 'recordatorio1h'))).toBeUndefined();
    expect((await servicio.colaAgenda.getJob(idTareaAgenda(cita.id, 'cancelacion')))?.data).toEqual({ citaId: cita.id, aviso: 'cancelacion' });
    // La franja vuelve a ofrecerse; el mismo enlace ya no cancela nada.
    expect((await agenda(tipo.id)).franjas.some((f) => f.inicio === franja.inicio)).toBe(true);
    const otra = await request(servidor).post('/api/v1/publico/citas/cancelar').send({ token });
    expect([otra.status, otra.body.codigo]).toEqual([409, 'CITA_NO_ACTIVA']);
    expect((await request(servidor).post('/api/v1/publico/citas/cancelar').send({ token: 'x'.repeat(30) })).status).toBe(404);
  });

  it('el panel lista las citas por estado y rango, cancela con aviso y solo marca «Realizada» o «No asistió» una cita que ya empezó', async () => {
    const tipo = await tipoCon(1);
    const franja = (await agenda(tipo.id)).franjas[0]!;
    const r = await reservar(datos(visitante('panel'), { tipoId: tipo.id, inicio: franja.inicio })).expect(201);
    const lista = (await panel('get', `/captacion/agenda/citas?estado=confirmada&desde=${franja.fecha}&hasta=${franja.fecha}`).expect(200)).body;
    expect(lista.total).toBe(1);
    expect(lista.citas[0]).toMatchObject({ id: r.body.cita.id, fecha: franja.fecha, hora: franja.hora, tipo: 'Demo del generador', asesor: 'Asesor 1', nombre: 'Mariana Paredes', estado: 'confirmada' });
    expect((await panel('get', '/captacion/agenda/citas?estado=cancelada').expect(200)).body.total).toBe(0);

    expect((await panel('patch', `/captacion/agenda/citas/${r.body.cita.id}`).send({ estado: 'realizada' })).body.codigo).toBe('CITA_FUTURA');
    expect((await panel('patch', `/captacion/agenda/citas/${r.body.cita.id}`).send({ estado: 'confirmada' })).status).toBe(422);
    const c = (await panel('patch', `/captacion/agenda/citas/${r.body.cita.id}`).send({ estado: 'cancelada' }).expect(200)).body;
    expect(c).toMatchObject({ estado: 'cancelada', canceladaPor: 'superadmin' });
    expect((await panel('patch', `/captacion/agenda/citas/${r.body.cita.id}`).send({ estado: 'cancelada' })).body.codigo).toBe('CITA_NO_ACTIVA');
    const servicio = app.get(AgendaService);
    await servicio.ultimoEncolado;
    expect(await servicio.colaAgenda.getJob(idTareaAgenda(r.body.cita.id, 'cancelacion'))).toBeTruthy();

    // Una cita que ya pasó se marca como realizada.
    const pasada = await prisma.agendaCita.create({
      data: { tipoId: tipo.id, asesorId: lista.citas[0].asesorId, inicio: new Date(Date.now() - 2 * 3_600_000), fin: new Date(Date.now() - 3_600_000), nombre: 'Iván', correo: visitante('ivan'), tokenCancelacionHash: `h-${sufijo}` },
    });
    expect((await panel('patch', `/captacion/agenda/citas/${pasada.id}`).send({ estado: 'no_asistio' }).expect(200)).body.estado).toBe('no_asistio');
    // Un tipo o un asesor con citas no se borra: se apaga.
    expect((await panel('delete', `/captacion/agenda/tipos/${tipo.id}`)).body.codigo).toBe('TIPO_CON_CITAS');
    expect((await panel('delete', `/captacion/agenda/asesores/${lista.citas[0].asesorId}`)).body.codigo).toBe('ASESOR_CON_CITAS');
  });
});
