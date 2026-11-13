// HU-0704 · Audio del cliente en la API (CP-074, REQ-024, RN-07-4): usar una grabación exige la autorización del cliente
// (422 AUTORIZACION_REQUERIDA) y un audio del proyecto listo y transcrito (422 AUDIO_NO_VALIDO); guarda quién y cuándo,
// cambia el texto de la narración por la transcripción en una versión y encola el trabajo en la cola voz. Limpiar encola
// la limpieza (cola media). Re-locutar pone la transcripción con la voz del kit y Deshacer la revierte. Corregir el texto
// de una grabación no la manda a regenerar. El revisor del cliente recibe 403. PostgreSQL real; colas simuladas.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import { hashGrabacion, TAREA_GRABACION, TAREA_LIMPIAR } from '@aptio/schema/grabacion';
import { TAREA_CASCADA } from '@aptio/schema/generacion';
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
type Pista = { estado: string; voz: { proveedor: string; voz: string }; hashTexto: string; recursoAudioId?: string; grabacion?: Record<string, string> };
type Doc = { recursos: { id: string }[]; modulos: { capsulas: { pantallas: { id: string; estado: string; narracion?: { texto: { es: string }; porIdioma: { es: Pista } } }[] }[] }[] };
const pantalla = (d: Doc, id: string) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === id)!;
const SEGMENTOS = [{ desde: 0.2, hasta: 1.4, texto: 'Antes de intervenir un equipo,' }, { desde: 1.4, hasta: 2.8, texto: 'bloquea todas sus fuentes de energía.' }];
const TEXTO = 'Antes de intervenir un equipo, bloquea todas sus fuentes de energía.';

