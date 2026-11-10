// HU-0403 · Etapa 2 «Objetivos y estructura» (IA-04 v2): el número de pantallas pedido, el mínimo de pantallas con
// actividad según el % del proyecto y cada actividad ligada a un objetivo (CP-039). PostgreSQL real.
import { prisma } from '@aptio/db';
import { conActividad, type EstructuraCurso } from '@aptio/schema/generacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EJECUTORES } from '../src/etapas/index.js';
import { actividadesMinimas, revisarEstructura } from '../src/etapas/estructura.js';
import { baseLista, comoReal, conteo, escenario, etapaDe, leerCaso } from './apoyo-generacion.js';

type Salida = { objetivos: { id: string }[]; modulos: { capsulas: { pantallas: { id: string; tipo: string; objetivoIds: string[]; fragmentoIds: string[]; actividadSugerida?: string }[] }[] }[] };
const LOTO = leerCaso('02-IA-04-estructura.json') as Salida;
const pantallasDe = (s: Salida) => s.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const FRAGMENTOS = new Set((leerCaso('01-IA-03-resumenes.json') as { fragmentos: { id: string }[] }[]).flatMap((r) => r.fragmentos.map((f) => f.id)));

/** La estructura LOTO (10 pantallas con actividad) con 2 actividades más para llegar al 40 % de 30. */
function con12(): Salida {
  const s = structuredClone(LOTO);
  for (const p of pantallasDe(s)) {
    if (p.id === 'p05') p.actividadSugerida = 'INT-04';
    if (p.id === 'p08') p.actividadSugerida = 'INT-02';
  }
  return s;
}

describe('reglas de la estructura', () => {
  it('30 × 40 % = 12 pantallas con actividad; sin extensión pedida no hay mínimo', () => {
    expect(actividadesMinimas(30, 40)).toBe(12);
    expect(actividadesMinimas(25, 30)).toBe(8);
    expect(actividadesMinimas(null, 40)).toBeNull();
  });

  it('acepta la estructura con 30 pantallas y 12 actividades ligadas a objetivos', () => {
    expect(pantallasDe(con12()).filter(conActividad)).toHaveLength(12);
    expect(revisarEstructura({ pantallas: 30, minimas: 12, fragmentos: FRAGMENTOS })(con12())).toEqual([]);
  });

  it('rechaza menos actividades, otra extensión, ids fuera de orden y actividades sin objetivo', () => {
    expect(revisarEstructura({ pantallas: 30, minimas: 12, fragmentos: FRAGMENTOS })(LOTO)).toEqual(['Debe haber al menos 12 pantallas con actividad y hay 10']);
    expect(revisarEstructura({ pantallas: 28, minimas: null, fragmentos: FRAGMENTOS })(LOTO)).toEqual(['Debe haber exactamente 28 pantallas y hay 30']);
    const mala = con12();
    const lista = pantallasDe(mala);
    lista[6]!.objetivoIds = [];
    lista[1]!.id = 'x02';
    lista[3]!.fragmentoIds = ['t99-f01'];
    lista[4]!.objetivoIds = ['obj-9'];
    expect(revisarEstructura({ pantallas: 30, minimas: 12, fragmentos: FRAGMENTOS })(mala)).toEqual([
      'La pantalla 2 debe tener el id p02 (tiene x02)',
      'La pantalla p04 usa fragmentos que no existen: t99-f01',
      'La pantalla p05 usa objetivos que no existen: obj-9',
      'La pantalla p07 tiene actividad y no está ligada a un objetivo',
    ]);
  });

  it('cada objetivo necesita al menos una actividad', () => {
    const s = con12();
    s.objetivos.push({ id: 'obj-4' } as never);
    expect(revisarEstructura({ pantallas: 30, minimas: 12, fragmentos: FRAGMENTOS })(s)).toEqual(['El objetivo obj-4 no tiene ninguna actividad']);
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 2 en el generador', () => {
  const e = escenario('estructura');
  beforeAll(e.crear);
  afterAll(e.borrar);
  const etapas = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA! };

  it('CP-039 · con 30 pantallas y 40 % hay 30 pantallas, al menos 12 con actividad y cada una ligada a un objetivo', async () => {
    const { generacionId } = await e.preparar();
    // La primera respuesta trae solo 10 actividades: se reintenta con el motivo y la segunda cumple.
    const proveedor = comoReal({ 'IA-04': [JSON.stringify(LOTO), JSON.stringify(con12())] });
    expect(await e.correr(generacionId, proveedor, etapas)).toEqual({ estado: 'COMPLETADO' });

    const ia04 = proveedor.llamadas.filter((l) => l.tarea === 'IA-04');
    expect(ia04).toHaveLength(2);
    const pedido = ia04[0]!.mensajes[0]!.texto;
    expect(pedido).toContain('Pantallas: exactamente 30 en total');
    expect(pedido).toContain('Pantallas con actividad: al menos 12 (40 % del total)');
    expect(pedido).toContain('<material_cliente archivo="ideas clave de la etapa 1">\nt04-f01 · idea · p. 7 · Bloqueo:');
    expect(ia04[1]!.mensajes.at(-1)!.texto).toContain('Debe haber al menos 12 pantallas con actividad y hay 10');

    const etapa = await etapaDe(generacionId, 'OBJETIVOS_ESTRUCTURA');
    expect(etapa.estado).toBe('COMPLETADO');
    const { texto, datos } = etapa.detalle as unknown as { texto: string; datos: EstructuraCurso };
    expect(texto).toBe('3 objetivos con nivel de Bloom · 1 módulo · 30 pantallas · 12 con actividad');
    const pantallas = datos.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
    expect(pantallas).toHaveLength(30);
    const actividades = pantallas.filter(conActividad);
    expect(actividades.length).toBeGreaterThanOrEqual(12);
    expect(actividades.every((p) => p.objetivoIds.length > 0)).toBe(true);
    expect(datos.actividades).toEqual({ minimas: 12, total: 12 });
    expect(datos.objetivos.map((o) => o.nivelBloom)).toEqual(['recordar', 'comprender', 'aplicar']);
    // Cada pantalla con fragmentos lleva las páginas del material de donde salen.
    expect(pantallas.find((p) => p.id === 'p06')!.paginas).toEqual([13]);
    expect((await prisma.trabajoIA.findFirstOrThrow({ where: { generacionId, tarea: 'IA-04' } })).versionPrompt).toBe('IA-04.v2');
    expect(await conteo(generacionId)).toMatchObject({ 'IA-04': 1 });
  });

  it('sin el resumen de la etapa 1 la etapa 2 queda en error y no llama a la IA', async () => {
    const { generacionId } = await e.preparar();
    const sinDatos = { RESUMEN_MATERIAL: async () => ({ texto: 'sin datos' }), OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA! };
    expect(await e.correr(generacionId, comoReal(), sinDatos)).toEqual({ estado: 'ERROR' });
    expect(await etapaDe(generacionId, 'OBJETIVOS_ESTRUCTURA')).toMatchObject({ estado: 'ERROR', detalle: { texto: 'Falta el resultado de la etapa 1 (Leer y resumir el material)' } });
    expect(await conteo(generacionId)).toEqual({});
  });
});
