// HU-0504 · Propuestas de la IA: pedir, listar, aplicar (CP-052), vencer (CP-053), descartar y deshacer contra
// PostgreSQL real. La cola es un doble; las propuestas se guardan como lo hace el worker, con la salida grabada de p05.
import 'reflect-metadata';
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
const loto = () => leer('curso-esperado-es.json');
const SALIDAS = leer('salidas/X-IA-16-propuestas-p05.json') as { tipo: string; titulo: string; resumen: string; patch?: unknown[]; variantes?: { nombre: string; disposicion: string; patch: unknown[] }[] }[];
type P = { id: string; estado: string; disposicion: string; bloques: { id: string; contenido?: { es: string }; origen?: { tipo: string } }[]; narracion?: { porIdioma: { es: { hashTexto: string } } } };
const pantalla = (d: unknown, id: string) => (d as { modulos: { capsulas: { pantallas: P[] }[] }[] }).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === id)!;

describe.skipIf(!hayBase && !process.env.CI)('propuestas de la IA (HU-0504)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  let cursoId: string;
  const cookies: Record<string, string> = {};
  const encolados: { cola: string; datos: DatosTrabajo }[] = [];
  const como = (quien: string) => ({
    get: (ruta: string) => request(servidor).get(`/api/v1${ruta}`).set('Cookie', cookies[quien]!),
    post: (ruta: string, datos: object = {}) => request(servidor).post(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
    patch: (ruta: string, datos: object) => request(servidor).patch(`/api/v1${ruta}`).set('Cookie', cookies[quien]!).send(datos),
  });
  const curso = () => prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
  /** Lo que guarda el worker al terminar IA-16 sobre el curso tal como está. */
  const propuesta = async (tipo: string) => {
    const s = SALIDAS.find((x) => x.tipo === tipo)!;
    const c = await curso();
    const huella = huellaPantalla(c.documento as unknown as CursoDoc, 'p05');
    const cambios = s.variantes ? { variantes: s.variantes.map(({ nombre, disposicion, patch }) => ({ nombre, disposicion, patch })), huella } : { patch: s.patch, huella };
    return prisma.propuesta.create({ data: { cursoId, pantallaId: 'p05', tipo, titulo: s.titulo, descripcion: s.resumen, cambios: cambios as object, versionBase: c.version } });
  };

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org propuestas', slug: `propuestas-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera Andina', idiomas: ['es'] } });
    const hashClave = await hashearClave(CLAVE);
    const crear = (nombre: string, rol: Rol, extra: object = {}) =>
      prisma.usuario.create({ data: { nombre, email: correo(nombre), rol, organizacionId: orgId, hashClave, emailVerificado: true, ...extra } });
    const di = await crear('instruccional', Rol.DISENADOR_INSTRUCCIONAL);
    await crear('productor', Rol.PRODUCTOR);
    await crear('revisor', Rol.REVISOR_CLIENTE, { clienteId: cliente.id });
    const otraOrg = await prisma.organizacion.create({ data: { nombre: 'Otra', slug: `propuestas-otra-${sufijo}` } });
    await prisma.usuario.create({ data: { nombre: 'ajeno', email: correo('ajeno'), rol: Rol.PRODUCTOR, organizacionId: otraOrg.id, hashClave, emailVerificado: true } });
    const proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'Bloqueo y etiquetado', creadoPorId: di.id } })).id;
    cursoId = (await prisma.curso.create({ data: { organizacionId: orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 12 } })).id;
    await prisma.cursoVersion.create({ data: { cursoId, version: 12, documento: loto(), motivo: 'generación' } });
    const colas = { encolar: async (cola: string, datos: DatosTrabajo) => void encolados.push({ cola, datos }), encolarConEspera: async () => 'x' };
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ColasService).useValue(colas).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    for (const n of ['instruccional', 'productor', 'revisor', 'ajeno']) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correo(n), clave: CLAVE });
      cookies[n] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });
  beforeEach(() => void encolados.splice(0));

  afterAll(async () => {
    await app?.close();
    const orgs = (await prisma.organizacion.findMany({ where: { slug: { endsWith: sufijo } } })).map((o) => o.id);
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${sufijo}@prueba.test` } } });
    await prisma.cliente.deleteMany({ where: { organizacionId: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: orgs } } });
  });

  it('pedir «Más visual» encola IA-16 con el pedido y un TrabajoIA del proyecto', async () => {
    const r = await como('productor').post(`/cursos/${cursoId}/propuestas`, { tipo: 'mas-visual', pantallaId: 'p05' });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ estado: 'EN_COLA', eventos: '/api/v1/eventos' });
    expect(encolados).toEqual([{ cola: 'ia', datos: { trabajoId: r.body.id, organizacionId: orgId, tarea: 'IA-16', pantallaId: 'p05', propuesta: { cursoId, tipo: 'mas-visual' } } }]);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ estado: 'EN_COLA', tarea: 'IA-16' });
    expect((await como('productor').post(`/cursos/${cursoId}/propuestas`, { tipo: 'libre', pantallaId: 'p05', pedido: '  con un ejemplo  ' })).status).toBe(202);
    expect(encolados[1]!.datos.propuesta).toEqual({ cursoId, tipo: 'libre', texto: 'con un ejemplo' });
  });

  it('valida el pedido: otra ilustración aún no, libre sin texto, sin pantalla o inexistente; el revisor y otra organización no', async () => {
    const ruta = `/cursos/${cursoId}/propuestas`;
    expect((await como('productor').post(ruta, { tipo: 'otra-ilustracion', pantallaId: 'p05' })).body).toMatchObject({ codigo: 'TIPO_NO_DISPONIBLE', mensaje: 'Otra ilustración llega con las ilustraciones' });
    expect((await como('productor').post(ruta, { tipo: 'libre', pantallaId: 'p05', pedido: '  ' })).body).toMatchObject({ codigo: 'PEDIDO_VACIO' });
    expect((await como('productor').post(ruta, { tipo: 'mas-visual' })).body).toMatchObject({ codigo: 'PANTALLA_REQUERIDA' });
    expect((await como('productor').post(ruta, { tipo: 'mas-visual', pantallaId: 'p99' })).status).toBe(404);
    expect((await como('productor').post(ruta, { tipo: 'otra-cosa', pantallaId: 'p05' })).status).toBe(422);
    expect((await como('revisor').post(ruta, { tipo: 'mas-visual', pantallaId: 'p05' })).status).toBe(403);
    expect((await como('revisor').get(ruta)).status).toBe(403);
    expect((await como('ajeno').post(ruta, { tipo: 'mas-visual', pantallaId: 'p05' })).status).toBe(404);
    expect(encolados).toHaveLength(0);
  });

  it('CP-052 · aplicar «Más visual» cambia la pantalla, crea una versión y Deshacer la revierte', async () => {
    const p = await propuesta('mas-visual');
    const lista = await como('productor').get(`/cursos/${cursoId}/propuestas?pantallaId=p05&estado=PENDIENTE`);
    expect(lista.body).toMatchObject([{ id: p.id, tipo: 'mas-visual', titulo: 'Más visual', versionBase: 12, estado: 'PENDIENTE', costoUsd: 0 }]);
    expect(lista.body[0].cambios).toHaveLength(4);
    const antes = await curso();

    const r = await como('productor').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: antes.version + 1, estado: 'borrador', regenerando: [] });
    const despues = pantalla((await curso()).documento, 'p05');
    expect(despues).toMatchObject({ disposicion: 'dato', estado: 'borrador' });
    expect(despues.bloques[1]).toMatchObject({ id: 'p05-dato-grande', origen: { tipo: 'ia' } });
    expect(await prisma.cursoVersion.findFirst({ where: { cursoId, version: r.body.version } })).toMatchObject({ motivo: 'propuesta' });
    expect(await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ estado: 'APLICADA', resueltoEn: expect.any(Date) });
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA' });

    // Deshacer: vuelve el documento anterior en una versión nueva, con la narración tal como está ahora.
    const deshacer = await como('productor').post(`/cursos/${cursoId}/versiones/${antes.version}/restaurar`);
    expect(deshacer.status).toBe(200);
    expect(deshacer.body).toMatchObject({ id: cursoId, version: antes.version + 2 });
    const restaurada = pantalla((await curso()).documento, 'p05');
    expect(restaurada.disposicion).toBe('idea');
    expect(restaurada.bloques).toEqual(pantalla(antes.documento, 'p05').bloques);
    expect(await prisma.cursoVersion.findFirst({ where: { cursoId, version: antes.version + 2 } })).toMatchObject({ motivo: 'restauración' });
    expect((await como('productor').post(`/cursos/${cursoId}/versiones/${antes.version + 2}/restaurar`)).body).toMatchObject({ codigo: 'VERSION_NO_ANTERIOR' });
    expect((await como('productor').post(`/cursos/${cursoId}/versiones/1/restaurar`)).status).toBe(404);
  });

  it('CP-053 · una propuesta de la versión 12 con la pantalla cambiada en la 13 responde «Recalcular propuesta» y queda vencida', async () => {
    const p = await propuesta('menos-texto');
    const otra = await propuesta('libre');
    // Un cambio en otra pantalla no la vence (SUP-39).
    let version = (await curso()).version;
    version = (await como('productor').patch(`/cursos/${cursoId}/pantallas/p06`, { version, titulo: { es: 'Los seis tipos de energía' } })).body.version;
    expect((await como('productor').get(`/cursos/${cursoId}/propuestas?estado=PENDIENTE`)).body.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([p.id, otra.id]));
    await como('productor').patch(`/cursos/${cursoId}/pantallas/p05`, { version, titulo: { es: 'La energía peligrosa' } });

    const r = await como('productor').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'PROPUESTA_VENCIDA', mensaje: 'La pantalla cambió desde que se calculó esta propuesta. Recalcular propuesta.' });
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe('VENCIDA');
    // Al listar, la otra pendiente de p05 también aparece vencida.
    expect((await como('productor').get(`/cursos/${cursoId}/propuestas?pantallaId=p05&estado=VENCIDA`)).body.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([p.id, otra.id]));
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: otra.id } })).estado).toBe('VENCIDA');
  });

  it('«Ver 3 variantes» pide elegir una y aplica la elegida; descartar la cierra; otra organización no la ve', async () => {
    const p = await propuesta('variantes');
    const lista = await como('productor').get(`/cursos/${cursoId}/propuestas?estado=PENDIENTE`);
    expect(lista.body.find((x: { id: string }) => x.id === p.id)).toMatchObject({ cambios: [], vistaPrevia: [{ disposicion: 'lista' }, { disposicion: 'dato' }, { disposicion: 'personaje' }] });
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, {})).body).toMatchObject({ codigo: 'VARIANTE_REQUERIDA' });
    expect((await como('ajeno').post(`/propuestas/${p.id}/aplicar`, { varianteIndice: 2 })).status).toBe(404);
    expect((await como('productor').post(`/propuestas/${p.id}/aplicar`, { varianteIndice: 2 })).status).toBe(200);
    expect(pantalla((await curso()).documento, 'p05').disposicion).toBe('personaje');

    const q = await propuesta('libre');
    expect((await como('revisor').post(`/propuestas/${q.id}/descartar`)).status).toBe(403);
    expect((await como('productor').post(`/propuestas/${q.id}/descartar`)).status).toBe(204);
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: q.id } })).estado).toBe('DESCARTADA');
    expect((await como('productor').post(`/propuestas/${q.id}/aplicar`, {})).body).toMatchObject({ codigo: 'PROPUESTA_RESUELTA', mensaje: 'Esta propuesta se descartó' });
  });

  it('HU-0604 · CP-059: «Menos texto» y Deshacer conservan los retoques; mover un elemento no vence la propuesta', async () => {
    // p05 vuelve al caso LOTO con la imagen desplazada y un botón agregado en el editor.
    const ajustes = { 'p05-imagen': { desplazamiento: { x: 12.5, y: -3, dispositivo: 'todos' } }, 'p05-texto': { color: 'acento' } };
    const extras = [{ id: 'p05-boton', tipo: 'boton', texto: { es: 'Ver ejemplo' }, x: 70, y: 80, ancho: 20, alClic: 'retroalimentacion' }];
    const doc = loto();
    Object.assign(pantalla(doc, 'p05'), { ajustes, extras });
    const base = await curso();
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc, version: base.version + 1 } });
    await prisma.cursoVersion.create({ data: { cursoId, version: base.version + 1, documento: doc, motivo: 'edición' } });
    const p = await propuesta('menos-texto');

    // Mover la imagen después de calcular la propuesta no la vence: la huella no mira los retoques.
    const movida = await como('productor').patch(`/cursos/${cursoId}/pantallas/p05`, { version: base.version + 1, ajustes: { 'p05-imagen': { desplazamiento: { x: 20, y: -3, dispositivo: 'todos' } } } });
    expect(movida.status).toBe(200);
    const antes = await curso();

    const r = await como('productor').post(`/propuestas/${p.id}/aplicar`, {});
    expect(r.status).toBe(200);
    const despues = pantalla((await curso()).documento, 'p05') as P & { ajustes?: object; extras?: object[] };
    expect(despues.bloques[1]!.contenido!.es).toBe('Energía que puede mover, calentar o liberar algo sin aviso.');
    expect(despues.ajustes).toEqual({ ...ajustes, 'p05-imagen': { desplazamiento: { x: 20, y: -3, dispositivo: 'todos' } } });
    expect(despues.extras).toEqual(extras);

    // Deshacer revierte el texto y deja los retoques como están ahora (aunque la versión vieja no tuviera estos).
    const conColor = await como('productor').patch(`/cursos/${cursoId}/pantallas/p05`, { version: r.body.version, ajustes: { 'p05-texto': { color: 'primario' } } });
    expect(conColor.status).toBe(200);
    expect((await como('productor').post(`/cursos/${cursoId}/versiones/${base.version + 1}/restaurar`)).status).toBe(200);
    const restaurada = pantalla((await curso()).documento, 'p05') as P & { ajustes?: Record<string, unknown>; extras?: object[] };
    expect(restaurada.bloques).toEqual(pantalla(antes.documento, 'p05').bloques);
    expect(restaurada.ajustes).toMatchObject({ 'p05-texto': { color: 'primario' }, 'p05-imagen': { desplazamiento: { x: 20 } } });
    expect(restaurada.extras).toEqual(extras);
  });
});
