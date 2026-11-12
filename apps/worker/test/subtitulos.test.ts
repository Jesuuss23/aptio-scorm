// HU-0801 · Etapa 8 «Subtítulos»: un WebVTT por narración, enlazado a la narración y al curso (CP-075).
// PostgreSQL real; voz y boca simuladas y el almacenamiento, un mapa en memoria.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculadorSimulado, proveedorSimulado, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido, validarCurso } from '@aptio/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEtapaBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaSubtitulos, textoSubtitulos } from '../src/etapas/subtitulos.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { AI, baseLista, escenario, etapaDe } from './apoyo-generacion.js';

type Es = { estado: string; recursoAudioId?: string; bocas?: unknown[]; subtitulosId?: string };
type Doc = { recursos: { id: string; tipo: string; nombre: string; mime: string }[]; modulos: { capsulas: { pantallas: { id: string; narracion?: { porIdioma: { es: Es } } }[] }[] }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

describe('textos de la etapa 8', () => {
  it('dice cuántos subtítulos van', () => {
    expect(textoSubtitulos(10, 30, false)).toBe('10 de 30 subtítulos listos');
    expect(textoSubtitulos(30, 30, true)).toBe('30 narraciones con subtítulos sincronizados · WebVTT en español');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 8 en el generador', () => {
  const e = escenario('subtitulos');
  beforeAll(e.crear);
  afterAll(e.borrar);

  const almacen = new Map<string, { cuerpo: Uint8Array; mime: string }>();
  const subir = async (clave: string, cuerpo: Uint8Array, mime: string) => void almacen.set(clave, { cuerpo, mime });
  const leer = async (clave: string) => almacen.get(clave)!.cuerpo;
  let subidasVtt = 0;
  const contarSubidas = async (clave: string, cuerpo: Uint8Array, mime: string) => (subidasVtt++, subir(clave, cuerpo, mime));
  const ejecutores = () => ({
    RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS!,
    VOZ_ES: crearEtapaVoz({ sintetizar: async (p) => vozSimulada(p), subir, esperaMs: 0 }),
    BOCA: crearEtapaBoca({ calcular: calculadorSimulado, leer }),
    SUBTITULOS: crearEtapaSubtitulos({ subir: contarSubidas }),
  });
  const reabrir = async (generacionId: string, etapas: ('SUBTITULOS' | 'BOCA' | 'VOZ_ES' | 'ILUSTRACIONES')[]) => {
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: etapas } }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
  };

  it('CP-075 · cada narración tiene su VTT, el curso lo enlaza y la narración queda «generado»', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), ejecutores())).toEqual({ estado: 'COMPLETADO' });

    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const doc = curso.documento as unknown as Doc;
    const narradas = pantallas(doc).filter((p) => p.narracion);
    expect(narradas).toHaveLength(30);
    expect(subidasVtt).toBe(30);
    const etapa = await etapaDe(generacionId, 'SUBTITULOS');
    expect(etapa.detalle).toMatchObject({ texto: '30 narraciones con subtítulos sincronizados · WebVTT en español', datos: { total: 30, listas: 30, idioma: 'es' } });
    expect(etapa.costoUsd.toNumber()).toBe(0);

    const filas = await prisma.narracion.findMany({ where: { cursoId: curso.id } });
    for (const p of narradas) {
      const es = p.narracion!.porIdioma.es;
      expect(es.estado).toBe('generado');
      expect(es.subtitulosId).toBe(filas.find((n) => n.pantallaId === p.id)!.subtituloRecursoId);
      expect(doc.recursos.find((r) => r.id === es.subtitulosId)).toMatchObject({ tipo: 'subtitulos', nombre: `${p.id}-es.vtt`, mime: 'text/vtt' });
    }
    // Con la voz simulada, el VTT de p03 es el del caso LOTO.
    const p03 = filas.find((n) => n.pantallaId === 'p03')!;
    const recurso = await prisma.recurso.findUniqueOrThrow({ where: { id: p03.subtituloRecursoId! } });
    expect(recurso).toMatchObject({ tipo: 'SUBTITULO', origen: 'GENERADO', mime: 'text/vtt' });
    // HU-1406 · REQ-062 · Sin IA: proveedor `aptio`, con su modelo y licencia (SUP-64).
    expect(recurso).toMatchObject({ proveedor: 'aptio', modelo: 'subtitulos-por-letras v1', licencia: 'Generado por Aptio SCORM desde el guion' });
    expect(new TextDecoder().decode(almacen.get(recurso.claveS3)!.cuerpo)).toBe(readFileSync(join(AI, 'casos/loto/salidas/08-subtitulos-p03-es.vtt'), 'utf8'));
    expect(esCursoValido(doc)).toBe(true);
    // Ya no queda ninguna narración pendiente al exportar (cierra SUP-35).
    expect(validarCurso(doc).advertencias.filter((a) => a.startsWith('narración'))).toEqual([]);
    expect(await prisma.cursoVersion.count({ where: { cursoId: curso.id, motivo: 'subtitulos' } })).toBe(1);
    expect(await prisma.trabajoIA.count({ where: { generacionId, tarea: 'SUBTITULOS' } })).toBe(0);

    // Continuar no vuelve a escribir lo que ya tiene subtítulos.
    subidasVtt = 0;
    await reabrir(generacionId, ['SUBTITULOS']);
    expect(await e.correr(generacionId, proveedorSimulado(), ejecutores())).toEqual({ estado: 'COMPLETADO' });
    expect(subidasVtt).toBe(0);
  });

  it('un audio nuevo deja la narración sin subtítulos y «pendiente» hasta que la etapa 8 los rehace', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), ejecutores())).toEqual({ estado: 'COMPLETADO' });
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const doc = curso.documento as unknown as { modulos: { capsulas: { pantallas: { narracion?: { porIdioma: { es: { voz: { velocidad?: number } } } } }[] }[] }[] };
    doc.modulos[0]!.capsulas[0]!.pantallas[0]!.narracion!.porIdioma.es.voz.velocidad = 1.25;
    await prisma.curso.update({ where: { id: curso.id }, data: { documento: doc as object } });

    const { SUBTITULOS: _s, BOCA: _b, ...hasta6 } = ejecutores();
    await reabrir(generacionId, ['ILUSTRACIONES', 'VOZ_ES']);
    expect(await e.correr(generacionId, proveedorSimulado(), hasta6)).toEqual({ estado: 'COMPLETADO' });
    const p01 = await prisma.narracion.findFirstOrThrow({ where: { cursoId: curso.id, pantallaId: 'p01' } });
    expect(p01.subtituloRecursoId).toBeNull();
    const medio = pantallas((await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } })).documento as unknown as Doc);
    expect(medio[0]!.narracion!.porIdioma.es).toMatchObject({ estado: 'pendiente' });
    expect(medio[0]!.narracion!.porIdioma.es.subtitulosId).toBeUndefined();
    expect(medio[1]!.narracion!.porIdioma.es.estado).toBe('generado');

    subidasVtt = 0;
    await reabrir(generacionId, ['BOCA', 'SUBTITULOS']);
    expect(await e.correr(generacionId, proveedorSimulado(), ejecutores())).toEqual({ estado: 'COMPLETADO' });
    expect(subidasVtt).toBe(1);
    const fin = pantallas((await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } })).documento as unknown as Doc);
    expect(fin[0]!.narracion!.porIdioma.es.estado).toBe('generado');
  });

  it('sin la voz de la etapa 6 los subtítulos no se calculan y lo dice', async () => {
    const { generacionId } = await e.preparar();
    const { VOZ_ES: _v, BOCA: _b, ...sinVoz } = ejecutores();
    expect(await e.correr(generacionId, proveedorSimulado(), sinVoz)).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'SUBTITULOS')).detalle).toMatchObject({ texto: expect.stringMatching(/^Faltan 30 narraciones con audio/) });
  });
});
