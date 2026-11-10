// HU-0503 · Regeneración en cascada (CP-050): cambiar la narración de una pantalla rehace solo su voz, su boca y sus
// subtítulos, fuera de la generación. PostgreSQL real; voz y boca simuladas y el almacenamiento, un mapa en memoria.
import { calculadorSimulado, type CalculadorBocas, type PedidoVoz, proveedorSimulado, type Sintetizador, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { TAREA_CASCADA } from '@aptio/schema/generacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCascada } from '../src/cascada.js';
import { crearEtapaBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaSubtitulos } from '../src/etapas/subtitulos.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { baseLista, escenario } from './apoyo-generacion.js';

type Es = { estado: string; recursoAudioId?: string; subtitulosId?: string; hashTexto: string };
type Doc = { modulos: { capsulas: { pantallas: { id: string; narracion?: { texto: { es: string }; porIdioma: { es: Es } } }[] }[] }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

describe.skipIf(!baseLista && !process.env.CI)('regeneración en cascada (HU-0503)', () => {
  const e = escenario('cascada');
  beforeAll(e.crear);
  afterAll(e.borrar);

  const almacen = new Map<string, Uint8Array>();
  const subir = async (clave: string, cuerpo: Uint8Array) => void almacen.set(clave, cuerpo);
  const leer = async (clave: string) => almacen.get(clave)!;
  let pedidosVoz: PedidoVoz[] = [];
  let pedidosBoca: string[] = [];
  let vtts = 0;
  let fallarVoz = false;
  const sintetizar: Sintetizador = async (p) => {
    if (fallarVoz) throw new Error('Google no respondió (503)');
    pedidosVoz.push(p);
    return vozSimulada(p);
  };
  const calcular: CalculadorBocas = async (p) => (pedidosBoca.push(p.texto), calculadorSimulado(p));
  const etapas = {
    voz: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }),
    boca: crearEtapaBoca({ calcular, leer }),
    subtitulos: crearEtapaSubtitulos({ subir: async (c, b) => (vtts++, subir(c, b)) }),
  };
  const ejecutores = {
    RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS!,
    VOZ_ES: etapas.voz, BOCA: etapas.boca, SUBTITULOS: etapas.subtitulos,
  };
  const cascada = crearCascada({ bd: prisma, ...etapas, esperaMs: 20 });
  const correrCascada = (cursoId: string, pantallaId: string) =>
    cascada({ data: { trabajoId: cursoId, organizacionId: e.ids.orgId, tarea: TAREA_CASCADA, pantallaId }, queueName: 'voz', updateProgress: async () => undefined });
  /** Lo que hace la API al guardar la narración en Revisión: cambia el texto y deja la narración «Por regenerar». */
  const corregir = async (cursoId: string, pantallaId: string, texto: string) => {
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = c.documento as unknown as Doc;
    pantallas(doc).find((p) => p.id === pantallaId)!.narracion!.texto.es = texto;
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object, version: c.version + 1 } });
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId }, data: { estado: 'DESACTUALIZADA' } });
    pedidosVoz = [];
    pedidosBoca = [];
    vtts = 0;
  };

  let cursoId = '';
  let generacionId = '';
  beforeAll(async () => {
    const r = await e.preparar();
    generacionId = r.generacionId;
    const fin = await e.correr(generacionId, proveedorSimulado(), ejecutores);
    if (fin.estado !== 'COMPLETADO') throw new Error(`La generación inicial terminó en ${fin.estado}`);
    cursoId = (await prisma.curso.findUniqueOrThrow({ where: { proyectoId: r.proyectoId } })).id;
  });

  it('CP-050 · cambiar la narración de p05 rehace solo su voz, su boca y sus subtítulos', async () => {
    const antes = await prisma.narracion.findMany({ where: { cursoId } });
    const trabajosAntes = await prisma.trabajoIA.count({ where: { organizacionId: e.ids.orgId, tarea: 'VOZ' } });
    await corregir(cursoId, 'p05', 'Antes de intervenir, aísla cada fuente de energía.');

    expect(await correrCascada(cursoId, 'p05')).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(1);
    expect(pedidosVoz[0]!.ssml).toContain('aísla cada fuente de energía');
    expect(pedidosBoca).toHaveLength(1);
    expect(vtts).toBe(1);

    const despues = await prisma.narracion.findMany({ where: { cursoId } });
    expect(despues.every((n) => n.estado === 'ACTUALIZADA')).toBe(true);
    const igual = (n: (typeof despues)[number]) => {
      const a = antes.find((x) => x.pantallaId === n.pantallaId)!;
      return n.audioRecursoId === a.audioRecursoId && n.subtituloRecursoId === a.subtituloRecursoId && JSON.stringify(n.bocas) === JSON.stringify(a.bocas);
    };
    // Solo p05 tiene audio, boca y subtítulos nuevos; las demás conservan los suyos.
    expect(despues.filter((n) => !igual(n)).map((n) => n.pantallaId)).toEqual(['p05']);
    const p05 = despues.find((n) => n.pantallaId === 'p05')!;
    const p05Antes = antes.find((n) => n.pantallaId === 'p05')!;
    expect([p05.audioRecursoId === p05Antes.audioRecursoId, p05.subtituloRecursoId === p05Antes.subtituloRecursoId]).toEqual([false, false]);
    const doc = (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as unknown as Doc;
    expect(pantallas(doc).find((p) => p.id === 'p05')!.narracion!.porIdioma.es.estado).toBe('generado');
    expect(esCursoValido(doc)).toBe(true);
    // El costo de la voz queda en TrabajoIA con el proyecto, fuera de la generación.
    const nuevo = await prisma.trabajoIA.findMany({ where: { organizacionId: e.ids.orgId, tarea: 'VOZ' }, orderBy: { creadoEn: 'desc' }, take: 1 });
    expect(await prisma.trabajoIA.count({ where: { organizacionId: e.ids.orgId, tarea: 'VOZ' } })).toBe(trabajosAntes + 1);
    expect(nuevo[0]).toMatchObject({ generacionId: null, proyectoId: expect.any(String) });
  });

  it('con una generación en curso, espera a que termine', async () => {
    await corregir(cursoId, 'p06', 'Coloca tu candado y tu tarjeta personal.');
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_CURSO' } });
    const corriendo = correrCascada(cursoId, 'p06');
    await new Promise((r) => setTimeout(r, 150));
    expect(pedidosVoz).toHaveLength(0);
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'COMPLETADO' } });
    expect(await corriendo).toEqual({ estado: 'COMPLETADO' });
    expect(pedidosVoz).toHaveLength(1);
  });

  it('si la voz falla, la narración queda en error y el trabajo falla', async () => {
    await corregir(cursoId, 'p07', 'Verifica la energía cero antes de empezar.');
    fallarVoz = true;
    await expect(correrCascada(cursoId, 'p07')).rejects.toThrow(/Google no respondió/);
    fallarVoz = false;
    expect((await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p07' } })).estado).toBe('ERROR');
    // Otro guardado vuelve a lanzar la cascada y la deja lista.
    expect(await correrCascada(cursoId, 'p07')).toEqual({ estado: 'COMPLETADO' });
    expect((await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p07' } })).estado).toBe('ACTUALIZADA');
  });

  it('no procesa cursos de otra organización', async () => {
    await expect(cascada({ data: { trabajoId: cursoId, organizacionId: '00000000-0000-4000-8000-000000000000', tarea: TAREA_CASCADA, pantallaId: 'p05' }, queueName: 'voz', updateProgress: async () => undefined }))
      .rejects.toThrow(/no existe en la organización/);
  });
});
