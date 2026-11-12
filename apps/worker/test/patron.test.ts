// HU-1104 · Patrón de navegación con IA (IA-14 v2, CP-088): el worker manda el contexto del curso y, al crear, la
// descripción dentro de <material_cliente>; guarda la Propuesta de tipo patron del curso entero sin tocar el curso. Un
// nombre largo se recorta a 60 caracteres y una salida que no cumple `erroresPatron` se reintenta con los errores.
// PostgreSQL real; IA con las salidas grabadas del caso LOTO.
import { readFileSync } from 'node:fs';
import { prisma } from '@aptio/db';
import { TAREA_PATRON } from '@aptio/schema/navegacion';
import type { ProveedorTexto } from '@aptio/ai';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPatrones } from '../src/patron.js';
import { AI, baseLista, comoReal, escenario } from './apoyo-generacion.js';

const loto = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const recomendada = JSON.parse(readFileSync(`${AI}/casos/loto/salidas/04-IA-14-navegacion.json`, 'utf8'));
const creada = JSON.parse(readFileSync(`${AI}/casos/loto/salidas/X-IA-14-patron-tablero.json`, 'utf8'));
const redis = { publish: async () => 1 } as unknown as Redis;

describe.skipIf(!baseLista && !process.env.CI)('patrón de navegación con IA (HU-1104)', () => {
  const e = escenario('patron');
  let cursoId = '';
  let proyectoId = '';
  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
    cursoId = (await prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: loto(), version: 4 } })).id;
  });
  afterAll(async () => {
    await prisma.propuesta.deleteMany({ where: { cursoId } });
    await e.borrar();
  });

  const pedir = async (proveedor: ProveedorTexto, modo: string, texto?: string) => {
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_PATRON, tipo: 'TEXTO', proveedor: '-', modelo: '-' } });
    const correr = crearPatrones({ bd: prisma, redis, proveedor });
    const r = correr({ data: { trabajoId: t.id, organizacionId: e.ids.orgId, tarea: TAREA_PATRON, propuesta: { cursoId, tipo: 'patron', modo, ...(texto ? { texto } : {}) } }, queueName: 'ia', updateProgress: async () => undefined });
    return { trabajoId: t.id, r };
  };

  it('CP-088 · «tablero de misiones de seguridad» queda como propuesta de un personalizado válido, sin tocar el curso', async () => {
    const proveedor = comoReal();
    const { trabajoId, r } = await pedir(proveedor, 'crear', 'tablero de misiones de seguridad');
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: (await r).propuestaId } });
    expect(p).toMatchObject({ cursoId, pantallaId: null, tipo: 'patron', titulo: 'Patrón nuevo: Tablero de misiones de seguridad', versionBase: 4, estado: 'PENDIENTE', trabajoIAId: trabajoId });
    expect(p.descripcion).toBe(creada.recomendado.motivo);
    expect(p.cambios).toEqual({ modo: 'crear', navegacion: creada.navegacion, recomendado: creada.recomendado, alternativa: creada.alternativa, descripcion: 'tablero de misiones de seguridad', huella: null });
    expect((await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento).toEqual(loto());
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).toMatchObject({ estado: 'COMPLETADO', versionPrompt: 'IA-14.v2', intentos: 1 });
    // El prompt lleva el contexto del curso y la descripción dentro de <material_cliente>.
    const mensaje = proveedor.llamadas[0]!.mensajes[0]!.texto;
    expect(mensaje).toContain('Tipo de pedido: tipo = "crear"');
    expect(mensaje).toContain('30 pantallas · 9 actividades · gamificación ligera');
    expect(mensaje).toContain('Dispositivo principal: celular · Estaciones posibles del mapa: 3');
    expect(mensaje).toContain('Patrón actual: historias');
    expect(mensaje).toMatch(/<material_cliente archivo="descripción del patrón">\ntablero de misiones de seguridad\n<\/material_cliente>/);
  });

  it('«✦ Recomendar» guarda la recomendación de LOTO con su alternativa', async () => {
    const { r } = await pedir(comoReal(), 'recomendar');
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: (await r).propuestaId } });
    expect(p).toMatchObject({ tipo: 'patron', titulo: 'Recomendado: Historias', descripcion: recomendada.recomendado.motivo });
    expect(p.cambios).toMatchObject({ modo: 'recomendar', alternativa: { patron: 'clasico' }, descripcion: null });
  });

  it('un nombre de más de 60 caracteres se recorta; un personalizado al recomendar se reintenta con el error', async () => {
    const largo = structuredClone(creada);
    largo.navegacion.patronPersonalizado.nombre = 'Tablero de misiones de seguridad para la planta de chancado y molienda norte';
    const recorta = await pedir(comoReal({ [TAREA_PATRON]: [JSON.stringify(largo)] }), 'crear', 'tablero');
    const p = await prisma.propuesta.findUniqueOrThrow({ where: { id: (await recorta.r).propuestaId } });
    const nombre = (p.cambios as { navegacion: { patronPersonalizado: { nombre: string } } }).navegacion.patronPersonalizado.nombre;
    expect(nombre).toBe('Tablero de misiones de seguridad para la planta de chancado');
    expect(nombre.length).toBeLessThanOrEqual(60);

    const proveedor = comoReal({ [TAREA_PATRON]: [JSON.stringify(creada)] });
    const reintento = await pedir(proveedor, 'recomendar');
    await reintento.r;
    expect(proveedor.llamadas).toHaveLength(2);
    expect(proveedor.llamadas[1]!.mensajes.at(-1)!.texto).toMatch(/debe ser uno de los 7 patrones del catálogo/);
    expect(await prisma.trabajoIA.findUniqueOrThrow({ where: { id: reintento.trabajoId } })).toMatchObject({ estado: 'COMPLETADO', intentos: 2 });
  });
});
