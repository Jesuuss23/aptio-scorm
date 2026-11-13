// HU-0701 · Etapa 6 «Voz en español»: cada narración con la voz del kit y el diccionario del cliente, audio guardado
// con su duración y estado Lista (CP-071). PostgreSQL real; la voz es la simulada y el almacenamiento, un mapa.
import { duracionAudio, type PedidoVoz, type Sintetizador, VozNoDisponible, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import type { VozCurso } from '@aptio/schema/generacion';
import { proveedorSimulado } from '@aptio/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaVoz, textoVoz } from '../src/etapas/voz.js';
import { baseLista, escenario, etapaDe } from './apoyo-generacion.js';

type AudioDoc = { estado: string; recursoAudioId?: string; duracionMs?: number; hashTexto: string };
type Doc = { modulos: { capsulas: { pantallas: { id: string; narracion?: { texto: { es: string }; porIdioma: { es: AudioDoc } } }[] }[] }[]; recursos: { id: string; tipo: string; mime: string }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

describe('textos de la etapa 6', () => {
  it('resume las narraciones listas y su duración total', () => {
    expect(textoVoz(4, 30, false)).toBe('4 de 30 narraciones listas');
    expect(textoVoz(30, 30, true, 372_000, 'es-US-Neural2-A')).toBe('30 narraciones listas · 6 min 12 s de audio · voz es-US-Neural2-A');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 6 en el generador', () => {
  const e = escenario('voz');
  beforeAll(async () => {
    await e.crear();
    // Un término del diccionario que aparece en 7 narraciones del caso LOTO.
    await prisma.pronunciacionTermino.create({ data: { clienteId: e.ids.clienteId, idioma: 'es', escrito: 'candado', pronunciado: 'can-da-do' } });
  });
  afterAll(e.borrar);

  const subidos = new Map<string, { bytes: number; mime: string }>();
  const subir = async (clave: string, cuerpo: Uint8Array, mime: string) => void subidos.set(clave, { bytes: cuerpo.byteLength, mime });
  const contar = (base: Sintetizador = async (p) => vozSimulada(p)) => {
    const pedidos: PedidoVoz[] = [];
    const s: Sintetizador = async (p) => (pedidos.push(p), base(p));
    return { s, pedidos };
  };
  const hasta4 = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS! };

  it('CP-071 · al terminar la etapa 6 todas las pantallas con narración tienen audio y estado Lista', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    const { s, pedidos } = contar();
    const vistas: number[] = [];
    const conVistas: Sintetizador = async (p) => {
      const d = (await etapaDe(generacionId, 'VOZ_ES')).detalle as { datos?: VozCurso } | null;
      vistas.push(d?.datos?.narraciones.length ?? -1);
      return s(p);
    };
    const resultado = await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar: conVistas, subir, esperaMs: 0 }) });
    expect(resultado).toEqual({ estado: 'COMPLETADO' });

    // Ilustraciones (S9) quedó en espera y la generación siguió hasta la voz.
    expect((await etapaDe(generacionId, 'ILUSTRACIONES')).estado).toBe('EN_COLA');
    const etapa = await etapaDe(generacionId, 'VOZ_ES');
    expect(etapa.estado).toBe('COMPLETADO');
    const { texto, datos } = etapa.detalle as unknown as { texto: string; datos: VozCurso };

    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const doc = curso.documento as unknown as Doc;
    const narradas = pantallas(doc).filter((p) => p.narracion);
    expect(narradas.length).toBeGreaterThan(0);
    expect(datos).toMatchObject({ total: narradas.length, cursoId: curso.id, simulada: true });
    expect(datos.narraciones.map((n) => n.pantallaId)).toEqual(narradas.map((p) => p.id));
    expect(texto).toMatch(new RegExp(`^${narradas.length} narraciones listas · .* de audio · voz es-US-Neural2-A$`));

    // Cada narración: estado Lista (ACTUALIZADA), su audio guardado con la duración real del archivo.
    const filas = await prisma.narracion.findMany({ where: { cursoId: curso.id }, orderBy: { pantallaId: 'asc' } });
    expect(filas).toHaveLength(narradas.length);
    expect(filas.every((n) => n.estado === 'ACTUALIZADA' && n.idioma === 'es' && n.origen === 'tts' && n.audioRecursoId)).toBe(true);
    const audios = await prisma.recurso.findMany({ where: { id: { in: filas.map((n) => n.audioRecursoId!) } } });
    // HU-1406 · REQ-062: cada audio generado guarda proveedor, modelo (la voz) y licencia.
    expect(audios.every((r) => r.origen === 'GENERADO' && r.proveedor && r.modelo && r.licencia)).toBe(true);
    expect(audios).toHaveLength(narradas.length);
    expect(audios.every((r) => r.tipo === 'AUDIO' && r.origen === 'GENERADO' && r.mime === 'audio/wav' && (r.duracionMs ?? 0) >= 500 && subidos.has(r.claveS3))).toBe(true);

    // El curso sigue válido y cada pantalla apunta a su audio; queda pendiente de boca y subtítulos.
    expect(esCursoValido(curso.documento)).toBe(true);
    for (const p of narradas) {
      const es = p.narracion!.porIdioma.es;
      const fila = filas.find((n) => n.pantallaId === p.id)!;
      expect(es).toMatchObject({ estado: 'pendiente', recursoAudioId: fila.audioRecursoId, hashTexto: fila.textoHash });
      expect(es.duracionMs).toBe(audios.find((r) => r.id === fila.audioRecursoId)!.duracionMs);
      expect(doc.recursos.find((r) => r.id === fila.audioRecursoId)).toMatchObject({ tipo: 'audio', mime: 'audio/wav' });
    }
    expect(await prisma.cursoVersion.findFirst({ where: { cursoId: curso.id, version: curso.version } })).toMatchObject({ motivo: 'voz' });

    // El diccionario del cliente se aplica: «candado» va con su pronunciación en el SSML de las 7 que lo dicen.
    const conTermino = pedidos.filter((p) => p.ssml.includes('<sub alias="can-da-do">candado</sub>'));
    expect(conTermino).toHaveLength(7);
    expect(datos.narraciones.filter((n) => n.pronunciados.includes('candado')).map((n) => n.pantallaId)).toEqual(['p16', 'p17', 'p21', 'p24', 'p25', 'p27', 'p28']);
    expect(pedidos.every((p) => p.voz === 'es-US-Neural2-A' && p.idioma === 'es')).toBe(true);

    // Consumo registrado por narración; la voz simulada no cuesta.
    const trabajos = await prisma.trabajoIA.findMany({ where: { generacionId, tarea: 'VOZ' } });
    expect(trabajos).toHaveLength(narradas.length);
    expect(trabajos.every((t) => t.tipo === 'VOZ' && t.proveedor === 'simulado' && (t.caracteres ?? 0) > 0 && Number(t.costoUsd) === 0)).toBe(true);
    // Mientras corría, cada narración lista se veía sin esperar al resto.
    expect(vistas.some((n) => n > 0 && n < narradas.length)).toBe(true);
    // La duración guardada es la del audio recibido (se sintetizan 4 a la vez, así que se comparan como conjunto).
    const ordenar = (xs: (number | null)[]) => xs.map(Number).sort((a, b) => a - b);
    expect(ordenar(audios.map((r) => r.duracionMs))).toEqual(ordenar(pedidos.map((p) => duracionAudio(vozSimulada(p).audio, 'audio/wav'))));
  });

  it('si una narración falla 3 veces la etapa queda en error, y al continuar solo se paga la que faltaba', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), hasta4)).toEqual({ estado: 'COMPLETADO' });
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: ['ILUSTRACIONES', 'VOZ_ES'] } }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });

    const falla = contar(async (p) => {
      if (p.ssml.includes('bienvenida')) throw new VozNoDisponible('Google Text-to-Speech respondió 503');
      return vozSimulada(p);
    });
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar: falla.s, subir, esperaMs: 0 }) })).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'VOZ_ES')).detalle).toMatchObject({ texto: expect.stringMatching(/^La voz de la pantalla p01 falló 3 veces: Google Text-to-Speech respondió 503/) });
    expect(falla.pedidos.filter((p) => p.ssml.includes('bienvenida'))).toHaveLength(3);
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const listas = await prisma.narracion.count({ where: { cursoId: curso.id, estado: 'ACTUALIZADA' } });
    expect(await prisma.narracion.findFirst({ where: { cursoId: curso.id, pantallaId: 'p01' } })).toMatchObject({ estado: 'ERROR' });
    // Nada a medias en el curso: el documento sigue sin audios.
    expect(pantallas(curso.documento as unknown as Doc).every((p) => !p.narracion?.porIdioma.es.recursoAudioId)).toBe(true);

    // Continuar (lo que hace la API): solo se sintetizan las que no quedaron listas.
    await prisma.generacionEtapa.updateMany({ where: { generacionId, estado: 'ERROR' }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
    const bien = contar();
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar: bien.s, subir, esperaMs: 0 }) })).toEqual({ estado: 'COMPLETADO' });
    const total = (await prisma.narracion.count({ where: { cursoId: curso.id, estado: 'ACTUALIZADA' } }));
    expect(bien.pedidos).toHaveLength(total - listas);
    expect(bien.pedidos.some((p) => p.ssml.includes('bienvenida'))).toBe(true);
  });

  it('una voz de un proveedor sin ejecutor deja la etapa en error con el motivo', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), hasta4)).toEqual({ estado: 'COMPLETADO' });
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const doc = curso.documento as unknown as { modulos: { capsulas: { pantallas: { narracion?: { porIdioma: { es: { voz: { proveedor: string } } } } }[] }[] }[] };
    for (const p of doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas))) if (p.narracion) p.narracion.porIdioma.es.voz.proveedor = 'azure';
    await prisma.curso.update({ where: { id: curso.id }, data: { documento: doc as object } });
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: ['ILUSTRACIONES', 'VOZ_ES'] } }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
    const { s, pedidos } = contar();
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar: s, subir, esperaMs: 0 }) })).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'VOZ_ES')).detalle).toMatchObject({ texto: 'La voz de azure todavía no está disponible: elige Google o ElevenLabs en Empresa › Conexiones IA' });
    expect(pedidos).toHaveLength(0);
  });
});
