// HU-0501 y HU-0502 · Revisión: observaciones, aprobar una o por lote y editar (CP-048, CP-049) contra PostgreSQL real.
// Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
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
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const loto = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
type Doc = { modulos: { capsulas: { pantallas: { id: string; estado: string; titulo: { es: string }; bloques: { id: string; contenido?: { es: string }; origen?: { tipo: string; revisado: boolean; paginas?: number[] } }[]; narracion?: { texto: { es: string }; porIdioma: { es: { hashTexto: string } } } }[] }[] }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

describe.skipIf(!hayBase && !process.env.CI)('revisión del curso (HU-0501, HU-0502)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let cursoId: string;
  let proyectoId: string;
  const cookies: Record<string, string> = {};
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const documento = async () => (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as unknown as Doc;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org revisión', slug: `revision-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const otro = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Banco Sur', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('grafico', Rol.DISENADOR_GRAFICO);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: otro.id });
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto } })).id;
    // 3 pantallas con observaciones de personas (no se recalculan); la de p20 bloquea la entrega.
    await prisma.observacion.createMany({
      data: [
        { cursoId, pantallaId: 'p05', tipo: 'CALIDAD', severidad: 'aviso', mensaje: 'Revisar el ejemplo', origen: 'usuario' },
        { cursoId, pantallaId: 'p12', tipo: 'IDIOMA', severidad: 'info', mensaje: 'Confirmar el término', origen: 'usuario' },
        { cursoId, pantallaId: 'p20', tipo: 'ACCESIBILIDAD', severidad: 'bloquea-entrega', mensaje: 'Falta el texto alternativo de la escena', origen: 'usuario' },
      ],
    });
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
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: orgId } });
  });

  it('lista las observaciones del curso y por pantalla; el revisor de otro cliente no las ve', async () => {
    const r = await como('grafico').get(`/cursos/${cursoId}/observaciones`);
    expect(r.status).toBe(200);
    expect(r.body.map((o: { pantallaId: string }) => o.pantallaId)).toEqual(['p05', 'p12', 'p20']);
    expect((await como('grafico').get(`/cursos/${cursoId}/observaciones?pantallaId=p20`)).body).toMatchObject([{ severidad: 'bloquea-entrega', resuelta: false }]);
    expect((await como('revisor').get(`/cursos/${cursoId}/observaciones`)).status).toBe(404);
  });

  it('RN-05-1: no aprueba una pantalla con una observación que bloquea la entrega; el productor no aprueba', async () => {
    const r = await como('instruccional').post(`/cursos/${cursoId}/pantallas/p20/aprobar`);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('OBSERVACIONES_BLOQUEAN');
    expect((await como('productor').post(`/cursos/${cursoId}/pantallas/p01/aprobar`)).status).toBe(403);
  });

  it('CP-048 · «aprobar todas las que no tienen observaciones» deja 27 aprobadas y 3 pendientes', async () => {
    const r = await como('instruccional').post(`/cursos/${cursoId}/pantallas/aprobar`, { soloSinObservaciones: true });
    expect(r.status).toBe(200);
    expect(r.body.aprobadas).toHaveLength(27);
    expect(r.body.pendientes).toEqual(['p05', 'p12', 'p20']);
    expect(r.body.version).toBe(2);
    const doc = await documento();
    expect(pantallas(doc).filter((p) => p.estado === 'aprobado')).toHaveLength(27);
    // Al aprobar, el origen queda revisado por una persona.
    expect(pantallas(doc).find((p) => p.id === 'p04')!.bloques[0]!.origen).toMatchObject({ tipo: 'documento', paginas: [12], revisado: true });
    expect((await como('grafico').get(`/proyectos/${proyectoId}`)).body.avance).toEqual({ aprobadas: 27, total: 30 });
    expect(await prisma.cursoVersion.findFirst({ where: { cursoId, version: 2 } })).toMatchObject({ motivo: 'aprobación' });
    // Una con solo un aviso sí se puede aprobar sola.
    const una = await como('instruccional').post(`/cursos/${cursoId}/pantallas/p05/aprobar`);
    expect(una.body).toMatchObject({ estado: 'aprobado', aprobadas: ['p05'], version: 3 });
  });

  it('CP-049 · editar el texto de una pantalla aprobada la devuelve a borrador; con una versión vieja, 409', async () => {
    const r = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p04`, { version: 3, titulo: { es: 'Energía peligrosa en planta' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 4, estado: 'borrador', regenerando: [] });
    const p04 = pantallas(await documento()).find((p) => p.id === 'p04')!;
    expect(p04.estado).toBe('borrador');
    expect(p04.titulo).toEqual({ es: 'Energía peligrosa en planta' });
    expect(p04.bloques[0]).toMatchObject({ id: 'p04-titulo', contenido: { es: 'Energía peligrosa en planta' }, origen: { tipo: 'manual', revisado: true, paginas: [12] } });
    const vieja = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p04`, { version: 3, titulo: { es: 'Otro' } });
    expect(vieja.status).toBe(409);
    expect(vieja.body.codigo).toBe('VERSION_CAMBIO');
  });

  it('cambiar la narración cambia su hash; un texto largo crea una observación por reglas y el lote ya no la aprueba', async () => {
    const antes = pantallas(await documento()).find((p) => p.id === 'p06')!;
    const largo = Array.from({ length: 40 }, () => 'palabra').join(' ');
    const r = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p06`, { version: 4, narracion: { es: 'Hay seis tipos de energía.' }, textos: { 'p06-item-1': { es: largo } } });
    expect(r.status).toBe(200);
    const p06 = pantallas(await documento()).find((p) => p.id === 'p06')!;
    expect(p06.narracion!.texto.es).toBe('Hay seis tipos de energía.');
    expect(p06.narracion!.porIdioma.es.hashTexto).not.toBe(antes.narracion!.porIdioma.es.hashTexto);
    const obs = (await como('grafico').get(`/cursos/${cursoId}/observaciones?pantallaId=p06`)).body;
    expect(obs).toMatchObject([{ origen: 'regla', tipo: 'CALIDAD', severidad: 'aviso' }]);
    const lote = await como('instruccional').post(`/cursos/${cursoId}/pantallas/aprobar`, { soloSinObservaciones: true });
    expect(lote.body.aprobadas).toEqual(['p04']);
    expect(lote.body.pendientes).toEqual(['p06', 'p12', 'p20']);
    // Datos no válidos: un bloque que no existe o un texto vacío.
    expect((await como('grafico').patch(`/cursos/${cursoId}/pantallas/p06`, { version: 6, textos: { 'p06-nada': { es: 'x' } } })).status).toBe(422);
    expect((await como('grafico').patch(`/cursos/${cursoId}/pantallas/p06`, { version: 6, titulo: { es: '  ' } })).status).toBe(422);
    expect((await como('grafico').patch(`/cursos/${cursoId}/pantallas/p99`, { version: 6, titulo: { es: 'x' } })).status).toBe(404);
  });

  it('HU-0701 · lista las narraciones en el orden de las pantallas con su estado, duración y audio firmado', async () => {
    const audio = await prisma.recurso.create({
      data: { organizacionId: orgId, proyectoId, tipo: 'AUDIO', origen: 'GENERADO', claveS3: `org/${orgId}/voz-${sufijo}`, mime: 'audio/mpeg', bytes: 10, duracionMs: 4485, hash: 'x', nombre: 'p01-es.mp3', proveedor: 'google', modelo: 'es-US-Neural2-A' },
    });
    await prisma.narracion.createMany({
      data: [
        { cursoId, pantallaId: 'p02', idioma: 'es', textoHash: 'b', origen: 'tts', voz: 'es-US-Neural2-A', estado: 'DESACTUALIZADA' },
        { cursoId, pantallaId: 'p01', idioma: 'es', textoHash: 'a', origen: 'tts', voz: 'es-US-Neural2-A', audioRecursoId: audio.id, estado: 'ACTUALIZADA' },
      ],
    });
    const r = await como('productor').get(`/cursos/${cursoId}/narraciones?idioma=es`);
    expect(r.status).toBe(200);
    expect(r.body.map((n: { pantallaId: string }) => n.pantallaId)).toEqual(['p01', 'p02']);
    expect(r.body[0]).toMatchObject({ idioma: 'es', estado: 'ACTUALIZADA', origen: 'tts', voz: 'es-US-Neural2-A', duracionS: 4.5, texto: 'Hola, te doy la bienvenida a esta cápsula sobre bloqueo y etiquetado.' });
    expect(r.body[0].audioUrl).toMatch(/X-Amz-Signature=/);
    expect(r.body[1]).not.toHaveProperty('audioUrl');
    expect((await como('grafico').get(`/cursos/${cursoId}/narraciones?idioma=fr`)).status).toBe(422);
    expect((await como('revisor').get(`/cursos/${cursoId}/narraciones`)).status).toBe(404);
    await prisma.recurso.delete({ where: { id: audio.id } });
  });
});
