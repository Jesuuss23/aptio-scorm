// HU-0703 · Regenerar solo las narraciones desactualizadas: decide el hash (RN-07-1), `pantallaIds` limita y `forzar`
// pide una toma nueva. Se reabren las etapas 6 y 7 de la misma generación, como hace la API. PostgreSQL real.
import { type CalculadorBocas, calculadorSimulado, type PedidoVoz, proveedorSimulado, type Sintetizador, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { marcasPalabra, retardoDeAncla } from '@aptio/schema/tiempos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEtapaBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { baseLista, escenario, etapaDe } from './apoyo-generacion.js';

/** SUP-36: «pasos» aparece en la narración de exactamente estas 4 pantallas del caso LOTO. */
const CON_PASOS = ['p02', 'p12', 'p15', 'p27'];

describe.skipIf(!baseLista && !process.env.CI)('regenerar narraciones (HU-0703)', () => {
  const e = escenario('regenerar');
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
    VOZ_ES: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }), BOCA: crearEtapaBoca({ calcular, leer }),
  };
  /** Lo que hace `POST /cursos/{id}/narraciones/regenerar`: guarda el pedido y reabre las etapas 6 y 7. */
  const regenerar = async (generacionId: string, pedido: { pantallaIds?: string[]; forzar?: boolean } = {}) => {
    const g = await prisma.generacion.findUniqueOrThrow({ where: { id: generacionId } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA', parametros: { ...(g.parametros as object), regenerarVoz: pedido } } });
    await prisma.generacionEtapa.updateMany({ where: { generacionId, etapa: { in: ['VOZ_ES', 'BOCA'] } }, data: { estado: 'EN_COLA' } });
    pedidosVoz = [];
    pedidosBoca = [];
    return e.correr(generacionId, proveedorSimulado(), ejecutores);
  };
  const estados = async (cursoId: string) => Object.fromEntries((await prisma.narracion.findMany({ where: { cursoId } })).map((n) => [n.pantallaId, n.estado]));
  const pantallaDe = (p: PedidoVoz) => p.ssml;

  let generacionId = '';
  let cursoId = '';
  beforeAll(async () => {
    const r = await e.preparar();
    generacionId = r.generacionId;
    const inicial = await e.correr(generacionId, proveedorSimulado(), ejecutores);
    if (inicial.estado !== 'COMPLETADO') throw new Error(`La generación inicial terminó en ${inicial.estado}`);
    cursoId = (await prisma.curso.findUniqueOrThrow({ where: { proyectoId: r.proyectoId } })).id;
  });

  it('una marcada «Por regenerar» que no cambió vuelve a «Lista» sin pagar otra voz', async () => {
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: { in: CON_PASOS } }, data: { estado: 'DESACTUALIZADA' } });
    expect(await regenerar(generacionId)).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(0);
    expect(pedidosBoca).toHaveLength(0);
    expect(Object.values(await estados(cursoId)).every((x) => x === 'ACTUALIZADA')).toBe(true);
  });

  it('CP-073 · al cambiar la pronunciación de «pasos», solo esas 4 se regeneran, con su boca', async () => {
    const antes = new Map((await prisma.narracion.findMany({ where: { cursoId } })).map((n) => [n.pantallaId, n.audioRecursoId]));
    await prisma.pronunciacionTermino.create({ data: { clienteId: e.ids.clienteId, idioma: 'es', escrito: 'pasos', pronunciado: 'pá-sos' } });
    // RN-02-4 (la API, HU-0205) las marca al guardar el diccionario.
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: { in: CON_PASOS } }, data: { estado: 'DESACTUALIZADA' } });
    expect(await regenerar(generacionId)).toEqual({ estado: 'COMPLETADO' });

    expect(pedidosVoz).toHaveLength(4);
    expect(pedidosVoz.every((p) => pantallaDe(p).includes('<sub alias="pá-sos">pasos</sub>'))).toBe(true);
    expect(pedidosBoca).toHaveLength(4);
    const despues = await prisma.narracion.findMany({ where: { cursoId } });
    expect(despues.every((n) => n.estado === 'ACTUALIZADA')).toBe(true);
    const conAudioNuevo = despues.filter((n) => n.audioRecursoId !== antes.get(n.pantallaId)).map((n) => n.pantallaId).sort();
    expect(conAudioNuevo).toEqual(CON_PASOS);
    const curso = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    expect(esCursoValido(curso.documento)).toBe(true);
    expect((await etapaDe(generacionId, 'VOZ_ES')).costoUsd.toNumber()).toBe(0);
  });

  it('con pantallaIds solo se tocan esas; las demás «Por regenerar» siguen así y la boca termina igual', async () => {
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: { in: ['p02', 'p12'] } }, data: { estado: 'DESACTUALIZADA' } });
    await prisma.pronunciacionTermino.updateMany({ where: { clienteId: e.ids.clienteId, escrito: 'pasos' }, data: { pronunciado: 'pa-sos' } });
    expect(await regenerar(generacionId, { pantallaIds: ['p02'] })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz.map((p) => pantallaDe(p))).toEqual([expect.stringContaining('pa-sos')]);
    const s = await estados(cursoId);
    expect(s.p02).toBe('ACTUALIZADA');
    expect(s.p12).toBe('DESACTUALIZADA');
    expect((await etapaDe(generacionId, 'BOCA')).estado).toBe('COMPLETADO');
  });

  it('forzar pide una toma nueva aunque nada haya cambiado', async () => {
    const antes = (await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p01' } })).audioRecursoId;
    expect(await regenerar(generacionId, { pantallaIds: ['p01'], forzar: true })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(1);
    expect(pedidosBoca).toHaveLength(1);
    expect((await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p01' } })).audioRecursoId).not.toBe(antes);
  });
  it('HU-0608 · CP-067: con la voz nueva, cada elemento anclado toma el segundo de su palabra; sin ella, «Revisar tiempo»', async () => {
    type Pd = { id: string; narracion: { texto: { es: string } }; ajustes?: Record<string, Record<string, unknown>> };
    type Doc = { modulos: { capsulas: { pantallas: Pd[] }[] }[] };
    const p05De = (d: unknown) => (d as Doc).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p05')!;
    const texto = 'Cualquier energía puede mover o liberar algo sin aviso.';
    // Lo que deja la API al corregir la narración: el dato ya apunta a «puede» (2); el texto, a una palabra que la voz no tiene.
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = structuredClone(c.documento) as unknown as Doc;
    const p05 = p05De(doc);
    p05.narracion.texto.es = texto;
    p05.ajustes = { 'p05-dato': { retardoS: 1.63, anclaPalabra: 2, color: 'acento' }, 'p05-texto': { retardoS: 2.47, anclaPalabra: 40 }, 'p05-imagen': { retardoS: 1 } };
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object, version: c.version + 1 } });
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId: 'p05' }, data: { estado: 'DESACTUALIZADA' } });

    expect(await regenerar(generacionId, { pantallaIds: ['p05'] })).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(1);
    const despues = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const nueva = p05De(despues.documento) as Pd & { narracion: { porIdioma: { es: { duracionMs: number } } } };
    const marcas = marcasPalabra(texto, nueva.narracion.porIdioma.es.duracionMs);
    expect(nueva.ajustes).toEqual({ 'p05-dato': { retardoS: retardoDeAncla(marcas, 2), anclaPalabra: 2, color: 'acento' }, 'p05-texto': { retardoS: 2.47 }, 'p05-imagen': { retardoS: 1 } });
    expect(nueva.ajustes!['p05-dato']!.retardoS).not.toBe(1.63);
    expect(esCursoValido(despues.documento)).toBe(true);
    expect(await prisma.observacion.findMany({ where: { cursoId, pantallaId: 'p05', origen: 'tiempo' } })).toMatchObject([
      { tipo: 'CALIDAD', severidad: 'aviso', mensaje: 'Revisar tiempo: la palabra de anclaje fue eliminada (p05-texto).' },
    ]);
  });
});
