// HU-0505 · Control de calidad en el worker (IA-12 v2, CP-054): reglas y luego IA-12 por lotes de 10 pantallas, con los
// textos dentro de <material_cliente>; las de IA no repiten lo de las reglas, una corrida nueva reemplaza las abiertas sin
// volver a crear las descartadas, y se guardan como mucho 120. También corre en la etapa 10 del generador.
// PostgreSQL real; IA con el modo simulado (la salida grabada de LOTO, 10-IA-12-calidad.json).
import { readFileSync } from 'node:fs';
import { proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { TAREA_CALIDAD } from '@aptio/schema/calidad';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { controlCalidad, crearRevisorCalidad } from '../src/calidad.js';
import { AI, baseLista, escenario, etapaDe } from './apoyo-generacion.js';

type Doc = { modulos: { capsulas: { pantallas: { id: string; bloques: Record<string, unknown>[]; titulo: { es: string; en?: string } }[] }[] }[] };
const loto = (): Doc => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const pantalla = (doc: Doc, id: string) => doc.modulos[0]!.capsulas[0]!.pantallas.find((p) => p.id === id)!;
const eventos: { estado: string; progreso: number; mensaje?: string }[] = [];
const redis = { publish: async (_c: string, m: string) => { eventos.push(JSON.parse(m)); return 1; } } as unknown as Redis;
const TARJETA = '/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b/texto';

describe.skipIf(!baseLista && !process.env.CI)('control de calidad (HU-0505)', () => {
  const e = escenario('calidad');
  let proyectoId = '';
  let generacionId = '';
  beforeAll(async () => {
    await e.crear();
    ({ proyectoId, generacionId } = await e.preparar());
  });
  afterAll(async () => { await e.borrar(); });

  async function nuevoCurso(cambiar: (doc: Doc) => void = () => undefined) {
    await prisma.curso.deleteMany({ where: { proyectoId } });
    const doc = loto();
    cambiar(doc);
    return prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: doc as object, version: 1 } });
  }
  /** Lo que hace la API: el TrabajoIA en cola y el trabajo con el curso. */
  async function revisar(cursoId: string, proveedor = proveedorSimulado()) {
    eventos.length = 0;
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_CALIDAD, tipo: 'CALIDAD', proveedor: '-', modelo: '-' } });
    const progresos: number[] = [];
    const r = await crearRevisorCalidad({ bd: prisma, redis, proveedor })({
      data: { trabajoId: t.id, organizacionId: e.ids.orgId, tarea: TAREA_CALIDAD, calidad: { cursoId } }, queueName: 'ia',
      updateProgress: async (p: number) => { progresos.push(p); },
    });
    return { trabajoId: t.id, r, progresos, proveedor };
  }
  const observaciones = (cursoId: string) => prisma.observacion.findMany({ where: { cursoId }, orderBy: [{ pantallaId: 'asc' }, { mensaje: 'asc' }] });

  it('CP-054 · la imagen sin alternativo queda como observación de accesibilidad en su pantalla, y la IA suma las suyas', async () => {
    const curso = await nuevoCurso((doc) => { pantalla(doc, 'p20').bloques.push({ id: 'p20-foto', tipo: 'imagen', decorativa: false }); });
    const { trabajoId, r, progresos, proveedor } = await revisar(curso.id);
    // LOTO tiene 30 pantallas: 3 lotes de 10. La salida grabada trae 5 observaciones de p04, p07, p09, p18 y p20.
    expect(r).toEqual({ reglas: 1, ia: 5, lotes: 3, tope: false });
    expect(proveedor.llamadas.map((l) => l.tarea)).toEqual(['IA-12', 'IA-12', 'IA-12']);
    const pedido = proveedor.llamadas[1]!.mensajes[0]!.texto;
    expect(pedido).toMatch(/<material_cliente archivo="pantallas del curso">\n\[\n {2}\{\n {4}"id": "p11"/);
    // Las reglas del lote van aparte para que IA-12 no las repita.
    expect(pedido).toContain('"mensaje":"La imagen p20-foto no tiene texto alternativo."');
    expect(progresos).toEqual([33, 67, 100, 100]);
    expect(eventos.map((x) => x.estado)).toEqual(['EN_CURSO', 'EN_CURSO', 'EN_CURSO', 'COMPLETADO']);
    expect(eventos.at(-1)?.mensaje).toBe('5 observaciones de la IA · 1 de reglas');
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('COMPLETADO');
    expect(await prisma.trabajoIA.count({ where: { proyectoId, tarea: 'IA-12', versionPrompt: 'IA-12.v2' } })).toBe(3);

    const obs = await observaciones(curso.id);
    expect(obs.find((o) => o.origen === 'regla')).toMatchObject({
      pantallaId: 'p20', tipo: 'ACCESIBILIDAD', severidad: 'bloquea-entrega', categoria: 'accesibilidad', mensaje: 'La imagen p20-foto no tiene texto alternativo.',
      ruta: '/modulos/0/capsulas/0/pantallas/19/bloques/2',
    });
    // Gravedad alta y media → aviso; baja → info. Ninguna de IA bloquea.
    expect(obs.filter((o) => o.origen === 'ia').map((o) => [o.pantallaId, o.tipo, o.categoria, o.severidad])).toEqual([
      ['p04', 'ACCESIBILIDAD', 'accesibilidad', 'info'],
      ['p07', 'CALIDAD', 'longitud', 'aviso'],
      ['p09', 'CALIDAD', 'exactitud', 'info'],
      ['p18', 'MATERIAL_FALTANTE', 'faltante', 'aviso'],
      ['p20', 'CALIDAD', 'exactitud', 'aviso'],
    ]);
    expect(obs.find((o) => o.pantallaId === 'p07' && o.origen === 'ia')).toMatchObject({ sugerencia: 'Usar «Cylinders, hoses».', ruta: '/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b' });
  });

  it('una corrida nueva reemplaza las de IA abiertas y no vuelve a crear las descartadas', async () => {
    const curso = await nuevoCurso();
    await revisar(curso.id);
    const p09 = (await observaciones(curso.id)).find((o) => o.pantallaId === 'p09')!;
    await prisma.observacion.update({ where: { id: p09.id }, data: { resuelta: true } });
    const antes = (await observaciones(curso.id)).filter((o) => !o.resuelta).map((o) => o.id);

    const { r } = await revisar(curso.id);
    expect(r).toMatchObject({ ia: 4, reglas: 0 });
    const despues = await observaciones(curso.id);
    expect(despues.filter((o) => o.resuelta).map((o) => o.id)).toEqual([p09.id]);
    expect(despues.filter((o) => !o.resuelta).map((o) => o.pantallaId)).toEqual(['p04', 'p07', 'p18', 'p20']);
    // Son filas nuevas: las abiertas de antes se borraron.
    expect(despues.filter((o) => !o.resuelta).some((o) => antes.includes(o.id))).toBe(false);
  });

  it('lo que las reglas ya marcaron en una pantalla no se repite: el inglés en Desborde de p07', async () => {
    const curso = await nuevoCurso((doc) => {
      const p07 = pantalla(doc, 'p07') as unknown as { bloques: { interaccion?: { datos: { pares: { b: { texto: { es: string; en?: string } } }[] } } }[] };
      p07.bloques[1]!.interaccion!.datos.pares[2]!.b.texto.en = '[EN] Cilindros y mangueras';
    });
    await prisma.traduccion.create({ data: { cursoId: curso.id, idioma: 'en', ruta: TARJETA, textoOrigenHash: 'x', estado: 'DESBORDE' } });
    const { r } = await revisar(curso.id);
    // Con inglés en el curso, las 3 imágenes de LOTO avisan por su alternativo en inglés, y la tarjeta por su largo.
    expect(r).toMatchObject({ reglas: 4, ia: 4 });
    const p07 = (await observaciones(curso.id)).filter((o) => o.pantallaId === 'p07');
    expect(p07.map((o) => [o.origen, o.tipo, o.categoria])).toEqual([['regla', 'IDIOMA', 'longitud']]);
    expect(p07[0]!.mensaje).toBe('En inglés, «[EN] Cilindros y mangueras» no cabe en su espacio (26 de 24 caracteres): revísalo en Idiomas.');
  });

  it('se guardan como mucho 120 observaciones de IA y la corrida lo avisa', async () => {
    const curso = await nuevoCurso();
    const lote = (desde: number) => JSON.stringify({
      resumen: 'Muchas observaciones de ortografía.',
      observaciones: Array.from({ length: 50 }, (_, i) => ({
        id: `obs-${desde}-${i}`, pantallaId: `p${String(desde + (i % 10)).padStart(2, '0')}`, tipo: 'ortografia', gravedad: 'baja', mensaje: `Errata ${i} del lote ${desde}.`,
      })),
    });
    const { r } = await revisar(curso.id, proveedorSimulado({ 'IA-12': [lote(1), lote(11), lote(21)] }));
    expect(r).toEqual({ reglas: 0, ia: 120, lotes: 3, tope: true });
    expect(await prisma.observacion.count({ where: { cursoId: curso.id, origen: 'ia' } })).toBe(120);
    expect(eventos.at(-1)?.mensaje).toBe('120 observaciones de la IA · 0 de reglas · se llegó al tope de 120: revisa estas y vuelve a correr');
  });

  it('una salida que no valida en 3 intentos deja el trabajo en error y no toca las de IA', async () => {
    const curso = await nuevoCurso();
    await revisar(curso.id);
    const mala = JSON.stringify({ observaciones: [{ id: 'x', pantallaId: 'p01', tipo: 'gusto', gravedad: 'alta', mensaje: 'No me gusta' }], resumen: 'x' });
    await expect(revisar(curso.id, proveedorSimulado({ 'IA-12': [mala, mala, mala] }))).rejects.toThrow(/IA-12 no validó tras 3 intentos/);
    expect(eventos.at(-1)?.estado).toBe('ERROR');
    expect(await prisma.observacion.count({ where: { cursoId: curso.id, origen: 'ia' } })).toBe(5);
  });

  it('la etapa 10 del generador corre el control de calidad del curso (ADR-008)', async () => {
    const curso = await nuevoCurso();
    await e.correr(generacionId, proveedorSimulado(), { CONTROL_CALIDAD: controlCalidad });
    const etapa = await etapaDe(generacionId, 'CONTROL_CALIDAD');
    expect(etapa).toMatchObject({ estado: 'COMPLETADO', detalle: { texto: '5 observaciones de la IA · 0 de reglas', datos: { ia: 5, reglas: 0, lotes: 3, tope: false } } });
    expect(await prisma.observacion.count({ where: { cursoId: curso.id, origen: 'ia' } })).toBe(5);
    expect(await prisma.trabajoIA.count({ where: { generacionId, tarea: 'IA-12' } })).toBe(3);
  });
});
