// HU-0401 y HU-0408 · El orquestador corre las etapas en orden, guarda costo y avance, respeta la cancelación
// (CP-045) y al continuar no repite lo terminado (PostgreSQL real; Redis reemplazado para leer los eventos).
import { type ProveedorTexto, proveedorSimulado } from '@aptio/ai';
import type { EventoTrabajo } from '@aptio/colas';
import { prisma } from '@aptio/db';
import { DETALLE_PROXIMAMENTE, ETAPAS, TAREA_GENERAR } from '@aptio/schema/generacion';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearGenerador, type EjecutorEtapa } from '../src/generar.js';

const baseLista = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const variables = { cliente: { nombre: 'Minera Andina' }, documento: { id: 'd', nombre: 'm.pdf', rango: '1-2', texto_por_pagina: 'x' } };

describe.skipIf(!baseLista && !process.env.CI)('orquestador de la generación', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const eventos: EventoTrabajo[] = [];
  const redis = { publish: async (_canal: string, m: string) => (eventos.push(JSON.parse(m) as EventoTrabajo), 1) } as unknown as Redis;
  let orgId: string;
  let otraOrgId: string;
  let proyectoId: string;
  let usuarioId: string;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org generar', slug: `generar-${sufijo}` } })).id;
    otraOrgId = (await prisma.organizacion.create({ data: { nombre: 'Otra org', slug: `generar-otra-${sufijo}` } })).id;
    const cliente = await prisma.cliente.create({ data: { organizacionId: orgId, nombre: 'Minera' } });
    usuarioId = (await prisma.usuario.create({ data: { nombre: 'di', email: `gen-${sufijo}@prueba.test`, rol: 'DISENADOR_INSTRUCCIONAL', organizacionId: orgId } })).id;
    proyectoId = (await prisma.proyecto.create({ data: { organizacionId: orgId, clienteId: cliente.id, nombre: 'LOTO', creadoPorId: usuarioId } })).id;
  });

  afterAll(async () => {
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.proyecto.deleteMany({ where: { organizacionId: orgId } });
    await prisma.usuario.deleteMany({ where: { organizacionId: orgId } });
    await prisma.cliente.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [orgId, otraOrgId] } } });
  });

  beforeEach(() => {
    eventos.length = 0;
  });

  async function nuevaGeneracion() {
    await prisma.proyecto.update({ where: { id: proyectoId }, data: { estado: 'GENERANDO' } });
    return prisma.generacion.create({
      data: { organizacionId: orgId, proyectoId, iniciadoPorId: usuarioId, parametros: { pantallas: 30 }, etapas: { create: ETAPAS.map((etapa, i) => ({ etapa, orden: i + 1 })) } },
    });
  }
  const trabajo = (generacionId: string, organizacionId = orgId) => ({
    data: { trabajoId: generacionId, organizacionId, tarea: TAREA_GENERAR }, queueName: 'ia', updateProgress: async () => undefined,
  });
  const etapas = (generacionId: string) => prisma.generacionEtapa.findMany({ where: { generacionId }, orderBy: { orden: 'asc' } });
  /** Lo mismo que hace la API al cancelar (GeneracionesService.cancelar). */
  const cancelarComoApi = (generacionId: string) =>
    prisma.$transaction([
      prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'CANCELADO' } }),
      prisma.generacionEtapa.updateMany({ where: { generacionId, estado: { in: ['EN_COLA', 'EN_CURSO'] } }, data: { estado: 'CANCELADO' } }),
    ]);
  /** Lo mismo que hace la API al continuar (GeneracionesService.continuar). */
  const continuarComoApi = (generacionId: string) =>
    prisma.$transaction([
      prisma.generacionEtapa.updateMany({ where: { generacionId, estado: { in: ['ERROR', 'CANCELADO'] } }, data: { estado: 'EN_COLA' } }),
      prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA', terminadoEn: null } }),
    ]);

  // Proveedor con consumo real (12 000 de entrada y 2 500 de salida = 0,098 USD con claude-opus-5-5).
  const base = proveedorSimulado();
  const conCosto: ProveedorTexto = {
    nombre: 'anthropic', modeloPara: () => 'claude-opus-5-5',
    completar: async (p) => ({ ...(await base.completar(p)), modelo: 'claude-opus-5-5', consumo: { tokensEntrada: 12_000, tokensSalida: 2_500, tokensCacheLeidos: 0, tokensCacheEscritos: 0 } }),
  };

  it('CP-036 · corre las etapas en orden, suma el costo y deja en cola las que aún no existen', async () => {
    const g = await nuevaGeneracion();
    let recibido: unknown;
    const resumen: EjecutorEtapa = async (ctx) => {
      const r = await ctx.ia('IA-01', variables);
      return { texto: 'Resumen de 1 documento', datos: { temas: (r.datos as { temas: unknown[] }).temas.length } };
    };
    const estructura: EjecutorEtapa = async (ctx) => {
      recibido = ctx.anteriores.RESUMEN_MATERIAL;
      return { texto: '30 pantallas', datos: { pantallas: ctx.parametros.pantallas } };
    };
    const generar = crearGenerador({ bd: prisma, redis, proveedor: conCosto, ejecutores: { RESUMEN_MATERIAL: resumen, OBJETIVOS_ESTRUCTURA: estructura } });

    expect(await generar(trabajo(g.id))).toEqual({ estado: 'COMPLETADO' });
    const lista = await etapas(g.id);
    expect(lista.slice(0, 2).map((e) => e.estado)).toEqual(['COMPLETADO', 'COMPLETADO']);
    expect(Number(lista[0]!.costoUsd)).toBe(0.098);
    expect(lista[1]!.detalle).toEqual({ texto: '30 pantallas', datos: { pantallas: 30 } });
    expect(recibido).toEqual((lista[0]!.detalle as { datos: unknown }).datos);
    expect(lista.slice(2).every((e) => e.estado === 'EN_COLA' && (e.detalle as { texto: string }).texto === DETALLE_PROXIMAMENTE)).toBe(true);

    const final = await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } });
    expect(final.estado).toBe('COMPLETADO');
    expect(Number(final.costoUsd)).toBe(0.098);
    // Faltan etapas por habilitar: el proyecto vuelve a borrador, no a revisión.
    expect((await prisma.proyecto.findUniqueOrThrow({ where: { id: proyectoId } })).estado).toBe('BORRADOR');
    expect(await prisma.trabajoIA.count({ where: { generacionId: g.id, proyectoId, tarea: 'IA-01' } })).toBe(1);

    expect(eventos.map((e) => `${e.tarea}:${e.estado}`)).toEqual([
      'GENERAR:EN_CURSO', 'RESUMEN_MATERIAL:EN_CURSO', 'RESUMEN_MATERIAL:COMPLETADO', 'OBJETIVOS_ESTRUCTURA:EN_CURSO', 'OBJETIVOS_ESTRUCTURA:COMPLETADO', 'GENERAR:COMPLETADO',
    ]);
    expect(eventos.every((e) => e.trabajoId === g.id && e.organizacionId === orgId && e.cola === 'ia')).toBe(true);
    expect(eventos.at(-1)!.progreso).toBe(18);
  });

  it('CP-045 · cancelar a mitad de la etapa 3 conserva las etapas 1 y 2 y no guarda la 3', async () => {
    const g = await nuevaGeneracion();
    const llamadas: string[] = [];
    const hecho = (etapa: string): EjecutorEtapa => async () => (llamadas.push(etapa), { texto: `${etapa} lista`, datos: etapa });
    const generar = crearGenerador({
      bd: prisma, redis, proveedor: proveedorSimulado(),
      ejecutores: {
        RESUMEN_MATERIAL: hecho('1'), OBJETIVOS_ESTRUCTURA: hecho('2'),
        STORYBOARD_GUION: async () => {
          llamadas.push('3');
          await cancelarComoApi(g.id);
          return { texto: 'no debe guardarse' };
        },
        PANTALLAS: hecho('4'),
      },
    });

    expect(await generar(trabajo(g.id))).toEqual({ estado: 'CANCELADO' });
    expect(llamadas).toEqual(['1', '2', '3']);
    const lista = await etapas(g.id);
    expect(lista.slice(0, 4).map((e) => e.estado)).toEqual(['COMPLETADO', 'COMPLETADO', 'CANCELADO', 'CANCELADO']);
    expect(lista[2]!.detalle).toBeNull();
    expect((await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } })).estado).toBe('CANCELADO');
  });

  it('HU-0408 · un error detiene la generación y al continuar no se repite lo terminado', async () => {
    const g = await nuevaGeneracion();
    const llamadas: string[] = [];
    let falla = true;
    const generar = crearGenerador({
      bd: prisma, redis, proveedor: proveedorSimulado(),
      ejecutores: {
        RESUMEN_MATERIAL: async () => (llamadas.push('1'), { texto: 'resumen', datos: { ok: true } }),
        OBJETIVOS_ESTRUCTURA: async (ctx) => {
          llamadas.push('2');
          if (falla) throw new Error('El proveedor no respondió (529)');
          return { texto: `estructura con ${JSON.stringify(ctx.anteriores.RESUMEN_MATERIAL)}` };
        },
      },
    });

    expect(await generar(trabajo(g.id))).toEqual({ estado: 'ERROR' });
    let lista = await etapas(g.id);
    expect(lista[1]).toMatchObject({ estado: 'ERROR', detalle: { texto: 'El proveedor no respondió (529)' } });
    expect(lista[2]!.estado).toBe('EN_COLA');
    expect((await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } })).estado).toBe('ERROR');
    expect((await prisma.proyecto.findUniqueOrThrow({ where: { id: proyectoId } })).estado).toBe('BORRADOR');
    expect(eventos.at(-1)).toMatchObject({ tarea: TAREA_GENERAR, estado: 'ERROR', mensaje: 'El proveedor no respondió (529)' });

    falla = false;
    await continuarComoApi(g.id);
    expect(await generar(trabajo(g.id))).toEqual({ estado: 'COMPLETADO' });
    expect(llamadas).toEqual(['1', '2', '2']);
    lista = await etapas(g.id);
    // La etapa 2 recibe los datos de la 1 aunque se haya hecho en la corrida anterior.
    expect(lista[1]).toMatchObject({ estado: 'COMPLETADO', detalle: { texto: 'estructura con {"ok":true}' } });
  });

  it('no arranca una generación cancelada antes de empezar', async () => {
    const g = await nuevaGeneracion();
    await cancelarComoApi(g.id);
    let llamado = false;
    const generar = crearGenerador({ bd: prisma, redis, proveedor: proveedorSimulado(), ejecutores: { RESUMEN_MATERIAL: async () => ((llamado = true), { texto: '' }) } });
    expect(await generar(trabajo(g.id))).toEqual({ estado: 'CANCELADO' });
    expect(llamado).toBe(false);
    expect(eventos).toHaveLength(0);
  });

  it('nunca procesa la generación de otra organización', async () => {
    const g = await nuevaGeneracion();
    const generar = crearGenerador({ bd: prisma, redis, proveedor: proveedorSimulado(), ejecutores: {} });
    await expect(generar(trabajo(g.id, otraOrgId))).rejects.toBeInstanceOf(Error);
    expect((await prisma.generacion.findUniqueOrThrow({ where: { id: g.id } })).estado).toBe('EN_COLA');
  });
});
