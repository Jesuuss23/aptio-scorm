// HU-0304 · Material del cliente de un proyecto (CP-033, CP-034) contra PostgreSQL real; la cola se sustituye por un doble.
// Se salta sin DATABASE_URL, salvo en CI. La extracción y el OCR se prueban en apps/worker/test.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo, NombreCola } from '@aptio/colas';
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
const PDF = 'application/pdf';

describe.skipIf(!hayBase && !process.env.CI)('material del cliente (HU-0304)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let otraOrgId: string;
  let clienteId: string;
  let otroClienteId: string;
  let proyectoId: string;
  let otroProyectoId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: NombreCola; datos: DatosTrabajo }[] = [];
  let colaCaida = false;

  const recurso = (nombre: string, mime: string, tipo: 'DOCUMENTO' | 'AUDIO' | 'IMAGEN', proyecto = proyectoId) =>
    prisma.recurso.create({
      data: {
        organizacionId: orgId, clienteId, proyectoId: proyecto, tipo, origen: 'CLIENTE', claveS3: `prueba/${sufijo}/${Math.random()}`,
        mime, bytes: 100, hash: 'x', nombre,
      },
    });

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org material', slug: `material-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `material-otra-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    otroClienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Banco Sur', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, organizacionId = orgId, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId, hashClave, emailVerificado: true, ...extra } });
    const productorId = (await crear('productor', Rol.PRODUCTOR)).id;
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, orgId, { clienteId: otroClienteId });
    await crear('ajeno', Rol.ADMINISTRADOR, otraOrgId);
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Bloqueo y etiquetado', creadoPorId: productorId } })).id;
    otroProyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Otro', creadoPorId: productorId } })).id;

    const colas = {
      encolar: (cola: NombreCola, datos: DatosTrabajo) => {
        if (colaCaida) return Promise.reject(new Error('Redis no responde'));
        encolados.push({ cola, datos });
        return Promise.resolve();
      },
    };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['productor', 'grafico', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditoria.deleteMany({ where: { organizacionId: { in: [orgId, otraOrgId] } } });
    await prisma.materialFuente.deleteMany({ where: { proyectoId: { in: [proyectoId, otroProyectoId] } } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const ruta = (id = proyectoId) => `/proyectos/${id}/materiales`;

  it('CP-033 · un PDF del proyecto queda pendiente y encola la extracción en la cola media', async () => {
    const r = await recurso('Procedimiento LOTO.pdf', PDF, 'DOCUMENTO');
    const res = await como('productor').post(ruta(), { recursoId: r.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'PDF', recursoId: r.id, nombre: 'Procedimiento LOTO.pdf', estado: 'pendiente', paginas: [], error: null });
    expect(encolados).toEqual([{ cola: 'media', datos: { trabajoId: res.body.id, organizacionId: orgId, tarea: 'EXTRAER_TEXTO' } }]);
    // Agregar el mismo archivo otra vez no duplica ni vuelve a encolar.
    const otra = await como('productor').post(ruta(), { recursoId: r.id });
    expect(otra.body.id).toBe(res.body.id);
    expect(encolados).toHaveLength(1);
    expect(await prisma.auditoria.count({ where: { organizacionId: orgId, accion: 'MATERIAL_AGREGADO', entidadId: res.body.id } })).toBe(1);
  });

  it('acepta solo el tema, sin archivo, y lo deja listo', async () => {
    const res = await como('productor').post(ruta(), { tema: 'Bloqueo y etiquetado de energías peligrosas' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'TEMA', recursoId: null, tema: 'Bloqueo y etiquetado de energías peligrosas', estado: 'listo' });
    const lista = await como('grafico').get(ruta());
    expect(lista.status).toBe(200);
    expect(lista.body.map((m: { tipo: string }) => m.tipo)).toEqual(['PDF', 'TEMA']);
  });

  it('pide archivo o tema, rechaza audio, otros tipos y archivos de otro proyecto', async () => {
    expect((await como('productor').post(ruta(), {})).body.codigo).toBe('MATERIAL_INCOMPLETO');
    const pdf = await recurso('a.pdf', PDF, 'DOCUMENTO');
    expect((await como('productor').post(ruta(), { recursoId: pdf.id, tema: 'Tema' })).status).toBe(422);
    const audio = await recurso('charla.mp3', 'audio/mpeg', 'AUDIO');
    const conAudio = await como('productor').post(ruta(), { recursoId: audio.id });
    expect(conAudio.status).toBe(422);
    expect(conAudio.body.codigo).toBe('TRANSCRIPCION_PENDIENTE');
    const imagen = await recurso('foto.png', 'image/png', 'IMAGEN');
    expect((await como('productor').post(ruta(), { recursoId: imagen.id })).body.codigo).toBe('TIPO_NO_PERMITIDO');
    const ajeno = await recurso('otro.pdf', PDF, 'DOCUMENTO', otroProyectoId);
    expect((await como('productor').post(ruta(), { recursoId: ajeno.id })).status).toBe(404);
    expect((await como('productor').post(ruta(), { tema: 'ab' })).status).toBe(422);
  });

  it('sin cola, el material queda en error en vez de pendiente para siempre', async () => {
    colaCaida = true;
    const r = await recurso('Manual.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCUMENTO');
    const res = await como('productor').post(ruta(), { recursoId: r.id });
    colaCaida = false;
    expect(res.status).toBe(500);
    const fila = await prisma.materialFuente.findFirstOrThrow({ where: { recursoId: r.id } });
    expect(fila.estado).toBe('error');
    expect(fila.error).toMatch(/encolar/);
  });

  it('permisos: el diseñador gráfico mira, el revisor de otro cliente y otra organización no ven el proyecto', async () => {
    expect((await como('grafico').post(ruta(), { tema: 'Un tema' })).status).toBe(403);
    expect((await como('revisor').get(ruta())).status).toBe(404);
    expect((await como('ajeno').get(ruta())).status).toBe(404);
    expect((await como('ajeno').post(ruta(), { tema: 'Un tema' })).status).toBe(404);
  });
});
