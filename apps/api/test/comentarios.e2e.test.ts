// HU-0506 · Comentarios del revisor del cliente (CP-055, REQ-058): el revisor no guarda pantallas (403) pero sí comenta
// (201), solo en cursos de su cliente (404 con otro cliente u otra organización); texto plano de 1 a 1000 caracteres en
// una pantalla del curso (422); resolver y reabrir es del equipo (403 al revisor), con auditoría. El comentario no
// cambia el estado de aprobación de la pantalla. PostgreSQL real.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ComentariosService } from '../src/comentarios/comentarios.service.js';
import { type Correo, CorreoService } from '../src/correo/correo.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}-${sufijo}@comentarios.test`;
const loto = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
type Doc = { modulos: { capsulas: { pantallas: { id: string; estado: string }[] }[] }[] };
const pantalla = (d: Doc, id: string) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === id)!;

describe.skipIf(!hayBase && !process.env.CI)('comentarios del revisor del cliente (HU-0506)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const orgs: string[] = [];
  const ids = { revisor: '', curso: '', ajeno: '', comentario: '' };
  const cookies: Record<string, string> = {};
  const enviados: Correo[] = [];
  const avisos = () => app.get(ComentariosService).avisoPendiente;
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  beforeAll(async () => {
    const org = (await prisma.organizacion.create({ data: { nombre: 'Org comentarios', slug: `comentarios-${sufijo}` } })).id;
    const otra = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `comentarios-otra-${sufijo}` } })).id;
    orgs.push(org, otra);
    const minera = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Minera Andina' } })).id;
    const banco = (await prisma.cliente.create({ data: { organizacionId: org, nombre: 'Banco Sur' } })).id;
    const ajeno = (await prisma.cliente.create({ data: { organizacionId: otra, nombre: 'Ajeno' } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = org, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('Diseño instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('Producción', Rol.PRODUCTOR);
    ids.revisor = (await crear('Lucía Paredes', Rol.REVISOR_CLIENTE, org, { clienteId: minera })).id;
    await crear('Revisor banco', Rol.REVISOR_CLIENTE, org, { clienteId: banco });
    const fuera = await crear('Admin ajeno', Rol.ADMINISTRADOR, otra);
    // HU-1403 · Para el aviso por correo: otra DI con el buzón caído, una inactiva y una de otra organización.
    await crear('Diseño dos', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('DI inactiva', Rol.DISENADOR_INSTRUCCIONAL, org, { activo: false });
    await crear('DI ajena', Rol.DISENADOR_INSTRUCCIONAL, otra);
    const proyecto = (await prisma.proyecto.create({ data: { organizacionId: org, clienteId: minera, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    const proyectoAjeno = (await prisma.proyecto.create({ data: { organizacionId: otra, clienteId: ajeno, nombre: 'Ajeno', creadoPorId: fuera.id } })).id;
    ids.curso = (await prisma.curso.create({ data: { organizacionId: org, proyectoId: proyecto, versionEsquema: '0.2.0', documento: loto } })).id;
    ids.ajeno = (await prisma.curso.create({ data: { organizacionId: otra, proyectoId: proyectoAjeno, versionEsquema: '0.2.0', documento: loto } })).id;

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CorreoService)
      .useValue({
        enviar: async (m: Correo) => {
          if (m.para === correo('Diseño dos')) throw new Error('SMTP 554 buzón no disponible');
          enviados.push(m);
        },
      })
      .compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['Diseño instruccional', 'Producción', 'Lucía Paredes', 'Revisor banco', 'Admin ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@comentarios.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('CP-055 · el revisor recibe 403 al guardar una pantalla y 201 al comentarla', async () => {
    const revisor = como('Lucía Paredes');
    await revisor.patch(`/cursos/${ids.curso}/pantallas/p05`, { version: 1, titulo: { es: 'Cambiado por el cliente' } }).expect(403);
    await revisor.post(`/cursos/${ids.curso}/pantallas/p05/aprobar`, {}).expect(403);
    const r = await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: '  Cambien la foto: ese candado no es el que usamos.  ' }).expect(201);
    expect(r.body).toMatchObject({
      cursoId: ids.curso, pantallaId: 'p05', texto: 'Cambien la foto: ese candado no es el que usamos.', resuelto: false, resueltoPor: null, resueltoEn: null,
      autor: { id: ids.revisor, nombre: 'Lucía Paredes', rol: 'REVISOR_CLIENTE' },
    });
    ids.comentario = r.body.id;
    // El curso no cambió: ni la versión ni el estado de la pantalla.
    const curso = await prisma.curso.findUniqueOrThrow({ where: { id: ids.curso } });
    expect(curso.version).toBe(1);
    expect(pantalla(curso.documento as unknown as Doc, 'p05').estado).toBe(pantalla(loto as Doc, 'p05').estado);
  });

  it('HU-1403 · el comentario del cliente avisa por correo al equipo del curso, y un buzón caído no lo impide', async () => {
    await avisos();
    // Quien creó el proyecto (diseño instruccional) lo recibe; la DI con el buzón caído falla sin afectar el 201.
    expect(enviados.map((m) => m.para)).toEqual([correo('Diseño instruccional')]);
    expect(enviados[0]).toMatchObject({
      asunto: 'Aptio SCORM · Nuevo comentario del cliente en «Bloqueo y etiquetado»',
      texto: expect.stringContaining('Lucía Paredes (revisión del cliente) comentó la pantalla p05'),
    });
    expect(enviados[0]!.texto).toContain('Cambien la foto: ese candado no es el que usamos.');
    expect(enviados[0]!.texto).toMatch(/\/proyectos\/[0-9a-f-]+\/revision\?pantalla=p05/);
    // Un comentario del equipo no avisa.
    enviados.length = 0;
    await como('Producción').post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p06', texto: 'Nota interna.' }).expect(201);
    await avisos();
    expect(enviados).toHaveLength(0);
  });

  it('el equipo también comenta y todos ven la lista en orden, con el rol del autor', async () => {
    await como('Producción').post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: 'Listo, la cambio por la del kit.' }).expect(201);
    const lista = await como('Lucía Paredes').get(`/cursos/${ids.curso}/comentarios`).expect(200);
    expect(lista.body.map((c: { autor: { rol: string } }) => c.autor.rol)).toEqual(['REVISOR_CLIENTE', 'PRODUCTOR', 'PRODUCTOR']);
    expect((await como('Diseño instruccional').get(`/cursos/${ids.curso}/comentarios`).expect(200)).body).toHaveLength(3);
  });

  it('valida el texto plano de 1 a 1000 caracteres y que la pantalla sea del curso (422)', async () => {
    const revisor = como('Lucía Paredes');
    await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: '   ' }).expect(422);
    await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: 'x'.repeat(1001) }).expect(422);
    await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: 'con\u0007control' }).expect(422);
    expect((await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p99', texto: 'Hola' }).expect(422)).body).toMatchObject({ codigo: 'PANTALLA_NO_EXISTE' });
    await revisor.post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: 'x'.repeat(1000) }).expect(201);
    // Sin edición ni borrado: el PATCH solo acepta «resuelto».
    await como('Diseño instruccional').patch(`/comentarios/${ids.comentario}`, { texto: 'otro' }).expect(422);
  });

  it('aislamiento: otro cliente y otra organización reciben 404', async () => {
    await como('Revisor banco').get(`/cursos/${ids.curso}/comentarios`).expect(404);
    await como('Revisor banco').post(`/cursos/${ids.curso}/comentarios`, { pantallaId: 'p05', texto: 'Hola' }).expect(404);
    await como('Admin ajeno').get(`/cursos/${ids.curso}/comentarios`).expect(404);
    await como('Admin ajeno').patch(`/comentarios/${ids.comentario}`, { resuelto: true }).expect(404);
    await como('Lucía Paredes').get(`/cursos/${ids.ajeno}/comentarios`).expect(404);
    const r = await como('Revisor banco').get(`/cursos/${ids.curso}/comentarios`);
    expect(r.status).toBe(404);
  });

  it('resolver y reabrir es del equipo, con quién, cuándo y auditoría; el revisor recibe 403', async () => {
    await como('Lucía Paredes').patch(`/comentarios/${ids.comentario}`, { resuelto: true }).expect(403);
    const r = await como('Diseño instruccional').patch(`/comentarios/${ids.comentario}`, { resuelto: true }).expect(200);
    expect(r.body).toMatchObject({ resuelto: true, resueltoPor: 'Diseño instruccional', resueltoEn: expect.any(String), texto: 'Cambien la foto: ese candado no es el que usamos.' });
    expect(await prisma.auditoria.findFirst({ where: { accion: 'COMENTARIO_RESUELTO', entidadId: ids.comentario } })).toMatchObject({ entidad: 'Comentario', datos: { cursoId: ids.curso, pantallaId: 'p05' } });
    const a = await como('Producción').patch(`/comentarios/${ids.comentario}`, { resuelto: false }).expect(200);
    expect(a.body).toMatchObject({ resuelto: false, resueltoPor: null, resueltoEn: null });
    expect(await prisma.auditoria.count({ where: { accion: 'COMENTARIO_REABIERTO', entidadId: ids.comentario } })).toBe(1);
    const fila = await prisma.comentario.findUniqueOrThrow({ where: { id: ids.comentario } });
    expect(fila).toMatchObject({ resuelto: false, resueltoPorId: null, resueltoEn: null });
  });
});
