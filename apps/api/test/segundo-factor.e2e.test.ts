// HU-1515 · Segundo factor del superadmin (CP-160 configurar, CP-161 ingresar) contra PostgreSQL real.
// Se salta si no hay DATABASE_URL. Crea sus propios usuarios y los borra al terminar.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ConfigSesion } from '../src/auth/config-sesion.js';
import { firmarSesion } from '../src/auth/sesion.js';
import { codigoActual, cookieLlamada, cookiesDe, ingresarCookie, secretoDe } from './ingreso-apoyo.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@segundo-factor.test`;
const RUTA = '/api/v1/auth/segundo-factor';

describe.skipIf(!hayBase)('segundo factor del superadmin (HU-1515)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let codigosRecuperacion: string[] = [];

  const crear = async (n: string, rol: Rol, organizacionId: string | null = null) =>
    prisma.usuario.create({ data: { nombre: n, email: correo(n), rol, organizacionId, hashClave: await hashearClave(CLAVE), emailVerificado: true } });

  /** Clave correcta: devuelve la respuesta y la cookie del desafío. */
  const conClave = async (n: string) => {
    const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
    return { res, desafio: cookieLlamada(res, 'segundo_factor')! };
  };
  const auditoria = async (n: string, accion: string) =>
    prisma.auditoria.count({ where: { usuario: { email: correo(n) }, accion } });

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org 2FA', slug: `dosfa-${sufijo}` } })).id;
    await crear('super', Rol.SUPERADMIN);
    await crear('bloqueo', Rol.SUPERADMIN);
    await crear('admin', Rol.ADMINISTRADOR, orgId);
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    const ids = (await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@segundo-factor.test` } } })).map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('los demás roles siguen entrando solo con la clave', async () => {
    const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo('admin'), clave: CLAVE });
    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ rol: 'ADMINISTRADOR' });
    expect(cookieLlamada(res, 'sesion')).toBeDefined();
    expect(cookieLlamada(res, 'segundo_factor')).toBeUndefined();
  });

  describe('CP-160 · el primer ingreso obliga a configurar la aplicación autenticadora', () => {
    it('la clave sola no abre sesión: entrega un desafío httpOnly limitado a sus rutas', async () => {
      const { res, desafio } = await conClave('super');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ segundoFactor: 'configurar', expira: expect.any(String) });
      expect(new Date(res.body.expira).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
      expect(cookieLlamada(res, 'sesion')).toBeUndefined();
      const crudo = cookiesDe(res).find((c) => c.startsWith('segundo_factor='))!;
      expect(crudo).toMatch(/HttpOnly/i);
      expect(crudo).toMatch(/SameSite=Strict/i);
      expect(crudo).toMatch(/Path=\/api\/v1\/auth\/segundo-factor/);
      // El desafío no sirve como sesión.
      expect((await request(servidor).get('/api/v1/yo').set('Cookie', desafio.replace('segundo_factor=', 'sesion='))).status).toBe(401);
      expect((await request(servidor).get(RUTA).set('Cookie', desafio)).body).toEqual({ segundoFactor: 'configurar', email: correo('super') });
      expect(await auditoria('super', 'INGRESO')).toBe(0);
    });

    it('muestra el QR, rechaza un código equivocado y con el correcto activa, entrega 10 códigos y abre la sesión', async () => {
      const { desafio } = await conClave('super');
      const conf = await request(servidor).post(`${RUTA}/configurar`).set('Cookie', desafio);
      expect(conf.status).toBe(200);
      expect(conf.headers['cache-control']).toBe('no-store');
      expect(conf.body.secreto).toMatch(/^[A-Z2-7]{32}$/);
      expect(conf.body.uri).toContain(`secret=${conf.body.secreto}`);
      expect(conf.body.uri).toContain('issuer=Aptio+SCORM');
      expect(conf.body.qrSvg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
      // En la base solo queda cifrado.
      const fila = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('super') } });
      expect(fila.totpPendienteCifrado).toMatch(/^v1\./);
      expect(fila.totpPendienteCifrado).not.toContain(conf.body.secreto);
      expect(fila.totpSecretoCifrado).toBeNull();

      const mal = await request(servidor).post(`${RUTA}/confirmar`).set('Cookie', desafio).send({ codigo: '000000' === codigoActual(conf.body.secreto) ? '111111' : '000000' });
      expect(mal.status).toBe(401);
      expect(mal.body.codigo).toBe('CODIGO_INCORRECTO');
      expect((await prisma.usuario.findUniqueOrThrow({ where: { email: correo('super') } })).intentosFallidos).toBe(1);
      expect((await request(servidor).post(`${RUTA}/confirmar`).set('Cookie', desafio).send({ codigo: 'abc' })).status).toBe(422);

      const ok = await request(servidor).post(`${RUTA}/confirmar`).set('Cookie', desafio).send({ codigo: codigoActual(conf.body.secreto) });
      expect(ok.status).toBe(200);
      expect(ok.body.usuario).toMatchObject({ email: correo('super'), rol: 'SUPERADMIN' });
      codigosRecuperacion = ok.body.codigosRecuperacion;
      expect(codigosRecuperacion).toHaveLength(10);
      const sesion = cookieLlamada(ok, 'sesion')!;
      expect((await request(servidor).get('/api/v1/yo').set('Cookie', sesion)).status).toBe(200);
      // El desafío se borra al abrir la sesión.
      expect(cookiesDe(ok).some((c) => /^segundo_factor=;/.test(c))).toBe(true);

      const activo = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('super') } });
      expect(activo).toMatchObject({ totpPendienteCifrado: null, intentosFallidos: 0 });
      expect(activo.totpActivoDesde).toBeInstanceOf(Date);
      expect(await prisma.codigoRecuperacion.count({ where: { usuarioId: activo.id, usadoEn: null } })).toBe(10);
      // Solo se guarda el HMAC de cada código.
      const hashes = (await prisma.codigoRecuperacion.findMany({ where: { usuarioId: activo.id } })).map((c) => c.hash);
      for (const c of codigosRecuperacion) expect(hashes).not.toContain(c);
      expect(await auditoria('super', 'SEGUNDO_FACTOR_ACTIVADO')).toBe(1);
      expect(await auditoria('super', 'SEGUNDO_FACTOR_FALLIDO')).toBe(1);

      // Ya activo: no se puede volver a configurar sin el restablecimiento de consola.
      const otro = await conClave('super');
      expect(otro.res.body.segundoFactor).toBe('verificar');
      expect((await request(servidor).post(`${RUTA}/configurar`).set('Cookie', otro.desafio)).status).toBe(409);
    });
  });

  describe('CP-161 · con el segundo factor activo', () => {
    it('entra con el código de la aplicación, una sola vez por código', async () => {
      const secreto = await secretoDe(correo('super'));
      await prisma.usuario.update({ where: { email: correo('super') }, data: { totpUltimoPaso: null } });
      const { res, desafio } = await conClave('super');
      expect(res.body.segundoFactor).toBe('verificar');
      expect((await request(servidor).get(RUTA).set('Cookie', desafio)).body.segundoFactor).toBe('verificar');

      // Se tolera un paso de desfase del reloj.
      const ok = await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigo: codigoActual(secreto, -1) });
      expect(ok.status).toBe(200);
      expect(cookieLlamada(ok, 'sesion')).toBeDefined();
      // El mismo código no vuelve a servir, aunque la clave sea correcta.
      const otra = await conClave('super');
      const repetido = await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({ codigo: codigoActual(secreto, -1) });
      expect(repetido.status).toBe(401);
      expect(repetido.body.codigo).toBe('CODIGO_INCORRECTO');
      // Fuera de la ventana de ±30 s tampoco.
      expect((await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({ codigo: codigoActual(secreto, 3) })).status).toBe(401);
    });

    it('sin el teléfono entra con un código de recuperación, que se gasta', async () => {
      const { desafio } = await conClave('super');
      const ok = await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigoRecuperacion: codigosRecuperacion[0]!.toLowerCase().replace('-', ' ') });
      expect(ok.status).toBe(200);
      expect(ok.body.codigosRestantes).toBe(9);
      expect(cookieLlamada(ok, 'sesion')).toBeDefined();
      expect(await auditoria('super', 'CODIGO_RECUPERACION_USADO')).toBe(1);

      const otra = await conClave('super');
      expect((await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({ codigoRecuperacion: codigosRecuperacion[0] })).status).toBe(401);
      expect((await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({ codigoRecuperacion: 'AAAAA-BBBBB' })).status).toBe(401);
      expect((await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({})).status).toBe(401);
      expect((await request(servidor).post(RUTA).set('Cookie', otra.desafio).send({ codigoRecuperacion: codigosRecuperacion[1] })).body.codigosRestantes).toBe(8);
      await prisma.usuario.update({ where: { email: correo('super') }, data: { intentosFallidos: 0 } });
    });

    it('cinco códigos equivocados bloquean la cuenta 15 minutos, aun con el código correcto', async () => {
      await ingresarCookie(servidor, correo('bloqueo'), CLAVE); // configura su segundo factor
      const secreto = await secretoDe(correo('bloqueo'));
      const { desafio } = await conClave('bloqueo');
      const malo = codigoActual(secreto) === '123456' ? '654321' : '123456';
      for (let i = 0; i < 4; i++) expect((await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigo: malo })).body.codigo).toBe('CODIGO_INCORRECTO');
      expect((await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigo: malo })).status).toBe(401);
      const fila = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('bloqueo') } });
      expect(fila.bloqueadoHasta!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
      expect(await auditoria('bloqueo', 'CUENTA_BLOQUEADA')).toBe(1);

      await prisma.usuario.update({ where: { email: correo('bloqueo') }, data: { totpUltimoPaso: null } });
      const bloqueado = await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigo: codigoActual(secreto) });
      expect(bloqueado.status).toBe(401);
      expect(bloqueado.body.codigo).toBe('CUENTA_BLOQUEADA');
      expect((await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo('bloqueo'), clave: CLAVE })).body.codigo).toBe('CUENTA_BLOQUEADA');
    });

    it('un desafío vencido, falsificado o anterior a un cambio de clave no sirve', async () => {
      const u = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('super') } });
      const config = app.get(ConfigSesion);
      const vencido = firmarSesion({ u: u.id, v: u.versionSesion, exp: Date.now() - 1 }, config.secretoDesafio);
      const conSecretoDeSesion = firmarSesion({ u: u.id, v: u.versionSesion, exp: Date.now() + 60_000 }, config.secreto);
      for (const token of [vencido, conSecretoDeSesion, 'basura']) {
        const r = await request(servidor).get(RUTA).set('Cookie', `segundo_factor=${token}`);
        expect(r.status).toBe(401);
        expect(r.body.codigo).toBe('DESAFIO_NO_VALIDO');
      }
      expect((await request(servidor).get(RUTA)).body.codigo).toBe('DESAFIO_NO_VALIDO');
      const { desafio } = await conClave('super');
      await prisma.usuario.update({ where: { id: u.id }, data: { versionSesion: { increment: 1 } } });
      expect((await request(servidor).post(RUTA).set('Cookie', desafio).send({ codigo: '123456' })).body.codigo).toBe('DESAFIO_NO_VALIDO');
    });
  });
});
