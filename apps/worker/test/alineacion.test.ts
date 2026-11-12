// HU-1002 · Corregir la alineación con IA (IA-17 v2, CP-084): el worker manda las alertas vigentes y las pantallas con
// sus rutas, y guarda la corrección como Propuesta de tipo alineacion del curso entero, sin tocar el curso. Una salida
// fuera de lo permitido se reintenta con los errores. PostgreSQL real; IA con las salidas grabadas del caso LOTO.
import { readFileSync } from 'node:fs';
import { prisma } from '@aptio/db';
import { TAREA_CORRECCION } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import { proveedorSimulado, type ProveedorTexto } from '@aptio/ai';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCorrecciones, pantallasParaPrompt } from '../src/alineacion.js';
import { AI, baseLista, comoReal, escenario } from './apoyo-generacion.js';

const loto = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const grabada = JSON.parse(readFileSync(`${AI}/casos/loto/salidas/X-IA-17-alineacion.json`, 'utf8'));
const redis = { publish: async () => 1 } as unknown as Redis;

describe.skipIf(!baseLista && !process.env.CI)('corrección de la alineación con IA (HU-1002)', () => {
  const e = escenario('alineacion');
  let cursoId = '';
  let proyectoId = '';
  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
    cursoId = (await prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 7 } })).id;
  });
  afterAll(async () => {
    await prisma.propuesta.deleteMany({ where: { cursoId } });
    await e.borrar();
  });

  /** Lo que hace la API al pedir: un TrabajoIA en cola y el trabajo con el pedido. */
  const pedir = async (proveedor: ProveedorTexto, org = e.ids.orgId) => {
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_CORRECCION, tipo: 'TEXTO', proveedor: '-', modelo: '-' } });
    const progresos: number[] = [];
    const correr = crearCorrecciones({ bd: prisma, redis, proveedor });
    const r = correr({ data: { trabajoId: t.id, organizacionId: org, tarea: TAREA_CORRECCION, propuesta: { cursoId, tipo: 'alineacion' } }, queueName: 'ia', updateProgress: async (p) => void progresos.push(p) });
    return { trabajoId: t.id, r, progresos };
  };

  it('CP-084 · guarda la corrección de LOTO como propuesta del curso con la versión base, sin tocar el curso', async () => {
    const proveedor = comoReal();
    const { trabajoId, r, progresos } = await pedir(proveedor);
    const { propuestaId } = await r;
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: propuestaId } });
    expect(p).toMatchObject({ cursoId, pantallaId: null, tipo: 'alineacion', titulo: 'Corregir 2 alertas de alineación', versionBase: 7, estado: 'PENDIENTE', trabajoIAId: trabajoId });
    expect(p.descripcion).toBe(grabada.resumen);
    expect(p.cambios).toEqual({ patch: grabada.patch, correcciones: grabada.cambios, huella: null });
    expect(progresos).toEqual([100]);
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    expect(c.version).toBe(7);
    expect(c.documento).toEqual(loto());
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', versionPrompt: 'IA-17.v2', proveedor: 'anthropic', intentos: 1 });
    // El prompt lleva las alertas vigentes y las pantallas dentro de <material_cliente>, con sus rutas y sin la voz.
    const mensaje = proveedor.llamadas[0]!.mensajes[0]!.texto;
    expect(mensaje).toContain('Se evalúa solo en «recordar», menor que «aplicar»');
    expect(mensaje).toMatch(/<material_cliente archivo="pantallas del curso">\n\[/);
    expect(mensaje).toContain('"ruta": "/modulos/0/capsulas/0/pantallas/27/bloques/1/interaccion/datos/preguntas/5"');
    expect(mensaje).not.toMatch(/hashTexto|recursoAudioId/);
  });

  it('las pantallas del prompt son las que cuentan, con su rol y sus preguntas', () => {
    const pantallas = pantallasParaPrompt(loto() as CursoDoc) as { id: string; rol: string; preguntas?: { id: string; nivelBloom: string }[] }[];
    expect(pantallas.map((p) => p.id)).not.toContain('p01');
    const p28 = pantallas.find((p) => p.id === 'p28')!;
    expect(p28.rol).toBe('E');
    expect(p28.preguntas!.map((q) => [q.id, q.nivelBloom])).toContainEqual(['bq-06', 'recordar']);
  });

  it('una salida que toca rutas prohibidas o deja alertas se reintenta con el error; si nunca sirve, falla y no guarda nada', async () => {
    const fuera = JSON.stringify({ ...grabada, patch: [{ op: 'replace', path: '/seguimiento/notaMinima', value: 0 }] });
    const proveedor = comoReal({ [TAREA_CORRECCION]: [fuera] });
    const { trabajoId, r } = await pedir(proveedor);
    await r;
    expect(proveedor.llamadas).toHaveLength(2);
    expect(proveedor.llamadas[1]!.mensajes.at(-1)!.texto).toMatch(/«\/seguimiento\/notaMinima» no se puede cambiar/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', intentos: 2 });

    // Solo la pregunta de obj-3: obj-2 sigue con su alerta.
    const incompleta = JSON.stringify({ ...grabada, patch: grabada.patch.slice(0, 1) });
    const antes = await prisma.propuesta.count({ where: { cursoId } });
    const siempreMala = comoReal({ [TAREA_CORRECCION]: [incompleta, incompleta, incompleta] });
    const fallida = await pedir(siempreMala);
    await expect(fallida.r).rejects.toThrow(/no validó tras 3 intentos/);
    expect(siempreMala.llamadas[1]!.mensajes.at(-1)!.texto).toMatch(/pregunta bq-10 no está en p28|obj-2 sigue con alertas/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: fallida.trabajoId } })).toMatchObject({ estado: 'ERROR', intentos: 3 });
    expect(await prisma.propuesta.count({ where: { cursoId } })).toBe(antes);
  });

  it('no corrige el curso de otra organización', async () => {
    const { trabajoId, r } = await pedir(proveedorSimulado(), '00000000-0000-4000-8000-000000000000');
    await expect(r).rejects.toThrow(/no existe en la organización/);
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('EN_COLA');
  });
});
