// HU-0108 · Ingresar con Google (CP-007 a CP-009) contra PostgreSQL real; Google se simula con claves propias.
// Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { GoogleService } from '../src/auth/google.service.js';
import { emisorDePrueba } from './google-firma.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLIENTE = 'cliente-prueba.apps.googleusercontent.com';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';

describe.skipIf(!hayBase && !process.env.CI)('ingresar con Google (HU-0108)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  const google = emisorDePrueba();
  /** Lo que «Google» pone en el id_token de la próxima vuelta. */
  let identidad: Record<string, unknown> = {};
  let canjes: URLSearchParams[] = [];

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENTE;
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org Google', slug: `google-${sufijo}` } })).id;
    const clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    // Invitada: sin clave todavía, con su correo de Google.
    await prisma.usuario.create({ data: { nombre: 'Ana', email: correo('ana'), rol: Rol.DISENADOR_INSTRUCCIONAL, organizacionId: orgId } });
    await prisma.usuario.create({ data: { nombre: 'Revisora', email: correo('revisora'), rol: Rol.REVISOR_CLIENTE, organizacionId: orgId, clienteId } });
    await prisma.usuario.create({ data: { nombre: 'Baja', email: correo('baja'), rol: Rol.PRODUCTOR, organizacionId: orgId, activo: false } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    app.get(GoogleService).pedir = async (url, init) => {
      if (String(url).endsWith('/certs')) return Response.json(google.jwks);
      const cuerpo = new URLSearchParams(String(init?.body));
      canjes.push(cuerpo);
      if (cuerpo.get('code') !== 'codigo-bueno') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ id_token: google.firmar(identidad), access_token: 'x', token_type: 'Bearer' });
    };
  });

  beforeEach(() => {
    canjes = [];
  });

  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { OR: [{ organizacionId: orgId }, { accion: 'GOOGLE_RECHAZADO', datos: { path: ['email'], string_contains: sufijo } }] } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  /** Ida a Google y vuelta con el código; devuelve la redirección final y la cookie de sesión, si hubo. */
  async function ingresarConGoogle(datos: Record<string, unknown>, vuelta: (state: string) => Record<string, string> = (state) => ({ code: 'codigo-bueno', state })) {
    const ida = await request(servidor).get('/api/v1/auth/google');
    expect(ida.status).toBe(302);
    const url = new URL(ida.headers.location!);
    const cookieIda = ([] as string[]).concat(ida.headers['set-cookie'] ?? []).find((c) => c.startsWith('google_oidc='))!.split(';')[0]!;
    identidad = {
      iss: 'https://accounts.google.com', aud: CLIENTE, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
      nonce: url.searchParams.get('nonce'), email_verified: true, ...datos,
    };
    const q = new URLSearchParams({ ...vuelta(url.searchParams.get('state')!), scope: 'openid email profile', authuser: '0' });
    const res = await request(servidor).get(`/api/v1/auth/google/callback?${q.toString()}`).set('Cookie', cookieIda);
    const sesion = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sesion='))?.split(';')[0];
    return { ida: url, res, sesion };
  }

  it('CP-007 · el invitado entra con su rol y su cuenta queda vinculada', async () => {
    const { ida, res, sesion } = await ingresarConGoogle({ sub: 'google-ana', email: correo('ana').toUpperCase(), name: 'Ana Pérez' });
    expect(ida.origin).toBe('https://accounts.google.com');
    expect(ida.searchParams.get('code_challenge_method')).toBe('S256');
    // PKCE: el verificador que se canjea corresponde al desafío enviado a Google.
    expect(createHash('sha256').update(canjes[0]!.get('code_verifier')!).digest('base64url')).toBe(ida.searchParams.get('code_challenge'));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB}/`);
    const yo = await request(servidor).get('/api/v1/yo').set('Cookie', sesion!);
    expect(yo.status).toBe(200);
    expect(yo.body).toMatchObject({ email: correo('ana'), rol: 'DISENADOR_INSTRUCCIONAL', metodos: ['google'] });
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { email: correo('ana') } });
    expect(fila).toMatchObject({ googleSub: 'google-ana', emailVerificado: true });
    expect(await prisma.auditoria.count({ where: { usuarioId: fila.id, accion: 'GOOGLE_VINCULADA' } })).toBe(1);

    // La segunda vez entra por el identificador de Google, aunque cambie el correo en Google.
    const otra = await ingresarConGoogle({ sub: 'google-ana', email: 'ana.nueva@gmail.com' });
    expect(otra.res.headers.location).toBe(`${WEB}/`);
    expect(await prisma.auditoria.count({ where: { usuarioId: fila.id, accion: 'GOOGLE_VINCULADA' } })).toBe(1);
  });

  it('el revisor del cliente entra con su alcance', async () => {
    const { sesion } = await ingresarConGoogle({ sub: 'google-revisora', email: correo('revisora') });
    expect((await request(servidor).get('/api/v1/yo').set('Cookie', sesion!)).body.rol).toBe('REVISOR_CLIENTE');
  });

  it('CP-008 · un correo que nadie invitó ve «sin acceso» y no se crea ninguna cuenta', async () => {
    const { res, sesion } = await ingresarConGoogle({ sub: 'google-extrano', email: correo('extrano') });
    expect(res.headers.location).toBe(`${WEB}/ingresar?error=sin_acceso`);
    expect(sesion).toBeUndefined();
    // Se cuenta solo ese correo: las demás pruebas corren a la vez (`pnpm -r test`) y crean sus propios usuarios.
    expect(await prisma.usuario.count({ where: { email: correo('extrano') } })).toBe(0);
    expect(await prisma.usuario.findUnique({ where: { googleSub: 'google-extrano' } })).toBeNull();
    // Un usuario desactivado tampoco entra, ni otra cuenta de Google con el correo de alguien ya vinculado.
    expect((await ingresarConGoogle({ sub: 'google-baja', email: correo('baja') })).res.headers.location).toBe(`${WEB}/ingresar?error=sin_acceso`);
    expect((await ingresarConGoogle({ sub: 'google-impostor', email: correo('ana') })).res.headers.location).toBe(`${WEB}/ingresar?error=sin_acceso`);
  });

  it('CP-009 · con email_verified = false no ingresa', async () => {
    const { res, sesion } = await ingresarConGoogle({ sub: 'google-revisora', email: correo('revisora'), email_verified: false });
    expect(res.headers.location).toBe(`${WEB}/ingresar?error=correo_no_verificado`);
    expect(sesion).toBeUndefined();
  });

  it('rechaza un state distinto, un código inválido, el nonce de otra ida y la cancelación en Google', async () => {
    const distinto = await ingresarConGoogle({ sub: 'google-ana', email: correo('ana') }, () => ({ code: 'codigo-bueno', state: 'otro' }));
    expect(distinto.res.headers.location).toBe(`${WEB}/ingresar?error=google_fallo`);
    expect(canjes).toHaveLength(0);
    const malo = await ingresarConGoogle({ sub: 'google-ana', email: correo('ana') }, (state) => ({ code: 'codigo-malo', state }));
    expect(malo.res.headers.location).toBe(`${WEB}/ingresar?error=google_fallo`);
    const nonce = await ingresarConGoogle({ sub: 'google-ana', email: correo('ana'), nonce: 'de-otra-ida' });
    expect(nonce.res.headers.location).toBe(`${WEB}/ingresar?error=google_fallo`);
    expect(nonce.sesion).toBeUndefined();
    const cancelado = await ingresarConGoogle({}, (state) => ({ error: 'access_denied', state }));
    expect(cancelado.res.headers.location).toBe(`${WEB}/ingresar?error=google_cancelado`);
    // Sin la cookie de la ida no hay vuelta posible.
    const sinCookie = await request(servidor).get('/api/v1/auth/google/callback?code=codigo-bueno&state=x');
    expect(sinCookie.headers.location).toBe(`${WEB}/ingresar?error=google_fallo`);
  });
});

describe.skipIf(!hayBase && !process.env.CI)('Google sin configurar', () => {
  it('vuelve a la web con google_no_disponible', async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = configurarApp(modulo.createNestApplication());
    await app.init();
    const res = await request(app.getHttpServer()).get('/api/v1/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB}/ingresar?error=google_no_disponible`);
    await app.close();
  });
});
