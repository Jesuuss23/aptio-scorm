// HU-1202 · Exportar SCORM 1.2 (M12) contra PostgreSQL, Redis y S3 de LocalStack reales: 202 con el trabajo en la cola
// `export`, 422 si el curso no cumple el esquema o el formato no está disponible, 403 al revisor del cliente, historial
// y descarga firmada solo cuando terminó. Se salta sin DATABASE_URL o sin S3, salvo en CI.
// HU-1201 · CP-090 · Validar antes de exportar: un paquete de 300 MB advierte con alternativas y se exporta igual (202).
// HU-1203 · CP-093 · HTML se exporta (202) y se valida sin límite de subida; SCORM 2004 sigue en 422.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { crearCola, TAREA_EXPORTAR } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const hayS3 = await fetch(`${process.env.AWS_ENDPOINT}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
process.env.COLAS_PREFIJO = `prueba-exportar-${sufijo}`;
const loto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('exportar SCORM 1.2 (HU-1202)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let clienteId: string;
  let cursoId: string;
  let proyectoId: string;
  const cookies: Record<string, string> = {};
  const almacen = new Almacen(configDesdeEnv());
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });

  beforeAll(async () => {
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org exportar', slug: `exportar-${sufijo}` } })).id;
    clienteId = (await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } })).id;
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 7 } })).id;
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'grafico', 'revisor']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    const cola = crearCola('export');
    await cola.obliterate({ force: true });
    await cola.close();
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.recurso.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('CP-091 · exportar responde 202 con la exportación en cola, ligada a la versión, y encola EXPORTAR en la cola export', async () => {
    const r = await como('instruccional').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12', perfilLms: 'moodle' });
    expect({ status: r.status, body: r.body }).toMatchObject({ status: 202 });
    expect(r.body).toMatchObject({ cursoId, formato: 'SCORM12', perfilLms: 'moodle', modoIdioma: 'unico', versionCurso: 7, estado: 'EN_COLA', bytes: null, descargaUrl: null });
    const trabajo = await crearCola('export').getJob(r.body.id);
    expect(trabajo?.data).toEqual({ trabajoId: r.body.id, organizacionId: orgId, tarea: TAREA_EXPORTAR });
    expect(trabajo?.name).toBe(TAREA_EXPORTAR);

    // Sin perfil, Genérico; producción también exporta, y cada exportación es nueva (RN-12-4).
    const otra = await como('productor').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12' });
    expect(otra.status).toBe(202);
    expect(otra.body).toMatchObject({ perfilLms: 'generico', versionCurso: 7 });
    expect(otra.body.id).not.toBe(r.body.id);
  });

  it('HU-1203 · CP-093 · exportar HTML responde 202 en la cola export, con perfil generico y sin modo diagnóstico', async () => {
    const r = await como('productor').post(`/cursos/${cursoId}/exportaciones`, { formato: 'HTML', perfilLms: 'moodle', incluirDiagnostico: true });
    expect({ status: r.status, body: r.body }).toMatchObject({ status: 202, body: { cursoId, formato: 'HTML', perfilLms: 'generico', versionCurso: 7, estado: 'EN_COLA' } });
    expect((await crearCola('export').getJob(r.body.id))?.data).toEqual({ trabajoId: r.body.id, organizacionId: orgId, tarea: TAREA_EXPORTAR });
    expect(await prisma.exportacion.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ formato: 'HTML', perfilLms: 'generico', incluirDiagnostico: false });
    expect((await como('grafico').post(`/cursos/${cursoId}/exportaciones`, { formato: 'HTML' })).status).toBe(403);
  });

  it('422 si el formato no está disponible, si se pide otro modo de idioma o si el curso no cumple el esquema', async () => {
    const scorm2004 = await como('instruccional').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM2004' });
    expect(scorm2004.status).toBe(422);
    expect(scorm2004.body.codigo).toBe('FORMATO_NO_DISPONIBLE');
    expect((await como('instruccional').post(`/cursos/${cursoId}/exportaciones`, { formato: 'ZIP' })).status).toBe(422);
    const bilingue = await como('instruccional').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12', modoIdioma: 'mismo-paquete' });
    expect(bilingue.body.codigo).toBe('IDIOMA_NO_DISPONIBLE');

    const roto = loto();
    delete roto.seguimiento;
    const malo = await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Roto', creadoPorId: (await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } })).id } })).id, versionEsquema: '0.2.0', documento: roto } });
    const antes = await prisma.exportacion.count({ where: { cursoId: malo.id } });
    const r = await como('instruccional').post(`/cursos/${malo.id}/exportaciones`, { formato: 'SCORM12' });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('ESQUEMA_NO_VALIDO');
    expect(r.body.detalles.length).toBeGreaterThan(0);
    expect(await prisma.exportacion.count({ where: { cursoId: malo.id } })).toBe(antes);
  });

  it('el revisor del cliente y el diseñador gráfico no exportan (403); el revisor tampoco ve el historial', async () => {
    expect((await como('revisor').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12' })).status).toBe(403);
    expect((await como('grafico').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12' })).status).toBe(403);
    expect((await como('revisor').get(`/cursos/${cursoId}/exportaciones`)).status).toBe(403);
    expect((await como('grafico').get(`/cursos/${cursoId}/exportaciones`)).status).toBe(200);
  });

  it('el historial va de la más nueva a la más antigua y la descarga firmada aparece solo al terminar', async () => {
    const pedida = await como('instruccional').post(`/cursos/${cursoId}/exportaciones`, { formato: 'SCORM12' });
    const enCola = await como('instruccional').get(`/exportaciones/${pedida.body.id}`);
    expect(enCola.body).toMatchObject({ estado: 'EN_COLA', descargaUrl: null, nombreArchivo: null });

    // Lo que deja el worker: el ZIP en S3 como recurso PAQUETE y la exportación COMPLETADO.
    const recursoId = randomUUID();
    const claveS3 = `org/${orgId}/${clienteId}/${recursoId}`;
    const zip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
    await almacen.subir(claveS3, zip, 'application/zip');
    await prisma.recurso.create({ data: { id: recursoId, organizacionId: orgId, clienteId, proyectoId, tipo: 'PAQUETE', origen: 'GENERADO', claveS3, mime: 'application/zip', bytes: BigInt(zip.byteLength), hash: 'x', nombre: 'bloqueo-y-etiquetado-scorm12-v7.zip' } });
    await prisma.exportacion.update({ where: { id: pedida.body.id }, data: { estado: 'COMPLETADO', recursoId, bytes: BigInt(zip.byteLength), informe: { errores: [], advertencias: ['Falta el archivo de «p01-es.mp3»: el paquete muestra su texto alternativo.'] } } });

    const lista = await como('grafico').get(`/cursos/${cursoId}/exportaciones`);
    expect(lista.status).toBe(200);
    expect(lista.body[0]).toMatchObject({ id: pedida.body.id, estado: 'COMPLETADO', bytes: 22, nombreArchivo: 'bloqueo-y-etiquetado-scorm12-v7.zip', descargaUrl: null });
    expect(lista.body.map((e: { creadoEn: string }) => e.creadoEn)).toEqual([...lista.body.map((e: { creadoEn: string }) => e.creadoEn)].sort().reverse());

    const lista2 = await como('instruccional').get(`/exportaciones/${pedida.body.id}`);
    expect(lista2.body).toMatchObject({ estado: 'COMPLETADO', informe: { advertencias: [expect.stringContaining('p01-es.mp3')] } });
    expect(lista2.body.descargaUrl).toMatch(/X-Amz-Expires=900/);
    const descarga = await fetch(lista2.body.descargaUrl);
    expect(descarga.status).toBe(200);
    expect(new Uint8Array(await descarga.arrayBuffer())).toEqual(zip);
  });

  it('CP-090 · con recursos de 300 MB, validar responde 200 con la advertencia y sus alternativas, y exportar sigue en 202', async () => {
    const videoId = randomUUID();
    const doc = JSON.parse(JSON.stringify(loto()).replaceAll('"vid-procedimiento"', `"${videoId}"`));
    const di = await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } });
    const pesado = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Pesado', creadoPorId: di.id } });
    const curso = await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: pesado.id, versionEsquema: '0.2.0', documento: doc, version: 2 } });
    await prisma.recurso.create({ data: { id: videoId, organizacionId: orgId, clienteId, proyectoId: pesado.id, tipo: 'VIDEO', origen: 'CLIENTE', claveS3: `org/${orgId}/${clienteId}/${videoId}`, mime: 'video/mp4', bytes: BigInt(300 * 1024 * 1024), hash: 'x', nombre: 'procedimiento.mp4' } });

    const v = await como('instruccional').post(`/cursos/${curso.id}/validar`, { formato: 'SCORM12', perfilLms: 'moodle' });
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ errores: [], limiteMb: 100, origenLimite: 'referencia', superaLimite: true, pantallasTotal: 30, pantallasSinAprobar: 30 });
    expect(v.body.pesoEstimadoMb).toBeGreaterThanOrEqual(300);
    expect(v.body.alternativas).toHaveLength(5);
    expect(v.body.alternativas[0]).toContain('amplíe el límite de subida');
    expect(v.body.advertencias[0]).toMatch(/^El paquete pesaría unos 300(\.\d)? MB y el límite de subida del destino es 100 MB/);
    expect(v.body.recursosPesados).toEqual([{ id: videoId, nombre: 'procedimiento.mp4', bytes: 300 * 1024 * 1024 }]);
    // HU-1406 · Un video del cliente no es de IA: el paquete no lleva créditos.
    expect(v.body.creditos).toBeNull();
    expect(v.body.suspendDataCaracteres).toBeLessThanOrEqual(4096);
    // Los recursos de ejemplo del caso (ids que no son filas de Recurso) se informan como faltantes, sin error.
    expect(v.body.recursosFaltantes.length).toBeGreaterThan(0);

    // RN-12-2: nunca se bloquea por tamaño.
    expect((await como('productor').post(`/cursos/${curso.id}/exportaciones`, { formato: 'SCORM12' })).status).toBe(202);

    // Con la ficha de compatibilidad del cliente, manda su límite.
    await prisma.fichaCompatibilidad.create({ data: { clienteId, lmsNombre: 'Moodle 4.5', limiteSubidaMb: 512 } });
    const conFicha = await como('grafico').post(`/cursos/${curso.id}/validar`, { formato: 'SCORM12' });
    expect(conFicha.body).toMatchObject({ limiteMb: 512, origenLimite: 'ficha', superaLimite: false, alternativas: [] });

    // HU-1203 · En HTML no hay LMS: ni límite de subida (aunque haya ficha) ni suspend_data; el peso queda como dato.
    const html = await como('instruccional').post(`/cursos/${curso.id}/validar`, { formato: 'HTML' });
    expect(html.status).toBe(200);
    expect(html.body).toMatchObject({ formato: 'HTML', errores: [], limiteMb: null, origenLimite: null, superaLimite: false, alternativas: [], suspendDataCaracteres: null, pantallasSinAprobar: 30 });
    expect(html.body.pesoEstimadoMb).toBeGreaterThanOrEqual(300);
    expect(html.body.advertencias.some((a: string) => a.includes('límite de subida'))).toBe(false);
    await prisma.fichaCompatibilidad.deleteMany({ where: { clienteId } });
  });

  it('HU-1406 · CP-107 · validar trae la vista previa de los créditos: voz de Google e ilustración de Recraft, sin lo de `aptio`', async () => {
    const [voz, img, vtt] = [randomUUID(), randomUUID(), randomUUID()];
    const doc = JSON.parse(JSON.stringify(loto()).replaceAll('"aud-p02-es"', `"${voz}"`).replaceAll('"img-p20-faja"', `"${img}"`).replaceAll('"vtt-p03-es"', `"${vtt}"`));
    const di = await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } });
    const p = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Con créditos', creadoPorId: di.id } });
    const curso = await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: p.id, versionEsquema: '0.2.0', documento: doc, version: 1 } });
    const fila = (id: string, tipo: 'AUDIO' | 'IMAGEN' | 'SUBTITULO', proveedor: string, modelo: string, licencia: string) => ({
      id, organizacionId: orgId, clienteId, proyectoId: p.id, tipo, origen: 'GENERADO' as const, claveS3: `org/${orgId}/${id}`, mime: 'application/octet-stream', bytes: BigInt(10), hash: 'x', nombre: id, proveedor, modelo, licencia,
    });
    await prisma.recurso.createMany({ data: [
      fila(voz, 'AUDIO', 'google', 'es-US-Neural2-A', 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)'),
      fila(img, 'IMAGEN', 'recraft', 'recraftv3', 'Recraft · uso comercial (plan de pago)'),
      fila(vtt, 'SUBTITULO', 'aptio', 'subtitulos-por-letras v1', 'Generado por Aptio SCORM desde el guion'),
    ] });
    const v = await como('instruccional').post(`/cursos/${curso.id}/validar`, { formato: 'HTML' });
    expect(v.status).toBe(200);
    expect(v.body.creditos).toEqual({
      aviso: 'Voz e ilustraciones generadas con IA y revisadas por Org exportar',
      filas: [
        { que: 'Voz', proveedor: 'Google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' },
        { que: 'Ilustraciones', proveedor: 'Recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' },
      ],
    });
  });

  it('validar: errores de esquema en 200, formato no disponible 422 y el revisor del cliente 403', async () => {
    const roto = loto();
    delete roto.seguimiento;
    const di = await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } });
    const p = await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId, nombre: 'Roto validar', creadoPorId: di.id } });
    const malo = await prisma.curso.create({ data: { organizacionId: orgId, proyectoId: p.id, versionEsquema: '0.2.0', documento: roto } });
    const r = await como('instruccional').post(`/cursos/${malo.id}/validar`, { formato: 'SCORM12' });
    expect(r.status).toBe(200);
    expect(r.body.errores.length).toBeGreaterThan(0);
    expect((await como('instruccional').post(`/cursos/${cursoId}/validar`, { formato: 'SCORM2004' })).body.codigo).toBe('FORMATO_NO_DISPONIBLE');
    expect((await como('revisor').post(`/cursos/${cursoId}/validar`, { formato: 'SCORM12' })).status).toBe(403);
    expect((await como('instruccional').post(`/cursos/${randomUUID()}/validar`, { formato: 'SCORM12' })).status).toBe(404);
  });

  it('una exportación de otra organización no se ve (404)', async () => {
    const ajena = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `otra-exp-${sufijo}` } });
    try {
      const u = await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } });
      const e = await prisma.exportacion.create({ data: { organizacionId: ajena.id, cursoId, versionCurso: 1, formato: 'SCORM12', modoIdioma: 'unico', creadoPorId: u.id } });
      expect((await como('instruccional').get(`/exportaciones/${e.id}`)).status).toBe(404);
      await prisma.exportacion.delete({ where: { id: e.id } });
    } finally {
      await prisma.organizacion.delete({ where: { id: ajena.id } });
    }
  });
});
