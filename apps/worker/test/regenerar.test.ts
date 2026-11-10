// HU-0703 · Regenerar solo las narraciones desactualizadas: decide el hash (RN-07-1), `pantallaIds` limita y `forzar`
// pide una toma nueva. Se reabren las etapas 6 y 7 de la misma generación, como hace la API. PostgreSQL real.
import { type CalculadorBocas, calculadorSimulado, type PedidoVoz, proveedorSimulado, type Sintetizador, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
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
});
