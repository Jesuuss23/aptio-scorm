// Pruebas de HU-0104 (ingreso, roles) y HU-0109 (invitación y recuperación) contra PostgreSQL real.
// Se saltan si no hay DATABASE_URL. Crean su propia organización y la borran al terminar.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { CorreoService } from '../src/correo/correo.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (nombre: string) => `${nombre}-${sufijo}@prueba.test`;

type Correo = { para: string; asunto: string; texto: string };
const enviados: Correo[] = [];
const enlaceDe = (para: string) => {
  const c = [...enviados].reverse().find((m) => m.para === para);
  const token = c?.texto.match(/token=([^\s]+)/)?.[1];
  return token ? decodeURIComponent(token) : undefined;
};

let app: INestApplication;
let servidor: ReturnType<INestApplication['getHttpServer']>;
let orgId: string;
let otraOrgId: string;
let clienteId: string;

async function crearUsuario(nombre: string, rol: Rol, organizacionId = orgId, extra: object = {}) {
  return prisma.usuario.create({
    data: { nombre, email: correo(nombre), rol, organizacionId, hashClave: await hashearClave(CLAVE), emailVerificado: true, ...extra },
  });
}

async function ingresar(email: string, clave = CLAVE) {
  const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email, clave });
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]?.split(';')[0];
  return { res, cookie };
}

