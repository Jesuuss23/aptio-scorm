// HU-0804 · Voz, boca y subtítulos en inglés: la regeneración con `idioma: 'en'` reabre las etapas 6 a 8 y, para cada
// pantalla narrada con su inglés, crea `porIdioma.en` con audio, bocas y WebVTT, la Narracion en inglés y los recursos
// `pNN-en.mp3` (WAV en modo simulado) y `pNN-en.vtt` con procedencia. El español no se toca y el hash decide qué se vuelve a decir (RN-07-1).
// PostgreSQL real, voz y boca simuladas.
import { type CalculadorBocas, calculadorSimulado, type PedidoVoz, proveedorSimulado, type Sintetizador, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEtapaBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaSubtitulos } from '../src/etapas/subtitulos.js';
import { crearEtapaVoz, VOZ_INGLES_PREDETERMINADA } from '../src/etapas/voz.js';
import { PROCEDENCIA_SUBTITULOS } from '../src/procedencia.js';
import { baseLista, escenario, etapaDe } from './apoyo-generacion.js';

type Pista = { estado: string; voz: { proveedor: string; voz: string; velocidad?: number }; recursoAudioId?: string; duracionMs?: number; bocas?: unknown[]; subtitulosId?: string };
type Pantalla = { id: string; narracion?: { texto: { es: string; en?: string }; porIdioma: { es?: Pista; en?: Pista } } };
type Doc = { modulos: { capsulas: { pantallas: Pantalla[] }[] }[]; recursos: { id: string; tipo: string; nombre: string; idioma?: string }[] };
const pantallasDe = (d: unknown) => (d as Doc).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
/** Las primeras pantallas narradas reciben su inglés; el resto queda sin traducir. */
const TRADUCIDAS = 5;

