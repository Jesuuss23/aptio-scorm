// HU-0205 · Glosario y pronunciación (CP-027) contra PostgreSQL real. Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { KIT_INICIAL } from '@aptio/schema/marca';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;

/** Curso mínimo: dos pantallas con narración; solo la primera menciona LOTO. */
const documento = {
  modulos: [{ id: 'm1', capsulas: [{ id: 'c1', pantallas: [
    { id: 'p1', bloques: [{ id: 'b1', texto: { es: 'Bloqueo LOTO' } }], narracion: { texto: { es: 'Aplica el LOTO antes de abrir.' }, porIdioma: {} } },
    { id: 'p2', bloques: [{ id: 'b2', texto: { es: 'Candado' } }], narracion: { texto: { es: 'Revisa el candado.' }, porIdioma: {} } },
  ] }] }],
};

describe.skipIf(!hayBase && !process.env.CI)('glosario y pronunciación (HU-0205)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let cursoId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org glosario', slug: `glosario-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `glosario-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina' } })).id;
    await prisma.kitMarca.create({ data: { clienteId, estilo: 'Industrial', paleta: KIT_INICIAL.paleta, tipografias: KIT_INICIAL.tipografias, voces: KIT_INICIAL.voces } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const productor = await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, { clienteId });
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    const proyecto = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'LOTO', creadoPorId: productor.id } });
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: proyecto.id, versionEsquema: '0.2.0', documento } })).id;
    const ruta = (p: number) => `/modulos/0/capsulas/0/pantallas/${p}/bloques/0/texto`;
    await prisma.traduccion.createMany({
      data: [
        { cursoId, ruta: ruta(0), idioma: 'en', textoOrigenHash: 'a1', estado: 'REVISADA' },
        { cursoId, ruta: ruta(1), idioma: 'en', textoOrigenHash: 'a2', estado: 'REVISADA' },
      ],
    });
    await prisma.narracion.createMany({
      data: [
        { cursoId, pantallaId: 'p1', idioma: 'es', textoHash: 'b1', origen: 'tts', estado: 'ACTUALIZADA' },
        { cursoId, pantallaId: 'p2', idioma: 'es', textoHash: 'b2', origen: 'tts', estado: 'ACTUALIZADA' },
      ],
    });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    put: (ruta: string, datos: object) => request(servidor).put(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  it('el productor registra un término que no se traduce y la traducción afectada vuelve a pendiente', async () => {
    const r = await como('productor').put(`/clientes/${clienteId}/glosario`, [{ termino: 'LOTO', noTraducir: true }, { termino: 'tablero', traduccion: 'panel' }]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ termino: 'LOTO', traduccion: null, noTraducir: true }, { termino: 'tablero', traduccion: 'panel', noTraducir: false }]);
    const estados = await prisma.traduccion.findMany({ where: { cursoId }, orderBy: { ruta: 'asc' }, select: { estado: true } });
    expect(estados.map((t) => t.estado)).toEqual(['PENDIENTE', 'REVISADA']);
    expect((await como('productor').get(`/clientes/${clienteId}/glosario`)).body).toHaveLength(2);
  });

  it('CP-027 · «LOTO» → «lo-to»: la muestra lleva la pronunciación y solo la narración afectada se desactualiza', async () => {
    const r = await como('productor').put(`/clientes/${clienteId}/pronunciacion`, [{ idioma: 'es', escrito: 'LOTO', pronunciado: 'lo-to' }]);
    expect(r.status).toBe(200);
    const narraciones = await prisma.narracion.findMany({ where: { cursoId }, orderBy: { pantallaId: 'asc' }, select: { estado: true } });
    expect(narraciones.map((n) => n.estado)).toEqual(['DESACTUALIZADA', 'ACTUALIZADA']);

    const muestra = await como('productor').post('/voz/muestra', { texto: 'Aplica el LOTO antes de abrir.', idioma: 'es', clienteId });
    expect(muestra.status).toBe(200);
    expect(muestra.body).toMatchObject({
      ssml: '<speak>Aplica el <sub alias="lo-to">LOTO</sub> antes de abrir.</speak>',
      dicho: 'Aplica el lo-to antes de abrir.', aplicados: ['LOTO'], voz: KIT_INICIAL.voces.es.voz, simulada: true, bocas: [],
    });
    expect(muestra.body.audioUrl).toMatch(/^data:audio\/wav;base64,/);
    // Guardar lo mismo otra vez no desactualiza nada nuevo.
    await prisma.narracion.updateMany({ where: { cursoId }, data: { estado: 'ACTUALIZADA' } });
    await como('productor').put(`/clientes/${clienteId}/pronunciacion`, [{ idioma: 'es', escrito: 'LOTO', pronunciado: 'lo-to' }]);
    expect(await prisma.narracion.count({ where: { cursoId, estado: 'DESACTUALIZADA' } })).toBe(0);
  });

  it('rechaza términos repetidos, sin traducción o con etiquetas', async () => {
    const g = await como('productor').put(`/clientes/${clienteId}/glosario`, [{ termino: 'LOTO', noTraducir: true }, { termino: 'loto', noTraducir: true }, { termino: 'candado' }]);
    expect(g.status).toBe(422);
    expect(g.body.codigo).toBe('TERMINOS_NO_VALIDOS');
    expect(g.body.detalles).toEqual([{ error: '«loto» está repetido' }, { error: '«candado»: indica la traducción o marca «no traducir»' }]);
    const p = await como('productor').put(`/clientes/${clienteId}/pronunciacion`, [{ idioma: 'es', escrito: 'EPP', pronunciado: '<break/>' }]);
    expect(p.status).toBe(422);
    const raro = await como('productor').put(`/clientes/${clienteId}/pronunciacion`, [{ idioma: 'fr', escrito: 'EPP', pronunciado: 'e' }]);
    expect(raro.status).toBe(422);
    expect((await como('productor').get(`/clientes/${clienteId}/pronunciacion`)).body).toEqual([{ idioma: 'es', escrito: 'LOTO', pronunciado: 'lo-to' }]);
  });

  it('fuera del modo simulado usa Google con la clave del entorno y registra el consumo', async () => {
    const muestra = () => como('productor').post('/voz/muestra', { texto: 'Aplica el LOTO.', idioma: 'es', clienteId });
    vi.stubEnv('PROVEEDORES_MODO', 'real');
    vi.stubEnv('GOOGLE_TTS_API_KEY', '');
    try {
      const sinClave = await muestra();
      expect(sinClave.status).toBe(503);
      expect(sinClave.body.codigo).toBe('VOZ_NO_DISPONIBLE');

      vi.stubEnv('GOOGLE_TTS_API_KEY', 'clave-de-prueba');
      const google = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ audioContent: Buffer.from('mp3').toString('base64') })));
      vi.stubGlobal('fetch', google);
      const r = await muestra();
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ proveedor: 'google', simulada: false, audioUrl: `data:audio/mpeg;base64,${Buffer.from('mp3').toString('base64')}` });
      const enviado = JSON.parse((google.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(enviado.input.ssml).toBe('<speak>Aplica el <sub alias="lo-to">LOTO</sub>.</speak>');
      expect(await prisma.trabajoIA.findFirst({ where: { organizacionId: orgId, tarea: 'MUESTRA_VOZ' } })).toMatchObject({ tipo: 'VOZ', proveedor: 'google', estado: 'COMPLETADO' });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('el revisor del cliente no entra y otra organización no ve al cliente', async () => {
    expect((await como('revisor').get(`/clientes/${clienteId}/glosario`)).status).toBe(403);
    expect((await como('revisor').post('/voz/muestra', { texto: 'Hola', idioma: 'es' })).status).toBe(403);
    expect((await como('ajeno').get(`/clientes/${clienteId}/pronunciacion`)).status).toBe(404);
    expect((await como('ajeno').post('/voz/muestra', { texto: 'Hola', idioma: 'es', clienteId })).status).toBe(404);
  });
});