describe.skipIf(!hayBase)('acceso (HU-0104, HU-0109)', () => {
  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org prueba', slug: `prueba-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra org', slug: `otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Cliente prueba' } })).id;
    await crearUsuario('admin', Rol.ADMINISTRADOR);
    await crearUsuario('productor', Rol.PRODUCTOR);
    await crearUsuario('otro-admin', Rol.ADMINISTRADOR, otraOrgId);

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CorreoService)
      .useValue({ enviar: async (m: Correo) => void enviados.push(m) })
      .compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  beforeEach(() => {
    enviados.length = 0;
  });

  describe('CP-004 · ingreso con correo y clave', () => {
    it('crea la cookie httpOnly y /yo devuelve el usuario sin el hash', async () => {
      const { res, cookie } = await ingresar(correo('admin'));
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
      expect(res.headers['set-cookie']?.[0]).toMatch(/SameSite=Lax/i);
      expect(res.body.usuario).toMatchObject({ email: correo('admin'), rol: 'ADMINISTRADOR' });
      expect(res.body.usuario).not.toHaveProperty('hashClave');

      const yo = await request(servidor).get('/api/v1/yo').set('Cookie', cookie!);
      expect(yo.status).toBe(200);
      expect(yo.body).toMatchObject({ email: correo('admin'), rol: 'ADMINISTRADOR', metodos: ['clave'] });
      expect(yo.body).not.toHaveProperty('hashClave');
    });

    it('el correo no distingue mayúsculas', async () => {
      const { res } = await ingresar(correo('admin').toUpperCase());
      expect(res.status).toBe(200);
    });

    it('sin cookie o con cookie alterada, /yo responde 401', async () => {
      expect((await request(servidor).get('/api/v1/yo')).status).toBe(401);
      const alterada = await request(servidor).get('/api/v1/yo').set('Cookie', 'sesion=no.valida');
      expect(alterada.status).toBe(401);
    });

    it('clave incorrecta y correo inexistente responden igual', async () => {
      const mala = await ingresar(correo('productor'), 'otra-clave-cualquiera');
      const nadie = await ingresar(correo('nadie'));
      expect(mala.res.status).toBe(401);
      expect(nadie.res.status).toBe(401);
      expect(mala.res.body.codigo).toBe('CREDENCIALES');
      expect(nadie.res.body).toEqual(mala.res.body);
    });

    it('salir borra la cookie', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor).post('/api/v1/auth/salir').set('Cookie', cookie!);
      expect(res.status).toBe(204);
      expect(res.headers['set-cookie']?.[0]).toMatch(/sesion=;/);
    });
  });

  describe('CP-005 · bloqueo tras 5 intentos fallidos', () => {
    it('bloquea 15 minutos aunque luego llegue la clave correcta', async () => {
      const u = await crearUsuario('bloqueo', Rol.PRODUCTOR);
      for (let i = 0; i < 5; i++) expect((await ingresar(u.email, 'clave-equivocada')).res.status).toBe(401);
      const { res } = await ingresar(u.email);
      expect(res.status).toBe(401);
      expect(res.body.codigo).toBe('CUENTA_BLOQUEADA');
      const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
      expect(guardado.bloqueadoHasta!.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    });

    it('un ingreso correcto reinicia el contador', async () => {
      const u = await crearUsuario('contador', Rol.PRODUCTOR);
      for (let i = 0; i < 4; i++) await ingresar(u.email, 'clave-equivocada');
      expect((await ingresar(u.email)).res.status).toBe(200);
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } })).intentosFallidos).toBe(0);
    });
  });

  describe('CP-006 · permisos por rol (RN-01-2)', () => {
    it('un productor no puede administrar usuarios', async () => {
      const { cookie } = await ingresar(correo('productor'));
      const res = await request(servidor).get('/api/v1/usuarios').set('Cookie', cookie!);
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('SIN_PERMISO');
    });

    it('el administrador solo ve los usuarios de su organización', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor).get('/api/v1/usuarios').set('Cookie', cookie!);
      expect(res.status).toBe(200);
      const emails = res.body.map((u: { email: string }) => u.email);
      expect(emails).toContain(correo('productor'));
      expect(emails).not.toContain(correo('otro-admin'));
    });

    it('no puede modificar usuarios de otra organización', async () => {
      const ajeno = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('otro-admin') } });
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor).patch(`/api/v1/usuarios/${ajeno.id}`).set('Cookie', cookie!).send({ activo: false });
      expect(res.status).toBe(404);
    });
  });

  describe('CP-010 · invitación con enlace de un solo uso', () => {
    it('invita, el invitado crea su clave e ingresa; el enlace no sirve dos veces', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const email = correo('invitado');
      const alta = await request(servidor)
        .post('/api/v1/usuarios')
        .set('Cookie', cookie!)
        .send({ email, nombre: 'Persona invitada', rol: 'DISENADOR_GRAFICO' });
      expect(alta.status).toBe(201);
      expect(alta.body).toMatchObject({ email, rol: 'DISENADOR_GRAFICO', metodos: [] });

      const token = enlaceDe(email);
      expect(token).toBeDefined();
      expect((await ingresar(email)).res.status).toBe(401); // aún sin clave

      const crear = await request(servidor).post('/api/v1/auth/clave/restablecer').send({ token, clave: 'mi-clave-nueva-1' });
      expect(crear.status).toBe(204);
      expect((await ingresar(email, 'mi-clave-nueva-1')).res.status).toBe(200);

      const otraVez = await request(servidor).post('/api/v1/auth/clave/restablecer').send({ token, clave: 'otra-clave-nueva' });
      expect(otraVez.status).toBe(422);
      expect(otraVez.body.codigo).toBe('ENLACE_NO_VALIDO');
    });

    it('rechaza un correo ya usado con 409', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor)
        .post('/api/v1/usuarios')
        .set('Cookie', cookie!)
        .send({ email: correo('productor'), nombre: 'Repetido', rol: 'PRODUCTOR' });
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('CORREO_EN_USO');
    });

    it('un revisor del cliente necesita un cliente de la organización', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const sinCliente = await request(servidor)
        .post('/api/v1/usuarios')
        .set('Cookie', cookie!)
        .send({ email: correo('revisor-a'), nombre: 'Revisor', rol: 'REVISOR_CLIENTE' });
      expect(sinCliente.status).toBe(422);
      const conCliente = await request(servidor)
        .post('/api/v1/usuarios')
        .set('Cookie', cookie!)
        .send({ email: correo('revisor-b'), nombre: 'Revisor', rol: 'REVISOR_CLIENTE', clienteId });
      expect(conCliente.status).toBe(201);
      expect(conCliente.body.clienteId).toBe(clienteId);
    });

    it('no se puede invitar a un superadmin', async () => {
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor)
        .post('/api/v1/usuarios')
        .set('Cookie', cookie!)
        .send({ email: correo('super'), nombre: 'Super', rol: 'SUPERADMIN' });
      expect(res.status).toBe(422);
    });
  });

  describe('CP-011 / CP-012 · recuperación de clave', () => {
    it('responde 202 igual exista o no el correo, y solo envía si existe', async () => {
      const existe = await request(servidor).post('/api/v1/auth/clave/olvido').send({ email: correo('productor') });
      const noExiste = await request(servidor).post('/api/v1/auth/clave/olvido').send({ email: correo('nadie') });
      expect(existe.status).toBe(202);
      expect(noExiste.status).toBe(202);
      expect(noExiste.body).toEqual(existe.body);
      expect(enviados.map((m) => m.para)).toEqual([correo('productor')]);
    });

    it('cambiar la clave cierra las sesiones abiertas', async () => {
      const u = await crearUsuario('recupera', Rol.DISENADOR_INSTRUCCIONAL);
      const { cookie } = await ingresar(u.email);
      await request(servidor).post('/api/v1/auth/clave/olvido').send({ email: u.email });
      const res = await request(servidor)
        .post('/api/v1/auth/clave/restablecer')
        .send({ token: enlaceDe(u.email), clave: 'clave-recuperada-9' });
      expect(res.status).toBe(204);
      expect((await request(servidor).get('/api/v1/yo').set('Cookie', cookie!)).status).toBe(401);
      expect((await ingresar(u.email)).res.status).toBe(401);
      expect((await ingresar(u.email, 'clave-recuperada-9')).res.status).toBe(200);
    });

    it('un enlace vencido no sirve (CP-012)', async () => {
      const u = await crearUsuario('vencido', Rol.PRODUCTOR);
      await request(servidor).post('/api/v1/auth/clave/olvido').send({ email: u.email });
      await prisma.tokenAcceso.updateMany({ where: { usuarioId: u.id }, data: { expira: new Date(Date.now() - 1000) } });
      const res = await request(servidor)
        .post('/api/v1/auth/clave/restablecer')
        .send({ token: enlaceDe(u.email), clave: 'clave-que-no-entra' });
      expect(res.status).toBe(422);
      expect(res.body.codigo).toBe('ENLACE_NO_VALIDO');
    });

    it('limita a 3 pedidos por hora', async () => {
      const u = await crearUsuario('limite', Rol.PRODUCTOR);
      for (let i = 0; i < 5; i++) await request(servidor).post('/api/v1/auth/clave/olvido').send({ email: u.email });
      expect(enviados.filter((m) => m.para === u.email)).toHaveLength(3);
    });
  });

  describe('desactivar un usuario', () => {
    it('cierra su sesión y ya no puede ingresar', async () => {
      const u = await crearUsuario('baja', Rol.PRODUCTOR);
      const sesionBaja = (await ingresar(u.email)).cookie!;
      const { cookie } = await ingresar(correo('admin'));
      const res = await request(servidor).patch(`/api/v1/usuarios/${u.id}`).set('Cookie', cookie!).send({ activo: false });
      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(false);
      expect((await request(servidor).get('/api/v1/yo').set('Cookie', sesionBaja)).status).toBe(401);
      expect((await ingresar(u.email)).res.status).toBe(401);
    });

    it('el administrador no puede desactivarse a sí mismo', async () => {
      const yo = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('admin') } });
      const { cookie } = await ingresar(yo.email);
      const res = await request(servidor).patch(`/api/v1/usuarios/${yo.id}`).set('Cookie', cookie!).send({ activo: false });
      expect(res.status).toBe(422);
    });
  });
});