describe.skipIf(!baseLista && !process.env.CI)('voz en inglés (HU-0804)', () => {
  const e = escenario('voz-ingles');
  beforeAll(e.crear);
  afterAll(e.borrar);

  const almacen = new Map<string, Uint8Array>();
  const subir = async (clave: string, cuerpo: Uint8Array) => void almacen.set(clave, cuerpo);
  const leer = async (clave: string) => almacen.get(clave)!;
  let pedidosVoz: PedidoVoz[] = [];
  let pedidosBoca: string[] = [];
  const sintetizar: Sintetizador = async (p) => (pedidosVoz.push(p), vozSimulada(p));
  const calcular: CalculadorBocas = async (p) => (pedidosBoca.push(p.texto), calculadorSimulado(p));
  const ejecutores = {
    RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS!,
    VOZ_ES: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }), BOCA: crearEtapaBoca({ calcular, leer }), SUBTITULOS: crearEtapaSubtitulos({ subir }),
  };
  /** Lo que hace `POST /cursos/{id}/narraciones/regenerar`: guarda el pedido y reabre las etapas 6 a 8. */
  const regenerar = async (pedido: { idioma?: 'en'; pantallaIds?: string[]; forzar?: boolean }) => {
    const g = await prisma.generacion.findUniqueOrThrow({ where: { id: generacionId } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA', parametros: { ...(g.parametros as object), regenerarVoz: pedido } } });
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: ['VOZ_ES', 'BOCA', 'SUBTITULOS'] } }, data: { estado: 'EN_COLA' } });
    pedidosVoz = [];
    pedidosBoca = [];
    return e.correr(generacionId, proveedorSimulado(), ejecutores);
  };
  const documento = async () => (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento;
  /** Escribe el inglés de las narraciones (lo que deja Idiomas) en las pantallas pedidas. */
  const traducir = async (ids: string[], texto = (es: string) => `[EN] ${es}`) => {
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = structuredClone(c.documento) as unknown as Doc;
    for (const p of pantallasDe(doc)) if (p.narracion && ids.includes(p.id)) p.narracion.texto.en = texto(p.narracion.texto.es);
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object, version: c.version + 1 } });
  };

  let generacionId = '';
  let cursoId = '';
  let traducidas: string[] = [];
  let espanol: { pantallaId: string; audioRecursoId: string | null; subtituloRecursoId: string | null }[] = [];
  beforeAll(async () => {
    const r = await e.preparar();
    generacionId = r.generacionId;
    const inicial = await e.correr(generacionId, proveedorSimulado(), ejecutores);
    if (inicial.estado !== 'COMPLETADO') throw new Error(`La generación inicial terminó en ${inicial.estado}`);
    cursoId = (await prisma.curso.findUniqueOrThrow({ where: { proyectoId: r.proyectoId } })).id;
    traducidas = pantallasDe(await documento()).filter((p) => p.narracion?.texto.es).slice(0, TRADUCIDAS).map((p) => p.id);
    await traducir(traducidas);
    // Un término del cliente en inglés y otro en español: en inglés solo se aplica el inglés.
    await prisma.pronunciacionTermino.createMany({ data: [
      { clienteId: e.ids.clienteId, idioma: 'en', escrito: 'LOTO', pronunciado: 'low-toe' },
      { clienteId: e.ids.clienteId, idioma: 'es', escrito: 'LOTO', pronunciado: 'ló-to' },
    ] });
    espanol = (await prisma.narracion.findMany({ where: { cursoId, idioma: 'es' }, select: { pantallaId: true, audioRecursoId: true, subtituloRecursoId: true }, orderBy: { pantallaId: 'asc' } }));
  }, 120_000);

  it('crea voz, boca y subtítulos en inglés solo para las pantallas traducidas, con la voz predeterminada y su procedencia', async () => {
    expect(await regenerar({ idioma: 'en' })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(TRADUCIDAS);
    expect(pedidosVoz.every((p) => p.idioma === 'en' && p.voz === VOZ_INGLES_PREDETERMINADA)).toBe(true);
    expect(pedidosVoz.every((p) => p.ssml.includes('[EN]') && !p.ssml.includes('ló-to'))).toBe(true);
    expect(pedidosBoca).toHaveLength(TRADUCIDAS);

    const filas = await prisma.narracion.findMany({ where: { cursoId, idioma: 'en' } });
    expect(filas.map((n) => n.pantallaId).sort()).toEqual([...traducidas].sort());
    expect(filas.every((n) => n.estado === 'ACTUALIZADA' && n.audioRecursoId && n.subtituloRecursoId && Array.isArray(n.bocas) && n.voz === VOZ_INGLES_PREDETERMINADA)).toBe(true);

    const doc = await documento();
    expect(esCursoValido(doc)).toBe(true);
    expect(pantallasDe(doc).filter((p) => !traducidas.includes(p.id)).map((p) => p.narracion?.porIdioma.en).filter(Boolean)).toEqual([]);
    for (const p of pantallasDe(doc).filter((x) => traducidas.includes(x.id))) {
      const en = p.narracion?.porIdioma.en;
      expect(en).toMatchObject({ estado: 'generado', voz: { proveedor: 'google', voz: VOZ_INGLES_PREDETERMINADA, velocidad: p.narracion!.porIdioma.es!.voz.velocidad ?? 1 } });
      expect(en!.duracionMs).toBeGreaterThan(0);
      expect(en!.bocas!.length).toBeGreaterThan(0);
      expect(en!.recursoAudioId).not.toBe(p.narracion!.porIdioma.es!.recursoAudioId);
    }
    const recursosEn = (doc as Doc).recursos.filter((r) => r.idioma === 'en');
    // La voz simulada es WAV; la de Google, MP3 (`pNN-en.mp3`).
    expect(recursosEn.filter((r) => r.tipo === 'audio').map((r) => r.nombre).sort()).toEqual(traducidas.map((id) => `${id}-en.wav`).sort());
    expect(recursosEn.filter((r) => r.tipo === 'subtitulos').map((r) => r.nombre).sort()).toEqual(traducidas.map((id) => `${id}-en.vtt`).sort());

    // REQ-062 · El MP3 con su proveedor de voz y el WebVTT con `aptio`.
    const audio = await prisma.recurso.findUniqueOrThrow({ where: { id: filas[0]!.audioRecursoId! } });
    expect(audio).toMatchObject({ tipo: 'AUDIO', nombre: `${filas[0]!.pantallaId}-en.wav` });
    expect(audio.proveedor && audio.modelo && audio.licencia).toBeTruthy();
    const vtt = await prisma.recurso.findUniqueOrThrow({ where: { id: filas[0]!.subtituloRecursoId! } });
    expect(vtt).toMatchObject({ tipo: 'SUBTITULO', nombre: `${filas[0]!.pantallaId}-en.vtt`, ...PROCEDENCIA_SUBTITULOS });
    expect(new TextDecoder().decode(almacen.get(vtt.claveS3))).toMatch(/^WEBVTT[\s\S]*\[EN\]/);

    // El español sigue igual: mismas filas, audios y subtítulos.
    expect(await prisma.narracion.findMany({ where: { cursoId, idioma: 'es' }, select: { pantallaId: true, audioRecursoId: true, subtituloRecursoId: true }, orderBy: { pantallaId: 'asc' } })).toEqual(espanol);
    expect((await etapaDe(generacionId, 'VOZ_ES')).detalle).toMatchObject({ texto: expect.stringContaining('en inglés') });
  }, 120_000);

  it('RN-07-1 · una segunda corrida sin cambios no vuelve a sintetizar ni a calcular bocas', async () => {
    const antes = await prisma.narracion.findMany({ where: { cursoId, idioma: 'en' }, orderBy: { pantallaId: 'asc' } });
    expect(await regenerar({ idioma: 'en' })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(0);
    expect(pedidosBoca).toHaveLength(0);
    expect((await prisma.narracion.findMany({ where: { cursoId, idioma: 'en' }, orderBy: { pantallaId: 'asc' } })).map((n) => n.audioRecursoId)).toEqual(antes.map((n) => n.audioRecursoId));
  }, 120_000);

  it('al cambiar el inglés de una pantalla, solo esa narración vuelve a decirse y el español no se toca', async () => {
    const [cambiada] = traducidas;
    await traducir([cambiada!], () => 'Welcome to this capsule on lockout and tagout.');
    // Lo que hace la API al guardar el curso (CursosService.guardar): el idioma que cambió queda desactualizado.
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: cambiada!, idioma: 'en' }, data: { estado: 'DESACTUALIZADA' } });
    const antes = new Map((await prisma.narracion.findMany({ where: { cursoId, idioma: 'en' } })).map((n) => [n.pantallaId, n.audioRecursoId]));
    expect(await regenerar({ idioma: 'en' })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz.map((p) => p.ssml)).toEqual([expect.stringContaining('Welcome to this capsule')]);
    const despues = await prisma.narracion.findMany({ where: { cursoId, idioma: 'en' } });
    expect(despues.filter((n) => n.audioRecursoId !== antes.get(n.pantallaId)).map((n) => n.pantallaId)).toEqual([cambiada]);
    expect(despues.every((n) => n.estado === 'ACTUALIZADA')).toBe(true);
    expect(await prisma.narracion.findMany({ where: { cursoId, idioma: 'es' }, select: { pantallaId: true, audioRecursoId: true, subtituloRecursoId: true }, orderBy: { pantallaId: 'asc' } })).toEqual(espanol);
    expect(esCursoValido(await documento())).toBe(true);
  }, 120_000);

  it('con la voz en inglés del kit, se usa esa; con pantallaIds y forzar, una toma nueva solo de esa pantalla', async () => {
    await prisma.kitMarca.upsert({
      where: { clienteId: e.ids.clienteId },
      create: { clienteId: e.ids.clienteId, estilo: 'Industrial', paleta: {}, tipografias: {}, voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 }, en: { proveedor: 'google', voz: 'en-US-Neural2-C', velocidad: 1.1 } } },
      update: { voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 }, en: { proveedor: 'google', voz: 'en-US-Neural2-C', velocidad: 1.1 } } },
    });
    // La pista ya tiene su voz: el kit cuenta para las pantallas que aún no la tienen. Se quita la de una para verlo.
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = structuredClone(c.documento) as unknown as Doc;
    const objetivo = traducidas[1]!;
    delete pantallasDe(doc).find((p) => p.id === objetivo)!.narracion!.porIdioma.en;
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object, version: c.version + 1 } });
    expect(await regenerar({ idioma: 'en', pantallaIds: [objetivo], forzar: true })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toEqual([expect.objectContaining({ idioma: 'en', voz: 'en-US-Neural2-C', velocidad: 1.1 })]);
    const pista = pantallasDe(await documento()).find((p) => p.id === objetivo)!.narracion!.porIdioma.en!;
    expect(pista).toMatchObject({ estado: 'generado', voz: { voz: 'en-US-Neural2-C', velocidad: 1.1 } });
  }, 120_000);
});
