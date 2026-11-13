// HU-0609 · Imágenes propias y biblioteca en la API (CP-070, REQ-046, REQ-017): un extra imagen con una imagen subida al
// proyecto la suma a `recursos` del curso en la misma versión, y deshacer (la lista anterior de extras) la quita en el
// mismo cambio; el curso trae su URL firmada; la biblioteca del proyecto lista solo imágenes y SVG propios, con URL;
// 422 RECURSO_NO_VALIDO con un recurso de otro proyecto o que no es imagen; una pieza del kit no necesita recurso;
// el revisor del cliente no edita (403). PostgreSQL real.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const leer = (ruta: string) => JSON.parse(readFileSync(new URL(`../../../packages/ai/casos/loto/${ruta}`, import.meta.url), 'utf8'));
type Extra = { id: string; tipo: string; recursoId?: string; pieza?: string; texto?: { es: string }; x: number; y: number; ancho: number };
type Doc = { recursos: { id: string; tipo: string; origen: string; nombre: string; mime: string }[]; modulos: { capsulas: { pantallas: { id: string; estado?: string; extras?: Extra[] }[] }[] }[] };
const p05De = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p05')!;

describe.skipIf(!hayBase && !process.env.CI)('imágenes propias y biblioteca (HU-0609)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let proyectoId: string;
  let cursoId: string;
  const ids = { foto: randomUUID(), svg: randomUUID(), otroProyecto: randomUUID(), audio: randomUUID(), material: randomUUID() };
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  const documento = async () => (await curso()).documento as unknown as Doc;
  const ruta = () => `/cursos/${cursoId}/pantallas/p05`;
  const foto: Extra = { id: 'p05-extra-imagen-1', tipo: 'imagen', recursoId: ids.foto, texto: { es: 'Operario con casco' }, x: 40, y: 32.2, ancho: 20 };

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org imágenes', slug: `imagenes-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    const otro = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Otro', creadoPorId: di.id } });
    const base = { organizacionId: orgId, clienteId: cliente.id, proyectoId, origen: 'SUBIDO' as const, bytes: 2048n, hash: 'x' };
    const clave = (x: string) => `org/${orgId}/${cliente.id}/${x}`;
    await prisma.recurso.createMany({ data: [
      { ...base, id: ids.foto, tipo: 'IMAGEN', claveS3: clave(ids.foto), mime: 'image/png', nombre: 'operario-con_casco.png' },
      { ...base, id: ids.svg, tipo: 'SVG', claveS3: clave(ids.svg), mime: 'image/svg+xml', nombre: 'senal.svg' },
      { ...base, id: ids.otroProyecto, proyectoId: otro.id, tipo: 'IMAGEN', claveS3: clave(ids.otroProyecto), mime: 'image/png', nombre: 'otro.png' },
      { ...base, id: ids.audio, tipo: 'AUDIO', claveS3: clave(ids.audio), mime: 'audio/mpeg', nombre: 'voz.mp3' },
      { ...base, id: ids.material, origen: 'CLIENTE', tipo: 'IMAGEN', claveS3: clave(ids.material), mime: 'image/png', nombre: 'documento-cliente.png' },
    ] });
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: leer('curso-esperado-es.json'), version: 3 } })).id;
    const colas = { encolar: async () => undefined, encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['grafico', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('CP-070 · la imagen subida queda en la pantalla y en los recursos del curso, en una versión, con su URL firmada', async () => {
    const r = await como('grafico').patch(ruta(), { version: 3, extras: [foto] });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(4);
    const d = await documento();
    expect(p05De(d).extras).toEqual([foto]);
    expect(d.recursos.find((x) => x.id === ids.foto)).toEqual({ id: ids.foto, tipo: 'imagen', origen: 'subido', nombre: 'operario-con_casco.png', mime: 'image/png', bytes: 2048 });
    expect(await prisma.cursoVersion.count({ where: { cursoId, version: 4 } })).toBe(1);
    const c = await como('grafico').get(`/proyectos/${proyectoId}/curso`);
    expect(c.status).toBe(200);
    expect(c.body.urlsRecursos[ids.foto]).toMatch(/X-Amz-Signature=/);
  });

  it('deshacer (la lista anterior) quita la imagen y su recurso en el mismo cambio; un SVG y una pieza del kit también valen', async () => {
    const r = await como('grafico').patch(ruta(), { version: 4, extras: [], motivo: 'deshacer' });
    expect(r.status).toBe(200);
    let d = await documento();
    expect(p05De(d).extras).toBeUndefined();
    expect(d.recursos.some((x) => x.id === ids.foto)).toBe(false);
    const pieza: Extra = { id: 'p05-extra-imagen-2', tipo: 'imagen', pieza: 'candado', texto: { es: 'Candado' }, x: 10, y: 10, ancho: 16 };
    const svg: Extra = { id: 'p05-extra-imagen-3', tipo: 'imagen', recursoId: ids.svg, texto: { es: 'Señal' }, x: 60, y: 10, ancho: 16 };
    expect((await como('grafico').patch(ruta(), { version: 5, extras: [pieza, svg] })).status).toBe(200);
    d = await documento();
    expect(d.recursos.find((x) => x.id === ids.svg)).toMatchObject({ tipo: 'svg', origen: 'subido' });
    expect(p05De(d).estado).toBe('borrador');
  });

  it('422 RECURSO_NO_VALIDO con una imagen de otro proyecto, un audio o un material del cliente; nada cambia', async () => {
    const antes = await curso();
    for (const recursoId of [ids.otroProyecto, ids.audio, ids.material, randomUUID()]) {
      const r = await como('grafico').patch(ruta(), { version: antes.version, extras: [{ ...foto, recursoId }] });
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ codigo: 'RECURSO_NO_VALIDO' });
    }
    const ambas = await como('grafico').patch(ruta(), { version: antes.version, extras: [{ ...foto, pieza: 'casco' }] });
    expect(ambas.status).toBe(422);
    expect(ambas.body).toMatchObject({ codigo: 'EXTRA_NO_VALIDO' });
    expect((await curso()).version).toBe(antes.version);
  });

  it('la biblioteca del proyecto lista sus imágenes y SVG propios con URL, sin el material del cliente ni otros tipos', async () => {
    const r = await como('grafico').get(`/recursos?proyectoId=${proyectoId}&biblioteca=true`);
    expect(r.status).toBe(200);
    expect(r.body.map((x: { id: string }) => x.id).sort()).toEqual([ids.foto, ids.svg].sort());
    for (const x of r.body) expect(x.url).toMatch(/X-Amz-Signature=/);
    const todos = await como('grafico').get(`/recursos?proyectoId=${proyectoId}`);
    expect(todos.body.length).toBe(4);
    expect(todos.body.every((x: { url?: string }) => x.url === undefined)).toBe(true);
  });

  it('el revisor del cliente no agrega imágenes (403)', async () => {
    const c = await curso();
    const r = await como('revisor').patch(ruta(), { version: c.version, extras: [foto] });
    expect(r.status).toBe(403);
  });
});
