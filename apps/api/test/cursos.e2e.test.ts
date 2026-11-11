// HU-0501 y HU-0502 · Revisión: observaciones, aprobar una o por lote y editar (CP-048, CP-049) contra PostgreSQL real.
// HU-0503 · Corregir la narración encola la cascada con espera en Redis (CP-051), con un prefijo de colas propio.
// Se salta sin DATABASE_URL, salvo en CI.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { crearCola } from '@aptio/colas';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { ETAPAS } from '@aptio/schema/generacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
process.env.COLAS_PREFIJO = `prueba-cursos-${sufijo}`;
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
    const voz = crearCola('voz');
    await voz.obliterate({ force: true });
    await voz.close();
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

  it('HU-0701 y HU-0801 · lista las narraciones en el orden de las pantallas con su estado, duración, audio y subtítulos firmados', async () => {
    const audio = await prisma.recurso.create({
      data: { organizacionId: orgId, proyectoId, tipo: 'AUDIO', origen: 'GENERADO', claveS3: `org/${orgId}/voz-${sufijo}`, mime: 'audio/mpeg', bytes: 10, duracionMs: 4485, hash: 'x', nombre: 'p01-es.mp3', proveedor: 'google', modelo: 'es-US-Neural2-A' },
    });
    const vtt = await prisma.recurso.create({
      data: { organizacionId: orgId, proyectoId, tipo: 'SUBTITULO', origen: 'GENERADO', claveS3: `org/${orgId}/vtt-${sufijo}`, mime: 'text/vtt', bytes: 10, hash: 'v', nombre: 'p01-es.vtt' },
    });
    await prisma.narracion.createMany({
      data: [
        { cursoId, pantallaId: 'p02', idioma: 'es', textoHash: 'b', origen: 'tts', voz: 'es-US-Neural2-A', estado: 'DESACTUALIZADA' },
        { cursoId, pantallaId: 'p01', idioma: 'es', textoHash: 'a', origen: 'tts', voz: 'es-US-Neural2-A', audioRecursoId: audio.id, subtituloRecursoId: vtt.id, estado: 'ACTUALIZADA' },
      ],
    });
    const r = await como('productor').get(`/cursos/${cursoId}/narraciones?idioma=es`);
    expect(r.status).toBe(200);
    expect(r.body.map((n: { pantallaId: string }) => n.pantallaId)).toEqual(['p01', 'p02']);
    expect(r.body[0]).toMatchObject({ idioma: 'es', estado: 'ACTUALIZADA', origen: 'tts', voz: 'es-US-Neural2-A', duracionS: 4.5, texto: 'Hola, te doy la bienvenida a esta cápsula sobre bloqueo y etiquetado.' });
    expect(r.body[0].audioUrl).toMatch(/X-Amz-Signature=/);
    expect(r.body[0].subtitulosUrl).toMatch(/X-Amz-Signature=/);
    expect(r.body[1]).not.toHaveProperty('audioUrl');
    expect(r.body[1]).not.toHaveProperty('subtitulosUrl');
    expect((await como('grafico').get(`/cursos/${cursoId}/narraciones?idioma=fr`)).status).toBe(422);
    expect((await como('revisor').get(`/cursos/${cursoId}/narraciones`)).status).toBe(404);
    await prisma.recurso.deleteMany({ where: { id: { in: [audio.id, vtt.id] } } });
  });

  it('HU-0703 · corregir la narración en Revisión la deja «Por regenerar»; corregir solo el título, no', async () => {
    await prisma.narracion.upsert({
      where: { cursoId_pantallaId_idioma: { cursoId, pantallaId: 'p03', idioma: 'es' } },
      create: { cursoId, pantallaId: 'p03', idioma: 'es', textoHash: 'c', origen: 'tts', estado: 'ACTUALIZADA' },
      update: { estado: 'ACTUALIZADA' },
    });
    const estado = async () => (await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p03' } })).estado;
    let version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    expect((await como('grafico').patch(`/cursos/${cursoId}/pantallas/p03`, { version, titulo: { es: 'Te acompaña Ana, tu guía' } })).status).toBe(200);
    expect(await estado()).toBe('ACTUALIZADA');
    version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const r = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p03`, { version, narracion: { es: 'Soy Ana, supervisora. Te muestro cómo protegerte.' } });
    expect(r.status).toBe(200);
    expect(r.body.regenerando).toEqual(['voz-es', 'boca', 'subtitulos-es']);
    expect(await estado()).toBe('DESACTUALIZADA');
  });

  it('CP-051 · cinco guardados seguidos de la narración dejan un solo trabajo de cascada, que corre 1 s después del último', async () => {
    const voz = crearCola('voz');
    try {
      let version = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
      for (let i = 1; i <= 5; i++) {
        const r = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p03`, { version, narracion: { es: `Soy Ana, supervisora. Versión ${i}.` } });
        expect(r.status).toBe(200);
        version = r.body.version;
      }
      const trabajos = (await voz.getJobs(['delayed', 'waiting', 'active'])).filter((t) => t.data.trabajoId === cursoId);
      expect(trabajos).toHaveLength(1);
      expect(trabajos[0]).toMatchObject({ id: `cascada-${cursoId}-p03`, data: { tarea: 'CASCADA', pantallaId: 'p03', organizacionId: orgId }, delay: 1000 });
      expect(await trabajos[0]!.getState()).toBe('delayed');
      // Cambiar solo el título no regenera nada; una pantalla sin voz tampoco encola.
      const titulo = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p03`, { version, titulo: { es: 'Te acompaña Ana' } });
      expect(titulo.body.regenerando).toEqual([]);
      const sinVoz = await como('grafico').patch(`/cursos/${cursoId}/pantallas/p08`, { version: titulo.body.version, narracion: { es: 'Sin voz todavía.' } });
      expect(sinVoz.body.regenerando).toEqual([]);
      expect((await voz.getJobs(['delayed', 'waiting'])).filter((t) => t.data.trabajoId === cursoId)).toHaveLength(1);
    } finally {
      await voz.close();
    }
  });

  it('HU-0703 · regenerar continúa las etapas 6 a 8 de la última generación; 422 sin voz o en inglés, 409 si ya corre', async () => {
    const ruta = `/cursos/${cursoId}/narraciones/regenerar`;
    expect((await como('productor').post(ruta, {})).body).toMatchObject({ codigo: 'SIN_VOZ' });
    const di = await prisma.usuario.findFirstOrThrow({ where: { email: correo('instruccional') } });
    const g = await prisma.generacion.create({
      data: {
        organizacionId: orgId, proyectoId, estado: 'COMPLETADO', parametros: { pantallas: 30 }, iniciadoPorId: di.id, terminadoEn: new Date(),
        etapas: { create: ETAPAS.map((etapa, i) => ({ etapa, orden: i + 1, estado: i < 4 || etapa === 'VOZ_ES' || etapa === 'BOCA' ? 'COMPLETADO' as const : 'EN_COLA' as const })) },
      },
    });
    const audio = await prisma.recurso.create({
      data: { organizacionId: orgId, proyectoId, tipo: 'AUDIO', origen: 'GENERADO', claveS3: `org/${orgId}/regen-${sufijo}`, mime: 'audio/wav', bytes: 10, duracionMs: 1000, hash: 'y', nombre: 'p04-es.wav' },
    });
    await prisma.narracion.create({ data: { cursoId, pantallaId: 'p04', idioma: 'es', textoHash: 'd', origen: 'tts', audioRecursoId: audio.id, estado: 'DESACTUALIZADA' } });

    expect((await como('productor').post(ruta, { idiomas: ['en'] })).body).toMatchObject({ codigo: 'IDIOMA_NO_DISPONIBLE' });
    expect((await como('productor').post(ruta, { soloDesactualizadas: false })).body).toMatchObject({ codigo: 'PANTALLAS_REQUERIDAS' });
    expect((await como('revisor').post(ruta, {})).status).toBe(403);

    const r = await como('grafico').post(ruta, {});
    expect(r.status).toBe(202);
    // p02 (sin audio), p03 (corregida en la prueba anterior) y p04 estaban «Por regenerar».
    expect(r.body).toMatchObject({ id: g.id, estado: 'EN_COLA', eventos: `/api/v1/generaciones/${g.id}/eventos`, pendientes: 3 });
    const etapas = await prisma.generacionEtapa.findMany({ where: { generacionId: g.id, estado: 'EN_COLA' } });
    expect(etapas.map((e) => e.etapa)).toEqual(expect.arrayContaining(['VOZ_ES', 'BOCA', 'SUBTITULOS']));
    expect((await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } })).parametros).toMatchObject({ pantallas: 30, regenerarVoz: { forzar: false } });
    expect((await como('grafico').post(ruta, { pantallaIds: ['p04'], soloDesactualizadas: false })).body).toMatchObject({ codigo: 'GENERACION_ACTIVA' });

    // Una toma nueva de p04: se guarda el pedido para el worker.
    await prisma.generacion.update({ where: { id: g.id }, data: { estado: 'COMPLETADO' } });
    expect((await como('grafico').post(ruta, { pantallaIds: ['p04'], soloDesactualizadas: false })).status).toBe(202);
    expect((await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } })).parametros).toMatchObject({ regenerarVoz: { pantallaIds: ['p04'], forzar: true } });
    await prisma.generacion.delete({ where: { id: g.id } });
  });

  it('HU-0602 · guarda los retoques del elemento aparte del contenido y los restablece; solo colores del kit', async () => {
    const version = async () => (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const ruta = `/cursos/${cursoId}/pantallas/p02`;
    const p02De = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((x) => x.id === 'p02')!;
    const antes = await documento();
    const textoAntes = p02De(antes).bloques;
    const v = await version();
    const r = await como('productor').patch(ruta, { version: v, ajustes: { 'p02-titulo': { tamanoCqw: 5.5, color: 'acento', alineacion: 'centro', animacion: 'rebotar' } } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: v + 1, regenerando: [], estado: 'borrador' });
    let p02 = p02De(await documento()) as unknown as { ajustes?: Record<string, unknown>; bloques: unknown };
    expect(p02.ajustes).toEqual({ 'p02-titulo': { tamanoCqw: 5.5, color: 'acento', alineacion: 'centro', animacion: 'rebotar' } });
    // RN-06-1: el contenido no cambia con un retoque.
    expect(p02.bloques).toEqual(textoAntes);

    // RN-06-4: un color que no es un rol del kit, un elemento que no existe o un valor fuera del esquema: 422 sin guardar.
    expect((await como('productor').patch(ruta, { version: v + 1, ajustes: { 'p02-titulo': { color: '#ff0000' } } })).body).toMatchObject({ codigo: 'COLOR_FUERA_DEL_KIT' });
    expect((await como('productor').patch(ruta, { version: v + 1, ajustes: { 'p02-nada': { color: 'acento' } } })).body).toMatchObject({ codigo: 'BLOQUE_NO_EXISTE' });
    expect((await como('productor').patch(ruta, { version: v + 1, ajustes: { 'p02-titulo': { tamanoCqw: 80 } } })).body).toMatchObject({ codigo: 'CURSO_NO_VALIDO' });
    // Con una versión vieja, 409; el revisor del cliente no retoca.
    expect((await como('productor').patch(ruta, { version: v, ajustes: { 'p02-titulo': null } })).status).toBe(409);
    expect((await como('revisor').patch(ruta, { version: v + 1, ajustes: { 'p02-titulo': null } })).status).toBe(403);
    expect(await version()).toBe(v + 1);

    // null restablece el elemento; sin ajustes, la pantalla no guarda la clave.
    expect((await como('productor').patch(ruta, { version: v + 1, ajustes: { 'p02-titulo': null } })).status).toBe(200);
    p02 = p02De(await documento()) as unknown as { ajustes?: Record<string, unknown>; bloques: unknown };
    expect(p02.ajustes).toBeUndefined();
  });

  it('HU-0603 · guarda el desplazamiento del modo Libre en % del ancho; un dispositivo que no existe no valida', async () => {
    const v = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const ruta = `/cursos/${cursoId}/pantallas/p05`;
    const r = await como('grafico').patch(ruta, { version: v, ajustes: { 'p05-imagen': { desplazamiento: { x: 12.5, y: -4, dispositivo: 'todos' } } } });
    expect(r.status).toBe(200);
    const p05 = (await documento()).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((x) => x.id === 'p05') as unknown as { ajustes?: Record<string, unknown> };
    expect(p05.ajustes).toEqual({ 'p05-imagen': { desplazamiento: { x: 12.5, y: -4, dispositivo: 'todos' } } });
    const mala = await como('grafico').patch(ruta, { version: v + 1, ajustes: { 'p05-imagen': { desplazamiento: { x: 1, y: 1, dispositivo: 'tableta' } } } });
    expect(mala.status).toBe(422);
    expect(mala.body).toMatchObject({ codigo: 'CURSO_NO_VALIDO' });
  });

  it('HU-0605 · CP-060: «Idea + ilustración» pasa a «Tarjetas con íconos» con el mismo contenido y se puede deshacer', async () => {
    type Pd = { id: string; disposicion: string; plantilla: string; estado: string; bloques: unknown[]; ajustes?: Record<string, unknown>; extras?: unknown[] };
    const p05De = (d: Doc) => pantallas(d).find((x) => x.id === 'p05') as unknown as Pd;
    // p05 llega con la imagen movida (HU-0603) y un botón agregado en el editor.
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = structuredClone(c.documento) as unknown as Doc;
    const extras = [{ id: 'p05-boton', tipo: 'boton', texto: { es: 'Ver ejemplo' }, x: 70, y: 80, ancho: 20, alClic: 'retroalimentacion' }];
    p05De(doc).extras = extras;
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object } });
    const antes = p05De(doc);
    expect(antes).toMatchObject({ disposicion: 'idea', plantilla: 'kit-minera-andina-idea' });
    const ajustesAntes = antes.ajustes;
    expect(ajustesAntes).toBeDefined();
    const ruta = `/cursos/${cursoId}/pantallas/p05`;

    const r = await como('grafico').patch(ruta, { version: c.version, disposicion: 'lista' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: c.version + 1, estado: 'borrador' });
    const despues = p05De(await documento());
    expect(despues).toMatchObject({ disposicion: 'lista', plantilla: 'kit-minera-andina-lista', estado: 'borrador' });
    // Se conserva el contenido; los ajustes se reinician y los extras quedan (RN-06-3).
    expect(despues.bloques).toEqual(antes.bloques);
    expect(despues.ajustes).toBeUndefined();
    expect(despues.extras).toEqual(extras);
    expect(await prisma.cursoVersion.findFirst({ where: { cursoId, version: c.version + 1 } })).toMatchObject({ motivo: 'edición' });

    // Deshacer: la disposición anterior y, en el mismo cambio, los ajustes que tenía.
    const deshacer = await como('grafico').patch(ruta, { version: c.version + 1, disposicion: 'idea', ajustes: ajustesAntes });
    expect(deshacer.status).toBe(200);
    const vuelta = p05De(await documento());
    expect(vuelta).toMatchObject({ disposicion: 'idea', plantilla: 'kit-minera-andina-idea', ajustes: ajustesAntes, extras });
    expect(vuelta.bloques).toEqual(antes.bloques);

    // Una pantalla con actividad o un diseño fuera del catálogo: 422 sin guardar; versión vieja, 409; el revisor no.
    const v = c.version + 2;
    expect((await como('grafico').patch(`/cursos/${cursoId}/pantallas/p07`, { version: v, disposicion: 'idea' })).body).toMatchObject({ codigo: 'DISENO_NO_PERMITIDO', mensaje: 'Esta pantalla tiene una actividad: su diseño se cambia en Revisión con la IA' });
    expect((await como('grafico').patch(ruta, { version: v, disposicion: 'quiz' })).body).toMatchObject({ codigo: 'DISENO_NO_PERMITIDO' });
    expect((await como('grafico').patch(ruta, { version: c.version, disposicion: 'dato' })).status).toBe(409);
    expect((await como('revisor').patch(ruta, { version: v, disposicion: 'dato' })).status).toBe(403);
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version).toBe(v);
  });

  it('HU-0606 · agregar un botón, retocarlo y ocultarlo; quitarlo borra su ajuste; ids repetidos no', async () => {
    type Pd = { id: string; extras?: { id: string }[]; ajustes?: Record<string, unknown> };
    const p01De = (d: Doc) => pantallas(d).find((x) => x.id === 'p01') as unknown as Pd;
    const ruta = `/cursos/${cursoId}/pantallas/p01`;
    let v = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version;
    const boton = { id: 'x-boton-1', tipo: 'boton', texto: { es: 'Continuar' }, x: 40, y: 80, ancho: 14, alClic: 'siguiente' };

    // El extra y su ajuste pueden ir en el mismo cambio.
    const r = await como('grafico').patch(ruta, { version: v, extras: [boton], ajustes: { 'x-boton-1': { color: 'primario', oculto: true } } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'borrador' });
    let p01 = p01De(await documento());
    expect(p01.extras).toEqual([boton]);
    expect(p01.ajustes).toMatchObject({ 'x-boton-1': { color: 'primario', oculto: true } });
    v = r.body.version;

    // Un id repetido, el id de un bloque o un extra fuera del esquema: 422 sin guardar.
    expect((await como('grafico').patch(ruta, { version: v, extras: [boton, boton] })).body).toMatchObject({ codigo: 'EXTRA_NO_VALIDO' });
    expect((await como('grafico').patch(ruta, { version: v, extras: [{ ...boton, id: 'p01-titulo' }] })).body).toMatchObject({ codigo: 'EXTRA_NO_VALIDO', mensaje: 'El id «p01-titulo» ya está en la pantalla' });
    expect((await como('grafico').patch(ruta, { version: v, extras: [{ ...boton, x: 140 }] })).body).toMatchObject({ codigo: 'CURSO_NO_VALIDO' });
    expect((await como('grafico').patch(ruta, { version: v, extras: [{ ...boton, tipo: 'video' }] })).body).toMatchObject({ codigo: 'CURSO_NO_VALIDO' });
    expect((await como('revisor').patch(ruta, { version: v, extras: [] })).status).toBe(403);
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).version).toBe(v);

    // Quitar el extra borra su ajuste y deja los de los bloques.
    expect((await como('grafico').patch(ruta, { version: v, ajustes: { 'p01-titulo': { color: 'acento' } } })).status).toBe(200);
    expect((await como('grafico').patch(ruta, { version: v + 1, extras: [] })).status).toBe(200);
    p01 = p01De(await documento());
    expect(p01.extras).toBeUndefined();
    expect(p01.ajustes).toEqual({ 'p01-titulo': { color: 'acento' } });
    expect((await como('grafico').patch(ruta, { version: v + 2, ajustes: { 'x-boton-1': { color: 'acento' } } })).body).toMatchObject({ codigo: 'BLOQUE_NO_EXISTE' });
  });
});
