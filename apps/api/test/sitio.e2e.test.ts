// HU-1501 · CP-109: las rutas /sitio/* son solo del superadmin de plataforma (ADR-011). El administrador de una
// organización y el resto de los roles reciben 403; sin sesión, 401. PostgreSQL real.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n.toLowerCase()}-${sufijo}@sitio.test`;
const ROLES_ORGANIZACION = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR', 'REVISOR_CLIENTE'] as const;

describe.skipIf(!hayBase && !process.env.CI)('sitio web solo para el superadmin (HU-1501)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let org = '';
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    org = (await prisma.organizacion.create({ data: { nombre: 'Org sitio', slug: `sitio-${sufijo}` } })).id;
    const cliente = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera' } })).id;
    const hashClave = await hashearClave(CLAVE);
    for (const rol of ROLES_ORGANIZACION) {
      await prisma.usuario.create({
        data: { nombre: rol, email: correo(rol), rol: Rol[rol], organizacionId: org, hashClave, emailVerificado: true, ...(rol === 'REVISOR_CLIENTE' ? { clienteId: cliente } : {}) },
      });
    }
    await prisma.usuario.create({ data: { nombre: 'Super', email: correo('SUPERADMIN'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of [...ROLES_ORGANIZACION, 'SUPERADMIN']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      if (res.status !== 200) throw new Error(`No pudo ingresar ${n}: ${res.status}`);
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { OR: [{ organizacionId: org }, { usuario: { email: { endsWith: `-${sufijo}@sitio.test` } } }] } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@sitio.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: org } });
    await prisma.organizacion.deleteMany({ where: { id: org } });
  });

  it('CP-109: el administrador de una organización recibe 403 en GET /sitio/paginas', async () => {
    const res = await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies.ADMINISTRADOR!);
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('Tu rol no permite esta acción');
  });

  it('ningún otro rol de la organización entra', async () => {
    const estados = [];
    for (const rol of ROLES_ORGANIZACION) estados.push([rol, (await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies[rol]!)).status]);
    expect(estados).toEqual(ROLES_ORGANIZACION.map((rol) => [rol, 403]));
  });

  it('sin sesión responde 401', async () => {
    expect((await request(servidor).get('/api/v1/sitio/paginas')).status).toBe(401);
  });

  it('el superadmin ve la lista de páginas (vacía hasta la HU-1502)', async () => {
    const res = await request(servidor).get('/api/v1/sitio/paginas').set('Cookie', cookies.SUPERADMIN!);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    const yo = await request(servidor).get('/api/v1/yo').set('Cookie', cookies.SUPERADMIN!);
    expect(yo.body).toMatchObject({ rol: 'SUPERADMIN', clienteId: null });
  });
});
