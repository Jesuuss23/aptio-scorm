// HU-0504 · Propuestas de la IA (IA-16 v2): el worker calcula el cambio sobre una pantalla y lo guarda como Propuesta
// sin tocar el curso. PostgreSQL real; IA con las salidas grabadas del caso LOTO.
import { readFileSync } from 'node:fs';
import { prisma } from '@aptio/db';
import { TAREA_PROPUESTA } from '@aptio/schema/propuesta';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPropuestas, erroresPropuesta } from '../src/propuesta.js';
import { AI, baseLista, comoReal, escenario } from './apoyo-generacion.js';
import { proveedorSimulado, type ProveedorTexto } from '@aptio/ai';
import type { Redis } from 'ioredis';

const loto = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const redis = { publish: async () => 1 } as unknown as Redis;

describe.skipIf(!baseLista && !process.env.CI)('propuestas de la IA (HU-0504)', () => {
  const e = escenario('propuesta');
  let cursoId = '';
  let proyectoId = '';
  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
    cursoId = (await prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 12 } })).id;
  });
  afterAll(async () => {
    await prisma.propuesta.deleteMany({ where: { cursoId } });
    await e.borrar();
  });

  /** Lo que hace la API al pedir: un TrabajoIA en cola y el trabajo con el pedido. */
  const pedir = async (proveedor: ProveedorTexto, tipo: string, texto?: string, org = e.ids.orgId) => {
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_PROPUESTA, tipo: 'TEXTO', proveedor: '-', modelo: '-' } });
    const correr = crearPropuestas({ bd: prisma, redis, proveedor });
    const r = correr({ data: { trabajoId: t.id, organizacionId: org, tarea: TAREA_PROPUESTA, pantallaId: 'p05', propuesta: { cursoId, tipo, ...(texto ? { texto } : {}) } }, queueName: 'ia', updateProgress: async () => undefined });
    return { trabajoId: t.id, r };
  };

  it('CP-052 · «Más visual» guarda una propuesta con su patch y la versión base, sin tocar el curso', async () => {
    const proveedor = comoReal();
    const { trabajoId, r } = await pedir(proveedor, 'mas-visual');
    const { propuestaId } = await r;
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: propuestaId } });
    expect(p).toMatchObject({ cursoId, pantallaId: 'p05', tipo: 'mas-visual', titulo: 'Más visual', versionBase: 12, estado: 'PENDIENTE', trabajoIAId: trabajoId });
    expect((p.cambios as { patch: unknown[]; huella: string }).patch).toHaveLength(4);
    expect((p.cambios as { huella: string }).huella).toContain('"disposicion":"idea"');
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    expect(c.version).toBe(12);
    expect(c.documento).toEqual(loto());
    // El costo queda en el mismo TrabajoIA que creó la API, con la versión del prompt.
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', versionPrompt: 'IA-16.v2', proveedor: 'anthropic', intentos: 1 });
    // La pantalla va al prompt dentro de <material_cliente>, neutralizada y sin los datos de la voz.
    const mensaje = proveedor.llamadas[0]!.mensajes[0]!.texto;
    expect(mensaje).toContain('tipoPedido = "mas-visual"');
    expect(mensaje).toMatch(/<material_cliente archivo="pantalla del curso">\n\{/);
    expect(mensaje).not.toMatch(/hashTexto|recursoAudioId/);
  });

  it('«Ver 3 variantes» guarda las tres, cada una con su patch', async () => {
    const { propuestaId } = await (await pedir(proveedorSimulado(), 'variantes')).r;
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: propuestaId } });
    const variantes = (p.cambios as { variantes: { nombre: string; disposicion: string; patch: unknown[] }[] }).variantes;
    expect(variantes.map((v) => v.disposicion)).toEqual(['lista', 'dato', 'personaje']);
    expect(variantes.every((v) => v.patch.length > 0)).toBe(true);
  });

  it('un patch que toca la narración se reintenta con el error; si nunca sirve, el trabajo falla y no se guarda nada', async () => {
    const mala = JSON.stringify({ tipo: 'menos-texto', titulo: 'Menos texto', resumen: 'Acorta', patch: [{ op: 'replace', path: '/narracion/texto/es', value: 'Corto.' }] });
    const proveedor = comoReal({ [TAREA_PROPUESTA]: [mala] });
    const { trabajoId, r } = await pedir(proveedor, 'menos-texto');
    await r;
    expect(proveedor.llamadas).toHaveLength(2);
    expect(proveedor.llamadas[1]!.mensajes.at(-1)!.texto).toMatch(/«\/narracion\/texto\/es» no se puede cambiar/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', intentos: 2 });

    const antes = await prisma.propuesta.count({ where: { cursoId } });
    const siempreMala = comoReal({ [TAREA_PROPUESTA]: [mala, mala, mala] });
    const fallida = await pedir(siempreMala, 'menos-texto');
    await expect(fallida.r).rejects.toThrow(/no validó tras 3 intentos/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: fallida.trabajoId } })).toMatchObject({ estado: 'ERROR', intentos: 3 });
    expect(await prisma.propuesta.count({ where: { cursoId } })).toBe(antes);
  });

  it('rechaza un patch que no se aplica, uno que deja el curso inválido y una respuesta de otro tipo', () => {
    const doc = loto();
    const base = { tipo: 'libre', titulo: 'x', resumen: 'x' };
    expect(erroresPropuesta(doc, 'p05', 'libre', { ...base, patch: [{ op: 'remove', path: '/bloques/9' }] })[0]).toMatch(/no se aplica/);
    expect(erroresPropuesta(doc, 'p05', 'libre', { ...base, patch: [{ op: 'replace', path: '/disposicion', value: 'nada' }] })[0]).toMatch(/curso queda inválido/);
    expect(erroresPropuesta(doc, 'p05', 'actividad', { ...base, patch: [] })).toEqual(['El pedido es «actividad» y la respuesta es «libre»']);
  });

  it('no propone sobre el curso de otra organización', async () => {
    const { trabajoId, r } = await pedir(proveedorSimulado(), 'libre', undefined, '00000000-0000-4000-8000-000000000000');
    await expect(r).rejects.toThrow(/no existe en la organización/);
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('EN_COLA');
  });
});
