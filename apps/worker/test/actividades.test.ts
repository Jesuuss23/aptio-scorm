// HU-0407 · Datos de las actividades (IA-07 v2) dentro de la etapa 4. CP-044: clasificar trae sus grupos y al menos 4
// elementos con su grupo correcto y retroalimentación; el reto final es sumativo y define el completado. PostgreSQL real.
import { type ProveedorTexto, proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import type { PantallasCurso } from '@aptio/schema/generacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { interaccionDe, modoDe, revisarActividad, type SalidaIa07 } from '../src/etapas/actividades.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { baseLista, comoReal, escenario, etapaDe, leerCaso } from './apoyo-generacion.js';

const SALIDAS = leerCaso('04-IA-07-interacciones.json') as (SalidaIa07 & { pantallaId: string })[];
const salida = (id: string) => structuredClone(SALIDAS.find((s) => s.pantallaId === id)!);
const OBJETIVOS = ['obj-1', 'obj-2', 'obj-3'];
const regla = (pantallaId: string, tipo: string, modo: 'formativa' | 'sumativa' = 'formativa') => revisarActividad({ pantallaId, tipo, modo, objetivoIds: OBJETIVOS });

describe('reglas de las actividades', () => {
  it('el reto final es sumativo, salvo las interacciones que solo pueden ser formativas', () => {
    expect(modoDe('evaluacion', 'INT-05')).toBe('sumativa');
    expect(modoDe('actividad', 'INT-05')).toBe('formativa');
    expect(modoDe('evaluacion', 'INT-06')).toBe('formativa');
  });

  it('acepta las 9 actividades del caso LOTO', () => {
    for (const s of SALIDAS) expect(regla(s.pantallaId, s.tipo, s.modo)(s)).toEqual([]);
  });

  it('CP-044 · rechaza un clasificar con un grupo que no existe, sin retroalimentación o desequilibrado', () => {
    const s = salida('p10');
    const elementos = s.datos.elementos as { id: string; grupoCorrecto: string; retroalimentacion?: unknown }[];
    elementos[0]!.grupoCorrecto = 'p10-otro';
    delete elementos[1]!.retroalimentacion;
    for (const e of elementos.slice(4)) e.grupoCorrecto = 'p10-seguro';
    expect(regla('p10', 'INT-02')(s)).toEqual([
      'Elementos con un grupo que no existe: p10-el-1',
      'Cada elemento lleva su retroalimentación; faltan en p10-el-2',
      'Los grupos deben estar equilibrados (diferencia máxima de 1): 5 y 1',
    ]);
  });

  it('rechaza otra pantalla, otro tipo o modo, ids repetidos, objetivos ajenos y más preguntas por intento que el banco', () => {
    const p28 = salida('p28');
    expect(regla('p28', 'INT-05', 'sumativa')({ ...p28, pantallaId: 'p27', modo: 'formativa' })).toEqual(['pantallaId debe ser "p28"', 'modo debe ser sumativa']);
    const preguntas = p28.datos.preguntas as { id: string; objetivoId?: string }[];
    preguntas[0]!.objetivoId = 'obj-9';
    preguntas[1]!.id = preguntas[2]!.id;
    p28.datos.preguntasPorIntento = 99;
    expect(regla('p28', 'INT-05', 'sumativa')(p28)).toEqual([
      `Ids repetidos en la actividad: ${preguntas[2]!.id}`,
      `Preguntas con un objetivo que no existe: ${preguntas[0]!.id}`,
      `preguntasPorIntento (99) no puede pasar las ${preguntas.length} preguntas del banco`,
    ]);
    expect(regla('p11', 'INT-03')(salida('p15'))).toEqual(['pantallaId debe ser "p11"']);
    expect(regla('p26', 'INT-05')(salida('p26'))).toEqual(['tipo debe ser INT-05, la actividad del guion']);
    const vf = salida('p26');
    for (const a of vf.datos.afirmaciones as { verdadera: boolean }[]) a.verdadera = true;
    expect(regla('p26', 'INT-07')(vf)).toEqual(['Las afirmaciones deben mezclar verdaderas y falsas']);
    const decision = salida('p17');
    decision.datos.inicioId = 'p17-x';
    expect(regla('p17', 'INT-08')(decision)).toEqual(['inicioId "p17-x" no es un nodo']);
  });

  it('la exploración usa la escena de su pantalla y la salida pierde pantallaId y tipo', () => {
    const r = interaccionDe('p20', salida('p20'));
    expect(r).not.toHaveProperty('pantallaId');
    expect(r).not.toHaveProperty('tipo');
    expect(r.datos.imagenId).toBe('p20-escena');
  });

  it('antepone el id de la pantalla a los ids que no lo traen y a sus referencias', () => {
    const quiz = interaccionDe('p28', salida('p28'));
    expect((quiz.datos.preguntas as { id: string; opciones: { id: string }[] }[])[0]).toMatchObject({ id: 'p28-bq-01', opciones: [{ id: 'p28-bq-01-a' }, { id: 'p28-bq-01-b' }, { id: 'p28-bq-01-c' }] });
    const clasificar = interaccionDe('p10', { ...salida('p10'), datos: { grupos: [{ id: 'si' }, { id: 'p10-no' }], elementos: [{ id: 'a', grupoCorrecto: 'si' }] } });
    expect(clasificar.datos).toEqual({ grupos: [{ id: 'p10-si' }, { id: 'p10-no' }], elementos: [{ id: 'p10-a', grupoCorrecto: 'p10-si' }] });
    // Las del caso LOTO ya traen el prefijo: quedan igual.
    expect(interaccionDe('p10', salida('p10')).datos).toEqual(salida('p10').datos);
  });
});

describe.skipIf(!baseLista && !process.env.CI)('actividades en la etapa 4', () => {
  const e = escenario('actividades');
  beforeAll(e.crear);
  afterAll(e.borrar);
  const hasta3 = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION! };

  it('CP-044 · cada actividad sale con sus datos en el curso; un clasificar sin retroalimentación se reintenta', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), hasta3)).toEqual({ estado: 'COMPLETADO' });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
    // El caso LOTO tiene una pantalla de video: el proyecto necesita un video del cliente para esa disposición.
    const video = await prisma.recurso.create({ data: { organizacionId: e.ids.orgId, proyectoId, tipo: 'VIDEO', origen: 'CLIENTE', claveS3: `v/${generacionId}`, mime: 'video/mp4', bytes: 1, hash: 'x', nombre: 'procedimiento.mp4' } });
    await prisma.materialFuente.create({ data: { proyectoId, tipo: 'VIDEO', recursoId: video.id, estado: 'listo' } });

    const base = comoReal();
    let forzada = false;
    const proveedor: ProveedorTexto = {
      ...base,
      async completar(x) {
        const r = await base.completar(x);
        if (x.tarea === 'IA-07' && !forzada && x.mensajes[0]!.texto.includes('pantallaId = "p10"')) {
          forzada = true;
          return { ...r, texto: r.texto.replace(/,"retroalimentacion":\{"es":"Tu candado, tu llave: solo tú lo retiras\."\}/, '') };
        }
        return r;
      },
    };
    expect(await e.correr(generacionId, proveedor, { ...hasta3, PANTALLAS: EJECUTORES.PANTALLAS! })).toEqual({ estado: 'COMPLETADO' });

    const p10 = base.llamadas.filter((l) => l.tarea === 'IA-07' && l.mensajes[0]!.texto.includes('pantallaId = "p10"'));
    expect(p10).toHaveLength(2);
    expect(p10[1]!.mensajes.at(-1)!.texto).toContain('Cada elemento lleva su retroalimentación; faltan en p10-el-1');
    expect(p10[0]!.mensajes[0]!.texto).toContain('tipo = "INT-02" y modo = "formativa"');
    expect(p10[0]!.mensajes[0]!.texto).toContain('<material_cliente archivo="ideas clave de la etapa 1">');
    const p28 = base.llamadas.find((l) => l.tarea === 'IA-07' && l.mensajes[0]!.texto.includes('pantallaId = "p28"'))!;
    expect(p28.mensajes[0]!.texto).toContain('tipo = "INT-05" y modo = "sumativa"');

    const { datos } = (await etapaDe(generacionId, 'PANTALLAS')).detalle as unknown as { datos: PantallasCurso };
    expect(datos.pantallas.filter((p) => p.actividad?.interaccion).map((p) => p.id)).toEqual(['p07', 'p10', 'p15', 'p17', 'p20', 'p22', 'p25', 'p26', 'p28']);
    expect(datos.pantallas.find((p) => p.id === 'p20')!.pedidosImagen).toEqual([expect.objectContaining({ id: 'p20-escena', uso: 'escena' })]);

    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    expect(esCursoValido(curso.documento)).toBe(true);
    type Doc = { seguimiento: { criterioCompletado: string }; recursos: { id: string }[]; modulos: { capsulas: { pantallas: { id: string; bloques: { id: string; tipo: string; interaccion?: { tipo: string; modo: string; datos: Record<string, unknown> } }[] }[] }[] }[] };
    const doc = curso.documento as Doc;
    expect(doc.seguimiento.criterioCompletado).toBe('sumativa');
    expect(doc.recursos.map((r) => r.id)).toContain('p20-escena');
    const pantalla = (id: string) => doc.modulos[0]!.capsulas[0]!.pantallas.find((p) => p.id === id)!;
    const clasificar = pantalla('p10').bloques.find((b) => b.tipo === 'interaccion')!;
    expect(clasificar).toMatchObject({ id: 'p10-actividad', interaccion: { tipo: 'INT-02', modo: 'formativa' } });
    const grupos = (clasificar.interaccion!.datos.grupos as { id: string }[]).map((g) => g.id);
    const elementos = clasificar.interaccion!.datos.elementos as { grupoCorrecto: string; retroalimentacion?: unknown }[];
    expect(grupos).toHaveLength(2);
    expect(elementos.length).toBeGreaterThanOrEqual(4);
    expect(elementos.every((x) => grupos.includes(x.grupoCorrecto) && x.retroalimentacion)).toBe(true);
    expect(pantalla('p28').bloques.find((b) => b.tipo === 'interaccion')!.interaccion).toMatchObject({ tipo: 'INT-05', modo: 'sumativa' });
    // La pregunta de IA-15 ya va dentro de la interacción: no se repite como texto.
    expect(pantalla('p22').bloques.map((b) => b.id)).toEqual(['p22-titulo', 'p22-actividad']);
  });
});