describe.skipIf(!hayBase && !process.env.CI)('audio del cliente (HU-0704)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let proyectoId: string;
  let cursoId: string;
  const ids = { audio: randomUUID(), pendiente: randomUUID(), otroProyecto: randomUUID(), pdf: randomUUID(), limpio: randomUUID() };
  const mat = { audio: '', pendiente: '', otroProyecto: '', pdf: '' };
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: { tarea: string; pantallaId?: string; trabajoId: string; grabacion?: Record<string, string> } }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  const documento = async () => (await curso()).documento as unknown as Doc;
  const usar = (pantallaId: string, datos: object) => como('di').post(`/cursos/${cursoId}/narraciones/${pantallaId}/grabacion`, datos);

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org grabación', slug: `grabacion-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('di', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    const otro = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Otro', creadoPorId: di.id } });
    const base = { organizacionId: orgId, clienteId: cliente.id, proyectoId, origen: 'CLIENTE' as const, bytes: 2048n, hash: 'x' };
    const clave = (x: string) => `org/${orgId}/${cliente.id}/${x}`;
    await prisma.recurso.createMany({ data: [
      { ...base, id: ids.audio, tipo: 'AUDIO', claveS3: clave(ids.audio), mime: 'audio/wav', nombre: 'Grabacion_gerente.wav', metadatos: { duracionS: 134 } },
      { ...base, id: ids.pendiente, tipo: 'AUDIO', claveS3: clave(ids.pendiente), mime: 'audio/wav', nombre: 'otra.wav' },
      { ...base, id: ids.otroProyecto, proyectoId: otro.id, tipo: 'AUDIO', claveS3: clave(ids.otroProyecto), mime: 'audio/wav', nombre: 'ajena.wav' },
      { ...base, id: ids.pdf, tipo: 'DOCUMENTO', claveS3: clave(ids.pdf), mime: 'application/pdf', nombre: 'manual.pdf' },
    ] });
    mat.audio = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'AUDIO', recursoId: ids.audio, estado: 'listo', transcripcion: SEGMENTOS } })).id;
    mat.pendiente = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'AUDIO', recursoId: ids.pendiente, estado: 'procesando' } })).id;
    mat.otroProyecto = (await prisma.materialFuente.create({ data: { proyectoId: otro.id, tipo: 'AUDIO', recursoId: ids.otroProyecto, estado: 'listo', transcripcion: SEGMENTOS } })).id;
    mat.pdf = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'PDF', recursoId: ids.pdf, estado: 'listo', paginas: [] } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: leer('curso-esperado-es.json'), version: 3 } })).id;
    await prisma.narracion.createMany({ data: ['p05', 'p06'].map((pantallaId) => ({ cursoId, pantallaId, idioma: 'es', textoHash: 'x', origen: 'tts', voz: 'es-US-Neural2-A', estado: 'ACTUALIZADA' as const })) });
    const colas = {
      encolar: async (cola: string, datos: never) => void encolados.push({ cola, datos }),
      encolarConEspera: async (cola: string, datos: never) => (encolados.push({ cola, datos }), 'x'),
    };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['di', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });
  beforeEach(() => void (encolados.length = 0));

  afterAll(async () => {
    await app?.close();
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.auditoria.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('lista los audios del cliente transcritos del proyecto, con su URL firmada', async () => {
    const r = await como('di').get(`/cursos/${cursoId}/audios-cliente`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([expect.objectContaining({ materialId: mat.audio, recursoId: ids.audio, nombre: 'Grabacion_gerente.wav', duracionS: 134, texto: TEXTO, limpieza: null })]);
    expect(r.body[0].url).toMatch(/X-Amz-Signature=/);
  });

  it('RN-07-4 · sin la autorización del cliente, 422 AUTORIZACION_REQUERIDA y nada cambia', async () => {
    const antes = await curso();
    for (const datos of [{ materialId: mat.audio }, { materialId: mat.audio, autorizado: false }]) {
      const r = await usar('p05', datos);
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ codigo: 'AUTORIZACION_REQUERIDA' });
    }
    expect((await curso()).version).toBe(antes.version);
    expect(encolados).toEqual([]);
  });

  it('422 AUDIO_NO_VALIDO con un audio de otro proyecto, sin transcribir o que no es audio', async () => {
    for (const materialId of [mat.otroProyecto, mat.pendiente, mat.pdf, randomUUID()]) {
      const r = await usar('p05', { materialId, autorizado: true });
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ codigo: 'AUDIO_NO_VALIDO' });
    }
    const limpio = await usar('p05', { materialId: mat.audio, autorizado: true, usarLimpio: true });
    expect(limpio.body).toMatchObject({ codigo: 'AUDIO_NO_VALIDO', mensaje: expect.stringMatching(/limpia/) });
    expect(encolados).toEqual([]);
  });

  it('CP-074 · usar la grabación: la transcripción es la narración en una versión, con quién autorizó y cuándo, y se encola en la cola voz', async () => {
    const antes = await curso();
    const r = await usar('p05', { materialId: mat.audio, autorizado: true, version: antes.version });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ version: antes.version + 1, estado: 'GENERANDO', regenerando: ['voz-es', 'boca', 'subtitulos-es'] });
    const doc = await documento();
    const p = pantalla(doc, 'p05');
    expect(p.estado).toBe('borrador');
    expect(p.narracion!.texto.es).toBe(TEXTO);
    expect(p.narracion!.porIdioma.es).toEqual({
      estado: 'pendiente', voz: { proveedor: 'cliente', voz: 'grabacion' }, hashTexto: hashGrabacion(TEXTO, ids.audio),
      grabacion: { materialId: mat.audio, recursoOrigenId: ids.audio, version: 'original', autorizadoPor: 'di', autorizadoEn: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
    });
    // El audio TTS anterior sale de los recursos del curso.
    expect(doc.recursos.some((x) => x.id === 'aud-p05-es')).toBe(false);
    expect(await prisma.cursoVersion.count({ where: { cursoId, version: antes.version + 1, motivo: 'grabación del cliente' } })).toBe(1);
    expect(await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05' } })).toMatchObject({ origen: 'grabacion', estado: 'GENERANDO' });
    expect(encolados).toEqual([{ cola: 'voz', datos: expect.objectContaining({ trabajoId: cursoId, tarea: TAREA_GRABACION, pantallaId: 'p05', grabacion: expect.objectContaining({ materialId: mat.audio, recursoId: ids.audio, version: 'original', autorizadoPor: 'di' }) }) }]);
    expect(await prisma.auditoria.count({ where: { organizacionId: orgId, accion: 'GRABACION_AUTORIZADA', entidadId: cursoId } })).toBe(1);
    // La narración la muestra como grabación con su autorización.
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: 'p05' }, data: { estado: 'ACTUALIZADA' } });
    const n = (await como('di').get(`/cursos/${cursoId}/narraciones`)).body.find((x: { pantallaId: string }) => x.pantallaId === 'p05');
    expect(n).toMatchObject({ origen: 'grabacion', estado: 'ACTUALIZADA', grabacion: { materialId: mat.audio, autorizadoPor: 'di' } });
  });

  it('corregir el texto de una grabación no la manda a regenerar con la voz de la IA', async () => {
    const c = await curso();
    const r = await como('di').patch(`/cursos/${cursoId}/pantallas/p05`, { version: c.version, narracion: { es: `${TEXTO} Siempre.` } });
    expect(r.status).toBe(200);
    expect(r.body.regenerando).toEqual([]);
    expect(encolados).toEqual([]);
    expect((await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05' } })).estado).toBe('ACTUALIZADA');
    expect(pantalla(await documento(), 'p05').narracion!.porIdioma.es.voz.proveedor).toBe('cliente');
  });

  it('REQ-024 · limpiar encola la limpieza en la cola media; con el audio limpio listo, se puede usar', async () => {
    const r = await como('di').post(`/materiales/${mat.audio}/limpiar`);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ estado: 'procesando' });
    expect(encolados).toEqual([{ cola: 'media', datos: expect.objectContaining({ trabajoId: mat.audio, tarea: TAREA_LIMPIAR }) }]);
    expect((await como('di').get(`/cursos/${cursoId}/audios-cliente`)).body[0].limpieza).toEqual({ estado: 'procesando' });
    // Lo que deja el worker: el recurso limpio y el estado en el original.
    const orig = await prisma.recurso.findUniqueOrThrow({ where: { id: ids.audio } });
    await prisma.recurso.create({ data: { id: ids.limpio, organizacionId: orgId, clienteId: orig.clienteId, proyectoId, tipo: 'AUDIO', origen: 'CLIENTE', claveS3: `${orig.claveS3}-limpio`, mime: 'audio/mpeg', bytes: 1024n, hash: 'y', nombre: 'Grabacion_gerente-limpio.mp3', metadatos: { limpiezaDe: ids.audio } } });
    await prisma.recurso.update({ where: { id: ids.audio }, data: { metadatos: { duracionS: 134, limpieza: { estado: 'listo', recursoId: ids.limpio } } } });
    const lista = (await como('di').get(`/cursos/${cursoId}/audios-cliente`)).body[0];
    expect(lista.limpieza).toMatchObject({ estado: 'listo', recursoId: ids.limpio, url: expect.stringMatching(/X-Amz-Signature=/) });
    const u = await usar('p06', { materialId: mat.audio, autorizado: true, usarLimpio: true });
    expect(u.status).toBe(202);
    expect(pantalla(await documento(), 'p06').narracion!.porIdioma.es).toMatchObject({ hashTexto: hashGrabacion(TEXTO, ids.limpio), grabacion: { recursoOrigenId: ids.limpio, version: 'limpio' } });
    expect(encolados.at(-1)!.datos.grabacion).toMatchObject({ recursoId: ids.limpio, version: 'limpio' });
  });

  it('re-locutar con voz IA pone la transcripción con la voz del kit y regenera en cascada; Deshacer devuelve el texto anterior', async () => {
    const c = await curso();
    const textoAntes = pantalla(c.documento as unknown as Doc, 'p07').narracion!.texto.es;
    const r = await como('di').post(`/cursos/${cursoId}/narraciones/p07/relocutar`, { materialId: mat.audio, version: c.version });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ version: c.version + 1, estado: 'DESACTUALIZADA', regenerando: ['voz-es', 'boca', 'subtitulos-es'], textoAnterior: textoAntes });
    let p = pantalla(await documento(), 'p07');
    expect(p.narracion!.texto.es).toBe(TEXTO);
    expect(p.narracion!.porIdioma.es).toMatchObject({ estado: 'desactualizado', voz: { proveedor: 'google', voz: 'es-US-Neural2-A' } });
    expect(encolados).toEqual([{ cola: 'voz', datos: expect.objectContaining({ tarea: TAREA_CASCADA, pantallaId: 'p07' }) }]);
    const d = await como('di').patch(`/cursos/${cursoId}/pantallas/p07`, { version: r.body.version, narracion: { es: r.body.textoAnterior }, motivo: 'deshacer' });
    expect(d.status).toBe(200);
    p = pantalla(await documento(), 'p07');
    expect(p.narracion!.texto.es).toBe(textoAntes);

    // Sobre una grabación, vuelve a la voz del kit y deja de ser grabación.
    const g = await como('di').post(`/cursos/${cursoId}/narraciones/p05/relocutar`, { materialId: mat.audio, version: (await curso()).version });
    expect(g.status).toBe(200);
    const pista = pantalla(await documento(), 'p05').narracion!.porIdioma.es;
    expect(pista.voz).toEqual({ proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 });
    expect(pista.grabacion).toBeUndefined();
    expect(await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05' } })).toMatchObject({ origen: 'tts', estado: 'DESACTUALIZADA' });
  });

  it('el revisor del cliente no usa, limpia ni re-locuta grabaciones (403)', async () => {
    const c = await curso();
    expect((await como('revisor').post(`/cursos/${cursoId}/narraciones/p05/grabacion`, { materialId: mat.audio, autorizado: true, version: c.version })).status).toBe(403);
    expect((await como('revisor').post(`/materiales/${mat.audio}/limpiar`)).status).toBe(403);
    expect((await como('revisor').post(`/cursos/${cursoId}/narraciones/p05/relocutar`, { materialId: mat.audio })).status).toBe(403);
    expect((await como('revisor').get(`/cursos/${cursoId}/audios-cliente`)).status).toBe(403);
  });
});
