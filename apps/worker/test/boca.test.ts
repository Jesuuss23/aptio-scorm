// HU-0702 · Etapa 7 «Boca del personaje»: marcas de boca desde cada audio, guardadas en la narración y en el curso.
// PostgreSQL real; voz y boca simuladas y el almacenamiento, un mapa en memoria.
import { BocaNoDisponible, type CalculadorBocas, calculadorSimulado, proveedorSimulado, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEtapaBoca, textoBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { baseLista, escenario, etapaDe, leerCaso } from './apoyo-generacion.js';

type Doc = { modulos: { capsulas: { pantallas: { id: string; narracion?: { texto: { es: string }; porIdioma: { es: { estado: string; bocas?: [number, string][] } } } }[] }[] }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

describe('textos de la etapa 7', () => {
  it('dice cuántas bocas van y cómo se calcularon', () => {
    expect(textoBoca(12, 30, false)).toBe('12 de 30 bocas listas');
    expect(textoBoca(30, 30, true, 'rhubarb')).toBe('30 narraciones con boca sincronizada · calculada desde el audio');
    expect(textoBoca(30, 30, true)).toBe('30 narraciones con boca sincronizada · simulada por letras');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 7 en el generador', () => {
  const e = escenario('boca');
  beforeAll(e.crear);
  afterAll(e.borrar);

  const almacen = new Map<string, Uint8Array>();
  const subir = async (clave: string, cuerpo: Uint8Array) => void almacen.set(clave, cuerpo);
  const leer = async (clave: string) => {
    const x = almacen.get(clave);
    if (!x) throw new Error(`no existe ${clave}`);
    return x;
  };
  const contar = (base: CalculadorBocas = calculadorSimulado) => {
    const pedidos: string[] = [];
    const c: CalculadorBocas = async (p) => (pedidos.push(p.texto), base(p));
    return { c, pedidos };
  };
  const hasta6 = {
    RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS!,
    VOZ_ES: crearEtapaVoz({ sintetizar: async (p) => vozSimulada(p), subir, esperaMs: 0 }),
  };
  const reabrir = async (generacionId: string, etapas: ('BOCA' | 'VOZ_ES' | 'ILUSTRACIONES')[]) => {
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: etapas } }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
  };

  it('al terminar la etapa 7 cada narración tiene sus marcas de boca, en la narración y en el curso', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    const { c, pedidos } = contar();
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta6, BOCA: crearEtapaBoca({ calcular: c, leer }) })).toEqual({ estado: 'COMPLETADO' });

    const etapa = await etapaDe(generacionId, 'BOCA');
    expect(etapa.estado).toBe('COMPLETADO');
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const narradas = pantallas(curso.documento as unknown as Doc).filter((p) => p.narracion);
    expect(etapa.detalle).toMatchObject({ texto: `${narradas.length} narraciones con boca sincronizada · simulada por letras`, datos: { total: narradas.length, listas: narradas.length, metodo: 'simulado' } });
    expect(pedidos).toHaveLength(narradas.length);

    const filas = await prisma.narracion.findMany({ where: { cursoId: curso.id } });
    expect(filas.every((n) => Array.isArray(n.bocas) && (n.bocas as unknown[]).length > 1)).toBe(true);
    for (const p of narradas) {
      const b = p.narracion!.porIdioma.es.bocas!;
      expect(b).toEqual(filas.find((n) => n.pantallaId === p.id)!.bocas);
      expect(b.at(-1)![1]).toBe('X');
      // Sigue pendiente hasta los subtítulos (HU-0801): el esquema pide audio, boca y subtítulos para «generado».
      expect(p.narracion!.porIdioma.es.estado).toBe('pendiente');
    }
    // Con la voz simulada (65 ms por letra) la pantalla p03 da las mismas marcas que el caso LOTO.
    expect(narradas.find((p) => p.id === 'p03')!.narracion!.porIdioma.es.bocas).toEqual((leerCaso('07-boca-p03.json') as { bocas: unknown }).bocas);
    expect(esCursoValido(curso.documento)).toBe(true);
    expect(await prisma.cursoVersion.count({ where: { cursoId: curso.id, motivo: 'boca' } })).toBe(1);
    // Es local y sin costo: no hay tareas de IA de boca.
    expect(await prisma.trabajoIA.count({ where: { generacionId, tarea: 'BOCA' } })).toBe(0);

    // Continuar no recalcula lo que ya tiene boca para su audio.
    await reabrir(generacionId, ['BOCA']);
    const otra = contar();
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta6, BOCA: crearEtapaBoca({ calcular: otra.c, leer }) })).toEqual({ estado: 'COMPLETADO' });
    expect(otra.pedidos).toHaveLength(0);
  });

  it('si Rhubarb falla, la etapa queda en error con la pantalla y el curso no recibe marcas a medias', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    const falla = contar(async (p) => {
      if (p.texto.startsWith('Hola')) throw new BocaNoDisponible('Rhubarb Lip Sync no está instalado en el worker (RHUBARB_PATH=rhubarb)');
      return calculadorSimulado(p);
    });
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta6, BOCA: crearEtapaBoca({ calcular: falla.c, leer }) })).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'BOCA')).detalle).toMatchObject({ texto: expect.stringMatching(/^La boca de la pantalla p\d+ no se pudo calcular: Rhubarb Lip Sync no está instalado/) });
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    expect(pantallas(curso.documento as unknown as Doc).every((p) => !p.narracion?.porIdioma.es.bocas)).toBe(true);
  });

  it('sin la voz de la etapa 6 la boca no se calcula y lo dice', async () => {
    const { generacionId } = await e.preparar();
    const { VOZ_ES: _sinVoz, ...sinVoz } = hasta6;
    expect(await e.correr(generacionId, proveedorSimulado(), { ...sinVoz, BOCA: crearEtapaBoca({ calcular: calculadorSimulado, leer }) })).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'BOCA')).detalle).toMatchObject({ texto: expect.stringMatching(/^Faltan 30 narraciones con audio \(p01, p02, p03\): la etapa 6/) });
  });

  it('un audio nuevo deja sin boca a la narración hasta que la etapa 7 la recalcula', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta6, BOCA: crearEtapaBoca({ calcular: calculadorSimulado, leer }) })).toEqual({ estado: 'COMPLETADO' });
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    // La voz cambia de velocidad: otro hash, otro audio.
    const doc = curso.documento as unknown as { modulos: { capsulas: { pantallas: { narracion?: { porIdioma: { es: { voz: { velocidad?: number } } } } }[] }[] }[] };
    doc.modulos[0]!.capsulas[0]!.pantallas[0]!.narracion!.porIdioma.es.voz.velocidad = 1.25;
    await prisma.curso.update({ where: { id: curso.id }, data: { documento: doc as object } });
    await reabrir(generacionId, ['ILUSTRACIONES', 'VOZ_ES']);
    expect(await e.correr(generacionId, proveedorSimulado(), hasta6)).toEqual({ estado: 'COMPLETADO' });
    const p01 = await prisma.narracion.findFirstOrThrow({ where: { cursoId: curso.id, pantallaId: 'p01' } });
    expect(p01.bocas).toBeNull();
    const despues = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(pantallas(despues.documento as unknown as Doc)[0]!.narracion!.porIdioma.es.bocas).toBeUndefined();
    expect(pantallas(despues.documento as unknown as Doc)[1]!.narracion!.porIdioma.es.bocas).toBeDefined();
  });
});
