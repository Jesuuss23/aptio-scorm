// HU-0903 · Pausas propuestas por la IA en la API (CP-082, REQ-027): pedir encola IA-09 con la transcripción del video
// (material del cliente del mismo recurso, HU-0305) y responde 422 SIN_TRANSCRIPCION si falta; la propuesta se guarda como
// lo hace el worker (salida grabada de LOTO); aplicar suma solo los marcadores elegidos, con ids nuevos, y dice cuáles se
// omitieron por quedar a menos de 2 s de otro; deshacer vuelve a la lista anterior; vence (409) si el video cambió; el
// revisor del cliente no pide ni aplica (403). PostgreSQL real.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatosTrabajo } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { huellaPantalla } from '@aptio/schema/propuesta';
import type { CursoDoc } from '@aptio/schema/revision';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ColasService } from '../src/trabajos/colas.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const leer = (ruta: string) => JSON.parse(readFileSync(new URL(`../../../packages/ai/casos/loto/${ruta}`, import.meta.url), 'utf8'));
const GRABADA = leer('salidas/X-IA-09-pausas-p18.json') as { cambiosTema: unknown[]; marcadores: { id: string; tiempoMs: number; tipo: string }[]; observaciones: string[] };
const { segmentos } = leer('entrada/transcripcion-procedimiento.json');
type Marcador = { id: string; tiempoMs: number; tipo: string; pregunta?: { id: string } };
type Doc = { modulos: { capsulas: { pantallas: { id: string; estado?: string; bloques: { id: string; tipo: string; recursoId?: string; marcadores?: Marcador[] }[] }[] }[] }[] };
const videoDe = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p18')!.bloques.find((b) => b.tipo === 'video')!;

