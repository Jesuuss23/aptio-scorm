// HU-1301 · Cada tarea de IA deja su TrabajoIA con proveedor, modelo, consumo y costo, también si falla (CP-096, CP-041).
import { leerSalidaSimulada, type ProveedorTexto, proveedorSimulado, SalidaNoValida } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tareaRegistrada } from '../src/ia.js';

const baseLista = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const variables = { cliente: { nombre: 'Minera Andina' }, documento: { id: 'doc-1', nombre: 'm.pdf', rango: '1-2', texto_por_pagina: 'x' } };

describe.skipIf(!baseLista && !process.env.CI)('registro de trabajos de IA', () => {
  const sufijo = Math.random().toString(36).slice(2, 8);
  let orgId: string;

  beforeAll(async () => {
    orgId = (await prisma.organizacion.create({ data: { nombre: 'Org IA', slug: `ia-${sufijo}` } })).id;
  });
  afterAll(async () => {
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: orgId } });
    await prisma.organizacion.delete({ where: { id: orgId } });
  });

  it('CP-096 · una tarea terminada deja proveedor, modelo, versión, consumo y costo', async () => {
    // Un proveedor con consumo real, como lo informaría la API.
    const base = proveedorSimulado();
    const proveedor: ProveedorTexto = {
      nombre: 'anthropic', modeloPara: () => 'claude-opus-5-5',
      completar: async (p) => ({ ...(await base.completar(p)), modelo: 'claude-opus-5-5', consumo: { tokensEntrada: 12_000, tokensSalida: 2_500, tokensCacheLeidos: 0, tokensCacheEscritos: 0 } }),
    };
    const r = await tareaRegistrada(prisma, { organizacionId: orgId }, proveedor, 'IA-01', variables);
    expect(r.datos).toEqual({ ...(leerSalidaSimulada('IA-01').datos as object), documentoId: 'doc-1' });
    const t = await prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.trabajoId } });
    expect(t).toMatchObject({
      tarea: 'IA-01', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', versionPrompt: 'IA-01.v1', estado: 'COMPLETADO',
      tokensEntrada: 12_000, tokensSalida: 2_500, intentos: 1, error: null,
    });
    expect(Number(t.costoUsd)).toBe(0.098);
  });

  it('CP-041 · tras 3 salidas inválidas queda en ERROR con los intentos y el motivo', async () => {
    const malo = JSON.stringify({ documentoId: 'd' });
    const e = await tareaRegistrada(prisma, { organizacionId: orgId }, proveedorSimulado({ 'IA-01': [malo, malo, malo] }), 'IA-01', variables).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SalidaNoValida);
    const t = await prisma.trabajoIA.findFirstOrThrow({ where: { organizacionId: orgId, estado: 'ERROR' } });
    expect(t).toMatchObject({ intentos: 3, proveedor: 'simulado' });
    expect(t.error).toContain('no validó tras 3 intentos');
  });

  it('un error del proveedor también queda registrado', async () => {
    const roto: ProveedorTexto = { nombre: 'anthropic', modeloPara: () => 'claude-opus-5-5', completar: () => Promise.reject(new Error('529 sobrecargado')) };
    await expect(tareaRegistrada(prisma, { organizacionId: orgId }, roto, 'IA-01', variables)).rejects.toThrow('529');
    expect(await prisma.trabajoIA.count({ where: { organizacionId: orgId, error: '529 sobrecargado' } })).toBe(1);
  });
});
