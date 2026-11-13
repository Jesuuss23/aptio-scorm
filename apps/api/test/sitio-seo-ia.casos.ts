// Se carga desde sitio.e2e.test.ts para correr en serie con las demás pruebas del sitio (versiones y puntero globales).
// HU-1513 · SEO para IA (REQ-072, PNT-30) contra PostgreSQL, Redis y el S3 local: llms.txt y rastreadores con sus
// validaciones, preguntas objetivo con la marca manual de cada asistente, IA-19 en modo simulado con su TrabajoIA de la
// plataforma, el límite de gasto y una salida que no valida; CP-127 (una propuesta se vuelve página en BORRADOR o
// pregunta oculta, sin publicar nada), y en GET /s/* robots.txt con los rastreadores bloqueados (CP-126) y /llms.txt
// (404 vacío o sin publicar, 200 tras publicar). Permisos y auditoría.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { proveedorSimulado } from '@aptio/ai';
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { COLA_MANTENIMIENTO, idPrerender, opcionesRedis, prefijoColas } from '@aptio/colas';
import { hashearClave, ID_SEO, prisma, Rol, ultimaVersion } from '@aptio/db';
import { CLAVE_ACTUAL, claveVersion, opcionesRenderDesdeEnv, renderizarSitio } from '@aptio/sitio';
import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AlmacenService } from '../src/recursos/almacen.service.js';
import { SeoIaService } from '../src/sitio/seo-ia.service.js';
import { SitioPublicoService } from '../src/sitio/sitio-publico.service.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correoDe = (n: string) => `${n}-${sufijo}@sitio-seo-ia.test`;
const almacen = new Almacen({ ...configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint }), bucket: 'aptio-pruebas-sitio-api' });

interface Propuesta { id: string; tipo: string; estado: string; datos: Record<string, string>; creadoId?: string }

