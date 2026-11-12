// HU-0903 · Pausas propuestas por la IA (IA-09 v2, CP-082): con la transcripción del video del cliente dentro de
// <material_cliente>, el worker guarda la Propuesta de tipo pausas-video de la pantalla sin tocar el curso. Una salida que
// no cumple `erroresPausas` (un tema sin marcador o un marcador en mitad de una frase) se reintenta con los errores.
// PostgreSQL real; IA con las salidas grabadas del caso LOTO.
import { readFileSync } from 'node:fs';
import { prisma } from '@aptio/db';
import { huellaPantalla } from '@aptio/schema/propuesta';
import { TAREA_PAUSAS, tramos } from '@aptio/schema/pausas';
import type { CursoDoc } from '@aptio/schema/revision';
import type { ProveedorTexto } from '@aptio/ai';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPausas } from '../src/pausas.js';
import { AI, baseLista, comoReal, escenario } from './apoyo-generacion.js';

const loto = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const grabada = JSON.parse(readFileSync(`${AI}/casos/loto/salidas/X-IA-09-pausas-p18.json`, 'utf8'));
const { segmentos } = JSON.parse(readFileSync(`${AI}/casos/loto/entrada/transcripcion-procedimiento.json`, 'utf8'));
const redis = { publish: async () => 1 } as unknown as Redis;

describe.skipIf(!baseLista && !process.env.CI)('pausas propuestas desde la transcripción (HU-0903)', () => {
  const e = escenario('pausas');
  let cursoId = '';
  let proyectoId = '';
  let materialId = '';
  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
    cursoId = (await prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 6 } })).id;
    materialId = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'VIDEO', estado: 'listo', transcripcion: segmentos } })).id;
  });
  afterAll(async () => {
    await prisma.propuesta.deleteMany({ where: { cursoId } });
    await e.borrar();
  });

  const pedir = async (proveedor: ProveedorTexto) => {
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_PAUSAS, tipo: 'TEXTO', proveedor: '-', modelo: '-' } });
    const correr = crearPausas({ bd: prisma, redis, proveedor });
    const r = correr({
      data: { trabajoId: t.id, organizacionId: e.ids.orgId, tarea: TAREA_PAUSAS, pantallaId: 'p18', propuesta: { cursoId, tipo: 'pausas-video', bloqueId: 'p18-video', materialId } },
      queueName: 'ia', updateProgress: async () => undefined,
    });
    return { trabajoId: t.id, r };
  };

  it('CP-082 · una transcripción con 4 cambios de tema da al menos un marcador por cambio, para aplicar o descartar', async () => {
    const proveedor = comoReal();
    const { trabajoId, r } = await pedir(proveedor);
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: (await r).propuestaId } });
    expect(p).toMatchObject({
      cursoId, pantallaId: 'p18', tipo: 'pausas-video', titulo: '8 pausas propuestas desde la transcripción', versionBase: 6, estado: 'PENDIENTE', trabajoIAId: trabajoId,
      descripcion: '4 cambios de tema: Preparar y avisar (0:30), Apagar y aislar (1:02), Bloquear y etiquetar (1:35), Verificar energía cero (2:05).',
    });
    const cambios = p.cambios as { bloqueId: string; duracionMs: number; cambiosTema: { tiempoMs: number }[]; marcadores: { id: string; tiempoMs: number; origen: unknown }[]; observaciones: string[]; huella: string };
    expect(cambios).toMatchObject({ bloqueId: 'p18-video', duracionMs: 150000, observaciones: grabada.observaciones, huella: huellaPantalla((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as unknown as CursoDoc, 'p18') });
    expect(cambios.cambiosTema).toHaveLength(4);
    for (const t of tramos(cambios.cambiosTema as never, 150000)) expect(cambios.marcadores.some((m) => m.tiempoMs >= t.desde && m.tiempoMs <= t.hasta)).toBe(true);
    expect(cambios.marcadores.every((m) => JSON.stringify(m.origen) === JSON.stringify({ tipo: 'ia', revisado: false }))).toBe(true);
    // El curso no cambia hasta aplicar.
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento).toEqual(loto());
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', versionPrompt: 'IA-09.v2', intentos: 1 });
    // El prompt lleva la transcripción con tiempos dentro de <material_cliente> y los marcadores que ya existen.
    const mensaje = proveedor.llamadas[0]!.mensajes[0]!.texto;
    expect(mensaje).toContain('<material_cliente archivo="procedimiento-loto.mp4" tipo="transcripcion">\n[0–9500 ms] En este video verás');
    expect(mensaje).toContain('[41000–52000 ms] Luego avisa a los afectados');
    expect(mensaje).toContain('de 150000 ms');
    expect(mensaje).toContain('1:02 pregunta: ¿Qué hizo el técnico justo después de apagar?');
  });

  it('una salida con un tema sin marcador o un marcador en mitad de una frase se reintenta con los errores', async () => {
    const sinTema = { ...grabada, marcadores: grabada.marcadores.filter((m: { tiempoMs: number }) => m.tiempoMs < 125000) };
    const enMedio = { ...grabada, marcadores: grabada.marcadores.map((m: { id: string }) => (m.id === 'ia-2' ? { ...m, tiempoMs: 47000 } : m)) };
    const proveedor = comoReal({ [TAREA_PAUSAS]: [JSON.stringify(sinTema), JSON.stringify(enMedio)] });
    const { trabajoId, r } = await pedir(proveedor);
    await r;
    expect(proveedor.llamadas).toHaveLength(3);
    expect(proveedor.llamadas[1]!.mensajes.at(-1)!.texto).toMatch(/el tema «Verificar energía cero» \(2:05 a 2:30\) no tiene ningún marcador/);
    expect(proveedor.llamadas[2]!.mensajes.at(-1)!.texto).toMatch(/0:47 cae en mitad de una frase/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', intentos: 3 });
  });

  it('sin transcripción el trabajo queda en error y no se guarda propuesta', async () => {
    await prisma.materialFuente.update({ where: { id: materialId }, data: { transcripcion: [] } });
    const antes = await prisma.propuesta.count({ where: { cursoId } });
    const { trabajoId, r } = await pedir(comoReal());
    await expect(r).rejects.toThrow('El video no tiene transcripción');
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'ERROR', error: 'El video no tiene transcripción' });
    expect(await prisma.propuesta.count({ where: { cursoId } })).toBe(antes);
    await prisma.materialFuente.update({ where: { id: materialId }, data: { transcripcion: segmentos } });
  });
});