describe.skipIf(!hayBase && !process.env.CI)('pausas propuestas desde la transcripción (HU-0903)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let proyectoId: string;
  let cursoId: string;
  let materialId: string;
  const videoId = randomUUID();
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: DatosTrabajo }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  const documento = async () => (await curso()).documento as unknown as Doc;
  /** Lo que guarda el worker al terminar IA-09 sobre la pantalla tal como está. */
  const propuesta = async () => {
    const c = await curso();
    return prisma.propuesta.create({
      data: {
        cursoId, pantallaId: 'p18', tipo: 'pausas-video', titulo: '8 pausas propuestas desde la transcripción', descripcion: '4 cambios de tema', versionBase: c.version,
        cambios: { bloqueId: 'p18-video', duracionMs: 150000, cambiosTema: GRABADA.cambiosTema, marcadores: GRABADA.marcadores, observaciones: GRABADA.observaciones, huella: huellaPantalla(c.documento as unknown as CursoDoc, 'p18') } as object,
      },
    });
  };

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org pausas', slug: `pausas-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    await prisma.recurso.create({ data: { id: videoId, organizacionId: orgId, clienteId: cliente.id, tipo: 'VIDEO', origen: 'CLIENTE', claveS3: `org/${orgId}/${videoId}`, mime: 'video/mp4', nombre: 'procedimiento.mp4', bytes: 10n, hash: 'x' } });
    // Al principio el video de p18 es el de LOTO (sin subir): no hay material con transcripción.
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: leer('curso-esperado-es.json'), version: 3 } })).id;
    await prisma.cursoVersion.create({ data: { cursoId, version: 3, documento: leer('curso-esperado-es.json'), motivo: 'generación' } });
    const colas = { encolar: async (cola: string, datos: DatosTrabajo) => void encolados.push({ cola, datos }), encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });
  beforeEach(() => void encolados.splice(0));

  afterAll(async () => {
    await app?.close();
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('sin transcripción del video, 422 SIN_TRANSCRIPCION; con ella, encola IA-09 con el video y el material', async () => {
    const ruta = `/cursos/${cursoId}/propuestas`;
    const sin = await como('productor').post(ruta, { tipo: 'pausas-video', pantallaId: 'p18' });
    expect(sin.status).toBe(422);
    expect(sin.body).toMatchObject({ codigo: 'SIN_TRANSCRIPCION', mensaje: 'Transcribe el video en Material del cliente' });
    expect((await como('productor').post(ruta, { tipo: 'pausas-video', pantallaId: 'p05' })).body).toMatchObject({ codigo: 'BLOQUE_NO_EXISTE' });
    expect((await como('productor').post(ruta, { tipo: 'pausas-video' })).body).toMatchObject({ codigo: 'PANTALLA_REQUERIDA' });

    // El video subido del cliente, con su transcripción en Material del cliente (HU-0305).
    const doc = await documento();
    (doc as unknown as { recursos: object[] }).recursos.push({ id: videoId, tipo: 'video', origen: 'cliente', nombre: 'procedimiento.mp4', mime: 'video/mp4' });
    videoDe(doc).recursoId = videoId;
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object } });
    await prisma.materialFuente.create({ data: { proyectoId, tipo: 'VIDEO', recursoId: videoId, estado: 'procesando' } });
    expect((await como('productor').post(ruta, { tipo: 'pausas-video', pantallaId: 'p18' })).body).toMatchObject({ codigo: 'SIN_TRANSCRIPCION' });
    materialId = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'VIDEO', recursoId: videoId, estado: 'listo', transcripcion: segmentos } })).id;

    const r = await como('productor').post(ruta, { tipo: 'pausas-video', pantallaId: 'p18' });
    expect(r.status).toBe(202);
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: 'IA-09', pantallaId: 'p18', propuesta: { cursoId, tipo: 'pausas-video', bloqueId: 'p18-video', materialId } } }]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ estado: 'EN_COLA', tarea: 'IA-09' });
  });

  it('CP-082 · se ve con sus cambios de tema; aplicar solo las elegidas las suma con ids nuevos y avisa la omitida; deshacer vuelve', async () => {
    const p = await propuesta();
    const vista = (await como('productor').get(`/cursos/${cursoId}/propuestas?pantallaId=p18`)).body.find((x: { id: string }) => x.id === p.id);
    expect(vista).toMatchObject({ tipo: 'pausas-video', pantallaId: 'p18', estado: 'PENDIENTE', pausas: { bloqueId: 'p18-video', duracionMs: 150000, observaciones: GRABADA.observaciones } });
    expect(vista.pausas.cambiosTema).toHaveLength(4);
    expect(vista.pausas.marcadores).toHaveLength(8);

    const antes = videoDe(await documento()).marcadores!;
    const { version } = await curso();
    // ia-8 queda descartada; ia-4 (pregunta en 1:02) se cruza con la pregunta que ya existe en 1:02.
    const r = await como('productor').post(`/propuestas/${p.id}/aplicar`, { marcadorIds: ['ia-1', 'ia-2', 'ia-3', 'ia-4', 'ia-5', 'ia-6', 'ia-7'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      version: version + 1, regenerando: [], estado: 'borrador',
      agregados: ['p18-vm-1', 'p18-vm-2', 'p18-vm-3', 'p18-vm-4', 'p18-vm-5', 'p18-vm-6'],
      observaciones: ['Se omitió la pregunta de 1:02: queda a menos de 2 s de otro marcador del mismo tipo (1:02).'],
    });
    const despues = videoDe(await documento()).marcadores!;
    expect(despues.map((m) => [m.id, m.tiempoMs, m.tipo])).toEqual([
      ['vm-1', 0, 'capitulo'], ['p18-vm-1', 30000, 'capitulo'], ['p18-vm-2', 52000, 'pregunta'], ['vm-2', 62000, 'pregunta'], ['p18-vm-3', 62000, 'capitulo'],
      ['vm-3', 95000, 'punto'], ['p18-vm-4', 95000, 'capitulo'], ['p18-vm-5', 118000, 'pregunta'], ['p18-vm-6', 125000, 'capitulo'], ['vm-4', 130000, 'pregunta'],
    ]);
    expect(despues.find((m) => m.id === 'p18-vm-2')!.pregunta!.id).toBe('p18-vm-2-q');
    expect(despues.find((m) => m.id === 'p18-vm-2')).toMatchObject({ origen: { tipo: 'ia', revisado: false } });
    expect((await prisma.cursoVersion.findFirstOrThrow({ where: { cursoId, version: r.body.version } })).motivo).toBe('propuesta');
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('APLICADA');
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, { marcadorIds: ['ia-8'] })).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA' });

    // «↶ Deshacer» en Video interactivo manda la lista anterior con su motivo.
    const deshacer = await como('productor').patch(`/cursos/${cursoId}/pantallas/p18`, { version: r.body.version, marcadores: { 'p18-video': antes }, motivo: 'deshacer' });
    expect(deshacer.status).toBe(200);
    expect(videoDe(await documento()).marcadores).toEqual(antes);
  });

  it('sin elegidas o con un id que no está, 422; vence (409) si el video cambió desde la propuesta', async () => {
    const p = await propuesta();
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'MARCADORES_REQUERIDOS' });
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, { marcadorIds: ['ia-99'] })).body).toMatchObject({ codigo: 'PROPUESTA_NO_APLICA', mensaje: 'La propuesta no se puede aplicar: la propuesta no tiene «ia-99»' });
    const { version } = await curso();
    const sinPunto = videoDe(await documento()).marcadores!.filter((m) => m.tipo !== 'punto');
    expect((await como('productor').patch(`/cursos/${cursoId}/pantallas/p18`, { version, marcadores: { 'p18-video': sinPunto } })).status).toBe(200);
    const r = await como('productor').post(`/propuestas/${p.id}/aplicar`, { marcadorIds: ['ia-1'] });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'PROPUESTA_VENCIDA' });
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('VENCIDA');
    expect(videoDe(await documento()).marcadores).toEqual(sinPunto);
  });

  it('el revisor del cliente no pide ni aplica (403)', async () => {
    const p = await propuesta();
    expect((await como('revisor').post(`/cursos/${cursoId}/propuestas`, { tipo: 'pausas-video', pantallaId: 'p18' })).status).toBe(403);
    expect((await como('revisor').post(`/propuestas/${p.id}/aplicar`, { marcadorIds: ['ia-1'] })).status).toBe(403);
    expect(encolados).toHaveLength(0);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('PENDIENTE');
  });
});