describe.skipIf((!hayBase || !hayS3) && !process.env.CI)('SEO para IA del sitio (HU-1513)', () => {
  let app: INestApplication;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const entornoOriginal = process.env.SITIO_ENTORNO;
  let respaldoSeo: Awaited<ReturnType<typeof prisma.sitioSeo.findUnique>> = null;
  let respaldoPreguntas: Awaited<ReturnType<typeof prisma.sitioPreguntaIa.findMany>> = [];
  let respaldoPropuestas: Awaited<ReturnType<typeof prisma.sitioPropuestaIa.findMany>> = [];
  let inicio = new Date();
  const creados = { paginas: [] as string[], elementos: [] as string[], conexiones: [] as string[], trabajos: [] as string[] };
  const enviar = (m: 'get' | 'post' | 'patch' | 'delete', r: string, b?: object, quien: 'super' | 'admin' = 'super') => {
    const req = request(servidor)[m](`/api/v1${r}`).set('Cookie', cookies[quien]!);
    return b ? req.send(b) : req;
  };
  const auditorias = (accion: string) => prisma.auditoria.findMany({ where: { accion, usuario: { email: correoDe('super') } }, orderBy: { creadoEn: 'asc' } });
  const trabajos = () => prisma.trabajoIA.findMany({ where: { tarea: 'IA-19', organizacionId: null, creadoEn: { gte: inicio } }, orderBy: { creadoEn: 'asc' } });

  beforeAll(async () => {
    process.env.SITIO_ENTORNO = 'produccion';
    inicio = new Date();
    respaldoSeo = await prisma.sitioSeo.findUnique({ where: { id: ID_SEO } });
    respaldoPreguntas = await prisma.sitioPreguntaIa.findMany();
    respaldoPropuestas = await prisma.sitioPropuestaIa.findMany();
    await prisma.sitioPreguntaIa.deleteMany();
    await prisma.sitioPropuestaIa.deleteMany();
    await prisma.sitioSeo.deleteMany();
    await prepararAlmacen(almacen, ['http://localhost:5173']);
    const org = await prisma.organizacion.create({ data: { nombre: 'Org SEO IA', slug: `seo-ia-${sufijo}` } });
    const hashClave = await hashearClave(CLAVE);
    await prisma.usuario.create({ data: { nombre: 'Super', email: correoDe('super'), rol: Rol.SUPERADMIN, hashClave, emailVerificado: true } });
    await prisma.usuario.create({ data: { nombre: 'Admin', email: correoDe('admin'), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AlmacenService).useValue({ almacen }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    // Sin depender del entorno: el modo simulado responde la salida grabada de IA-19.
    app.get(SeoIaService).proveedor = proveedorSimulado();
    for (const quien of ['super', 'admin'] as const) {
      const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email: correoDe(quien), clave: CLAVE });
      cookies[quien] = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await app?.close();
    if (entornoOriginal === undefined) delete process.env.SITIO_ENTORNO;
    else process.env.SITIO_ENTORNO = entornoOriginal;
    if (await almacen.info(CLAVE_ACTUAL)) await almacen.borrar([CLAVE_ACTUAL]);
    await prisma.sitioPagina.deleteMany({ where: { id: { in: creados.paginas } } });
    await prisma.sitioElemento.deleteMany({ where: { id: { in: creados.elementos } } });
    await prisma.configProveedor.deleteMany({ where: { id: { in: creados.conexiones } } });
    await prisma.trabajoIA.deleteMany({ where: { OR: [{ id: { in: creados.trabajos } }, { tarea: 'IA-19', organizacionId: null, creadoEn: { gte: inicio } }] } });
    await prisma.sitioPreguntaIa.deleteMany();
    await prisma.sitioPropuestaIa.deleteMany();
    await prisma.sitioSeo.deleteMany();
    if (respaldoSeo) await prisma.sitioSeo.create({ data: respaldoSeo });
    if (respaldoPreguntas.length) await prisma.sitioPreguntaIa.createMany({ data: respaldoPreguntas.map((p) => ({ ...p, menciones: p.menciones as object })) });
    if (respaldoPropuestas.length) await prisma.sitioPropuestaIa.createMany({ data: respaldoPropuestas.map((p) => ({ ...p, datos: p.datos as object })) });
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@sitio-seo-ia.test` } }, select: { id: true } });
    const ids = usuarios.map((u) => u.id);
    const versiones = await prisma.sitioVersion.findMany({ where: { publicadoPorId: { in: ids } } });
    const cola = new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    for (const v of versiones) await (await cola.getJob(idPrerender(v.numero)))?.remove();
    await cola.close();
    await prisma.sitioVersion.updateMany({ where: { publicadoPorId: { in: ids } }, data: { publicadoPorId: null } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.organizacion.deleteMany({ where: { slug: `seo-ia-${sufijo}` } });
  });

  it('solo el superadmin: 401 sin sesión y 403 a un rol de organización', async () => {
    const id = crypto.randomUUID();
    const rutas = [
      ['get', '/sitio/seo-ia'], ['patch', '/sitio/seo-ia'], ['post', '/sitio/seo-ia/preguntas'], ['patch', `/sitio/seo-ia/preguntas/${id}`], ['delete', `/sitio/seo-ia/preguntas/${id}`],
      ['post', '/sitio/seo-ia/proponer'], ['post', `/sitio/seo-ia/propuestas/${id}/borrador`], ['post', `/sitio/seo-ia/propuestas/${id}/descartar`],
    ] as const;
    for (const [m, r] of rutas) {
      expect([m, r, (await request(servidor)[m](`/api/v1${r}`).send({})).status]).toEqual([m, r, 401]);
      expect([m, r, (await enviar(m, r, { llmsTxt: '', pregunta: 'una pregunta' }, 'admin')).status]).toEqual([m, r, 403]);
    }
  });

  it('empieza con todo permitido, sin llms.txt, sin preguntas ni propuestas', async () => {
    const r = await enviar('get', '/sitio/seo-ia');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ llmsTxt: '', preguntas: [], propuestas: [] });
    expect(r.body.rastreadores).toEqual(['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot'].map((nombre) => ({ nombre, permitido: true })));
    expect(r.body.asistentes.map((a: { nombre: string }) => a.nombre)).toEqual(['ChatGPT', 'Claude', 'Gemini', 'Perplexity']);
    expect(r.body.paginasFaq).toEqual({ conFaq: expect.any(Number), publicadas: expect.any(Number) });
  });

  it('llms.txt y rastreadores: texto plano de hasta 20 000 caracteres y solo el catálogo, con auditoría', async () => {
    const codigo = async (b: object) => { const r = await enviar('patch', '/sitio/seo-ia', b); return [r.status, r.body.codigo, r.body.detalles?.[0]?.campo]; };
    expect(await codigo({})).toEqual([422, 'SIN_CAMBIOS', undefined]);
    expect(await codigo({ llmsTxt: '# Aptio\n<script>alert(1)</script>' })).toEqual([422, 'NO_VALIDO', 'llmsTxt']);
    expect(await codigo({ llmsTxt: 'x'.repeat(20_001) })).toEqual([422, 'NO_VALIDO', 'llmsTxt']);
    expect(await codigo({ rastreadores: { Bingbot: false } })).toEqual([422, 'NO_VALIDO', 'rastreadores.Bingbot']);
    expect(await codigo({ rastreadores: { GPTBot: 'no' } })).toEqual([422, 'NO_VALIDO', 'rastreadores.GPTBot']);
    expect((await enviar('get', '/sitio/seo-ia')).body.llmsTxt).toBe('');

    const ok = await enviar('patch', '/sitio/seo-ia', { llmsTxt: '# Aptio SCORM  \r\n\r\n> Cápsulas SCORM con IA.\n\n', rastreadores: { GPTBot: false, CCBot: false } });
    expect(ok.status).toBe(200);
    expect(ok.body.llmsTxt).toBe('# Aptio SCORM\n\n> Cápsulas SCORM con IA.');
    expect(ok.body.rastreadores.filter((r: { permitido: boolean }) => !r.permitido).map((r: { nombre: string }) => r.nombre)).toEqual(['GPTBot', 'CCBot']);
    expect((await auditorias('SITIO_LLMS_EDITADO')).at(-1)).toMatchObject({ entidad: 'SitioSeo', organizacionId: null, datos: { caracteresAntes: 0, caracteres: '# Aptio SCORM\n\n> Cápsulas SCORM con IA.'.length } });
    expect((await auditorias('SITIO_RASTREADORES_EDITADOS')).at(-1)?.datos).toEqual({ antes: [], bloqueados: ['GPTBot', 'CCBot'] });
    // Lo mismo otra vez no deja otra fila de auditoría.
    await enviar('patch', '/sitio/seo-ia', { llmsTxt: '# Aptio SCORM\n\n> Cápsulas SCORM con IA.', rastreadores: { GPTBot: false } });
    expect(await auditorias('SITIO_LLMS_EDITADO')).toHaveLength(1);
    expect(await auditorias('SITIO_RASTREADORES_EDITADOS')).toHaveLength(1);
    // La vista previa de robots.txt de «SEO» ya muestra los bloqueados, y hay cambios sin publicar.
    expect((await enviar('get', '/sitio/seo')).body.robotsVistaPrevia).toContain('User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n');
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(true);
  });

  it('sin preguntas objetivo no se piden propuestas', async () => {
    const r = await enviar('post', '/sitio/seo-ia/proponer');
    expect([r.status, r.body.codigo]).toEqual([422, 'SIN_PREGUNTAS']);
    expect(await trabajos()).toHaveLength(0);
  });

  it('preguntas objetivo: alta, 409 si se repite, marca manual por asistente con su fecha, edición y borrado', async () => {
    const alta = await enviar('post', '/sitio/seo-ia/preguntas', { pregunta: '  mejor herramienta para   crear cursos SCORM con IA ' });
    expect(alta.status).toBe(201);
    expect(alta.body.pregunta).toBe('mejor herramienta para crear cursos SCORM con IA');
    expect(alta.body.menciones).toEqual(Object.fromEntries(['chatgpt', 'claude', 'gemini', 'perplexity'].map((a) => [a, { estado: 'sin_revisar', revisadoEn: null }])));
    const repetida = await enviar('post', '/sitio/seo-ia/preguntas', { pregunta: 'Mejor herramienta para crear cursos SCORM con IA?' });
    expect([repetida.status, repetida.body.codigo]).toEqual([409, 'PREGUNTA_REPETIDA']);
    expect((await enviar('post', '/sitio/seo-ia/preguntas', { pregunta: 'hola' })).status).toBe(422);
    expect((await enviar('post', '/sitio/seo-ia/preguntas', { pregunta: '<b>cursos SCORM</b>' })).status).toBe(422);
    expect((await enviar('post', '/sitio/seo-ia/preguntas', {})).status).toBe(422);

    const antes = Date.now();
    const marca = await enviar('patch', `/sitio/seo-ia/preguntas/${alta.body.id}`, { menciones: { chatgpt: 'si', gemini: 'no' } });
    expect(marca.status).toBe(200);
    expect(marca.body.menciones).toMatchObject({ chatgpt: { estado: 'si' }, gemini: { estado: 'no' }, claude: { estado: 'sin_revisar', revisadoEn: null } });
    expect(new Date(marca.body.menciones.chatgpt.revisadoEn).getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect((await auditorias('SITIO_PREGUNTA_IA_REVISADA')).at(-1)?.datos).toEqual({ menciones: { chatgpt: 'si', gemini: 'no' } });
    const vuelta = await enviar('patch', `/sitio/seo-ia/preguntas/${alta.body.id}`, { menciones: { chatgpt: 'sin_revisar' } });
    expect(vuelta.body.menciones).toMatchObject({ chatgpt: { estado: 'sin_revisar', revisadoEn: null }, gemini: { estado: 'no' } });
    for (const menciones of [{ copilot: 'si' }, { claude: 'tal vez' }]) {
      expect((await enviar('patch', `/sitio/seo-ia/preguntas/${alta.body.id}`, { menciones })).status).toBe(422);
    }
    expect((await enviar('patch', `/sitio/seo-ia/preguntas/${alta.body.id}`, {})).body.codigo).toBe('SIN_CAMBIOS');

    const otra = await enviar('post', '/sitio/seo-ia/preguntas', { pregunta: 'personaje animado para e-learning' });
    const editada = await enviar('patch', `/sitio/seo-ia/preguntas/${otra.body.id}`, { pregunta: 'personaje animado para e-learning sin video' });
    expect(editada.body.pregunta).toBe('personaje animado para e-learning sin video');
    expect((await enviar('patch', `/sitio/seo-ia/preguntas/${otra.body.id}`, { pregunta: 'mejor herramienta para crear cursos scorm con ia' })).status).toBe(409);
    expect((await enviar('delete', `/sitio/seo-ia/preguntas/${otra.body.id}`)).status).toBe(204);
    expect((await enviar('delete', `/sitio/seo-ia/preguntas/${otra.body.id}`)).status).toBe(404);
    expect((await auditorias('SITIO_PREGUNTA_IA_BORRADA')).at(-1)?.datos).toEqual({ pregunta: 'personaje animado para e-learning sin video' });
    expect((await enviar('get', '/sitio/seo-ia')).body.preguntas.map((p: { pregunta: string }) => p.pregunta)).toEqual(['mejor herramienta para crear cursos SCORM con IA']);
  });

  it('IA-19: una salida que no valida tras 3 intentos no guarda nada y registra el consumo; el límite de gasto detiene el pedido', async () => {
    const servicio = app.get(SeoIaService);
    const malo = proveedorSimulado({ 'IA-19': ['esto no es JSON', '{"propuestas":[]}', '{"propuestas":[{"tipo":"pagina","titulo":"<b>x</b>"}]}'] });
    servicio.proveedor = malo;
    const r = await enviar('post', '/sitio/seo-ia/proponer');
    expect([r.status, r.body.codigo]).toEqual([502, 'PROPUESTA_NO_VALIDA']);
    expect(malo.llamadas).toHaveLength(3);
    expect(await prisma.sitioPropuestaIa.count()).toBe(0);
    expect((await trabajos()).at(-1)).toMatchObject({ estado: 'ERROR', intentos: 3, organizacionId: null, proyectoId: null, versionPrompt: 'IA-19.v1' });

    // El límite de la plataforma: la conexión de texto sin organización.
    const gasto = await prisma.trabajoIA.create({ data: { organizacionId: null, tarea: 'IA-19', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', estado: 'COMPLETADO', costoUsd: 1.25 } });
    creados.trabajos.push(gasto.id);
    const conexion = await prisma.configProveedor.create({ data: { organizacionId: null, tarea: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', limiteGastoMensualUsd: 1 } });
    creados.conexiones.push(conexion.id);
    const sinGastar = proveedorSimulado();
    servicio.proveedor = sinGastar;
    const tope = await enviar('post', '/sitio/seo-ia/proponer');
    expect([tope.status, tope.body.codigo]).toEqual([422, 'LIMITE_GASTO']);
    expect(tope.body.mensaje).toContain('USD 1.25 de 1.00');
    expect(sinGastar.llamadas).toHaveLength(0);
    expect((await auditorias('LIMITE_GASTO_ALCANZADO')).at(-1)).toMatchObject({ entidadId: conexion.id, datos: { tarea: 'TEXTO', gastoUsd: 1.25, limiteUsd: 1 } });
    // Al subir el límite, el pedido pasa.
    await prisma.configProveedor.update({ where: { id: conexion.id }, data: { limiteGastoMensualUsd: 50 } });
  });

  it('CP-127: las propuestas llegan pendientes y «Crear borrador» crea una página en BORRADOR o una pregunta oculta, sin publicar nada', async () => {
    const pendientesAntes = (await enviar('get', '/sitio/versiones')).body.pendientes;
    const publicadasAntes = await prisma.sitioPagina.count({ where: { estado: 'PUBLICADA' } });
    const visiblesAntes = await prisma.sitioElemento.count({ where: { visible: true } });
    const proveedor = proveedorSimulado();
    app.get(SeoIaService).proveedor = proveedor;

    const r = await enviar('post', '/sitio/seo-ia/proponer');
    expect(r.status).toBe(200);
    expect(r.body.nuevas).toBe(3);
    expect(r.body.observaciones).toHaveLength(1);
    const propuestas = r.body.propuestas as Propuesta[];
    expect(propuestas.map((p) => [p.tipo, p.estado]).sort()).toEqual([['pagina', 'pendiente'], ['pregunta', 'pendiente'], ['pregunta', 'pendiente']]);
    // El pedido lleva las preguntas objetivo con sus marcas, como datos.
    expect(proveedor.llamadas[0]!.mensajes[0]!.texto).toContain('- mejor herramienta para crear cursos SCORM con IA (ChatGPT: sin revisar, Claude: sin revisar, Gemini: no, Perplexity: sin revisar)');
    // El consumo queda a nombre de la plataforma: sin organización ni proyecto.
    const trabajo = await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.body.trabajoId } });
    expect(trabajo).toMatchObject({ tarea: 'IA-19', tipo: 'TEXTO', estado: 'COMPLETADO', organizacionId: null, proyectoId: null, proveedor: 'simulado', modelo: 'simulado-loto', versionPrompt: 'IA-19.v1', intentos: 1 });
    expect(Number(trabajo.costoUsd)).toBe(0);
    expect((await auditorias('SITIO_PROPUESTAS_IA_PEDIDAS')).at(-1)).toMatchObject({ entidadId: trabajo.id, datos: { tarea: 'IA-19', recibidas: 3, nuevas: 3 } });
    // Pedir otra vez no duplica lo que ya está propuesto.
    const otra = await enviar('post', '/sitio/seo-ia/proponer');
    expect([otra.status, otra.body.nuevas, otra.body.propuestas.length]).toEqual([200, 0, 3]);

    const pagina = propuestas.find((p) => p.tipo === 'pagina')!;
    expect(pagina.datos).toMatchObject({ titulo: 'SCORM 1.2 vs. cmi5', ruta: '/scorm-vs-cmi5' });
    const borrador = await enviar('post', `/sitio/seo-ia/propuestas/${pagina.id}/borrador`);
    expect([borrador.status, borrador.body.estado]).toEqual([200, 'borrador_creado']);
    creados.paginas.push(borrador.body.creadoId);
    expect(await prisma.sitioPagina.findUniqueOrThrow({ where: { id: borrador.body.creadoId } })).toMatchObject({
      ruta: '/scorm-vs-cmi5', idioma: 'es', titulo: 'SCORM 1.2 vs. cmi5', estado: 'BORRADOR', publicadaEn: null,
      metaTitulo: pagina.datos.metaTitulo, metaDescripcion: pagina.datos.metaDescripcion,
    });
    expect((await request(servidor).get('/api/v1/publico/paginas?ruta=/scorm-vs-cmi5')).status).toBe(404);
    const repetir = await enviar('post', `/sitio/seo-ia/propuestas/${pagina.id}/borrador`);
    expect([repetir.status, repetir.body.codigo]).toEqual([409, 'PROPUESTA_RESUELTA']);

    const [faq, descartable] = propuestas.filter((p) => p.tipo === 'pregunta') as [Propuesta, Propuesta];
    const oculta = await enviar('post', `/sitio/seo-ia/propuestas/${faq.id}/borrador`);
    expect([oculta.status, oculta.body.estado]).toEqual([200, 'borrador_creado']);
    creados.elementos.push(oculta.body.creadoId);
    const elemento = await prisma.sitioElemento.findUniqueOrThrow({ where: { id: oculta.body.creadoId } });
    expect(elemento).toMatchObject({ coleccion: 'preguntas', idioma: 'es', visible: false, ficticio: false });
    expect(elemento.datos).toMatchObject({ pregunta: faq.datos.pregunta, respuesta: faq.datos.respuesta });

    const descartada = await enviar('post', `/sitio/seo-ia/propuestas/${descartable.id}/descartar`);
    expect([descartada.status, descartada.body.estado]).toEqual([200, 'descartada']);
    expect((await enviar('post', `/sitio/seo-ia/propuestas/${descartable.id}/borrador`)).status).toBe(409);
    expect((await enviar('post', `/sitio/seo-ia/propuestas/${crypto.randomUUID()}/descartar`)).status).toBe(404);
    expect((await enviar('get', '/sitio/seo-ia')).body.propuestas).toEqual([]);

    // Nada se publicó ni cambió lo que ve el sitio.
    expect(await prisma.sitioPagina.count({ where: { estado: 'PUBLICADA' } })).toBe(publicadasAntes);
    expect(await prisma.sitioElemento.count({ where: { visible: true } })).toBe(visiblesAntes);
    expect((await enviar('get', '/sitio/versiones')).body.pendientes).toBe(pendientesAntes);
    expect((await auditorias('SITIO_PROPUESTA_IA_BORRADOR')).map((a) => (a.datos as { tipo: string }).tipo).sort()).toEqual(['pagina', 'pregunta']);
    expect((await auditorias('SITIO_PROPUESTA_IA_DESCARTADA')).at(-1)).toMatchObject({ entidadId: descartable.id });
    expect((await auditorias('SITIO_PAGINA_CREADA')).at(-1)?.datos).toMatchObject({ ruta: '/scorm-vs-cmi5', estado: 'BORRADOR', propuestaIaId: pagina.id });
    // Con la página y la pregunta ya creadas, la misma respuesta de la IA solo vuelve a proponer lo descartado.
    const tercera = await enviar('post', '/sitio/seo-ia/proponer');
    expect(tercera.body.nuevas).toBe(1);
    expect(tercera.body.propuestas[0].datos.pregunta).toBe(descartable.datos.pregunta);
  });

  it('CP-126 y /llms.txt: publicado, robots.txt bloquea los rastreadores elegidos y /s/llms.txt responde 200; vacío o sin publicar, 404', async () => {
    app.get(SitioPublicoService).olvidar();
    // Guardado pero sin publicar: el sitio todavía no lo sirve.
    expect((await request(servidor).get('/s/llms.txt')).status).toBe(404);

    const publicar = async () => {
      const v = await enviar('post', '/sitio/publicar');
      if (v.status !== 201) throw new Error(`publicar: ${v.status} ${JSON.stringify(v.body)}`);
      // Lo que haría el worker con la versión: pre-renderizar y mover el puntero.
      const inst = (await ultimaVersion(prisma))!.instantanea;
      for (const a of renderizarSitio(inst, opcionesRenderDesdeEnv())) await almacen.subir(claveVersion(v.body.numero, a.archivo), a.contenido, a.mime);
      await almacen.subir(CLAVE_ACTUAL, JSON.stringify({ version: v.body.numero, generadoEn: new Date().toISOString() }), 'application/json');
      app.get(SitioPublicoService).olvidar();
      return inst;
    };
    const inst = await publicar();
    expect(inst).toMatchObject({ llmsTxt: '# Aptio SCORM\n\n> Cápsulas SCORM con IA.', rastreadoresBloqueados: ['GPTBot', 'CCBot'] });

    const robots = await request(servidor).get('/s/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.text).toContain('User-agent: *\nAllow: /\n');
    expect(robots.text).toContain('User-agent: GPTBot\nDisallow: /\n');
    expect(robots.text).toContain('User-agent: CCBot\nDisallow: /\n');
    for (const permitido of ['ClaudeBot', 'Google-Extended', 'PerplexityBot']) expect(robots.text).not.toContain(permitido);

    const llms = await request(servidor).get('/s/llms.txt');
    expect([llms.status, llms.headers['content-type'], llms.headers['x-content-type-options']]).toEqual([200, 'text/plain; charset=utf-8', 'nosniff']);
    expect(llms.text).toBe('# Aptio SCORM\n\n> Cápsulas SCORM con IA.\n');

    // Permitir GPTBot y vaciar llms.txt: al publicar, sale del robots y el archivo vuelve a 404.
    const cambio = await enviar('patch', '/sitio/seo-ia', { llmsTxt: '', rastreadores: { GPTBot: true } });
    expect(cambio.status).toBe(200);
    expect((await request(servidor).get('/s/llms.txt')).status).toBe(200);
    const despues = await publicar();
    expect(despues.llmsTxt).toBeUndefined();
    expect(despues.rastreadoresBloqueados).toEqual(['CCBot']);
    expect((await request(servidor).get('/s/llms.txt')).status).toBe(404);
    const robots2 = (await request(servidor).get('/s/robots.txt')).text;
    expect(robots2).not.toContain('GPTBot');
    expect(robots2).toContain('User-agent: CCBot\nDisallow: /\n');
  });
});
