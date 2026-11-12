// HU-0901 · Preguntas en el video (CP-080, RN-09-1): reglas de los marcadores del bloque de video.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroresMarcadores, type MarcadorVideo, mmss } from '../src/marcadores.js';
import { erroresCurso } from '../src/validar.js';

const loto = () => JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
const pregunta = (id: string, tiempoMs: number, correctas = [true, false]): MarcadorVideo => ({
  id, tiempoMs, tipo: 'pregunta', obligatorio: true,
  pregunta: {
    id: `${id}-q`, enunciado: { es: '¿Qué se hace antes de apagar?' },
    opciones: correctas.map((c, i) => ({ id: `${id}-q-${i}`, contenido: { texto: { es: `Opción ${i + 1}` } }, correcta: c })),
    retroalimentacion: { correcta: { es: 'Bien.' }, incorrecta: { es: 'Revisa el inicio.' } },
  },
});
const p18 = (doc: ReturnType<typeof loto>) => doc.modulos.flatMap((m: { capsulas: { pantallas: { id: string }[] }[] }) => m.capsulas.flatMap((c) => c.pantallas)).find((p: { id: string }) => p.id === 'p18');

describe('marcadores del video (HU-0901)', () => {
  it('los marcadores de LOTO (capítulo, preguntas y punto) son válidos', () => {
    const video = p18(loto()).bloques.find((b: { tipo: string }) => b.tipo === 'video');
    expect(erroresMarcadores('p18/p18-video', video.marcadores)).toEqual([]);
    expect(erroresCurso(loto())).toEqual([]);
  });

  it('el tiempo es un entero desde 0 y no pasa la duración del video cuando se conoce', () => {
    expect(erroresMarcadores('v', [pregunta('m1', 45000)], 60000)).toEqual([]);
    expect(erroresMarcadores('v', [pregunta('m1', 45000)])).toEqual([]);
    expect(erroresMarcadores('v', [pregunta('m1', 75000)], 60000)).toEqual(['v/marcadores/0: el tiempo 1:15 pasa la duración del video (1:00)']);
    expect(erroresMarcadores('v', [{ ...pregunta('m1', 0), tiempoMs: -1 }])).toEqual(['v/marcadores/0: el tiempo debe ser un entero desde 0']);
    expect(erroresMarcadores('v', [{ ...pregunta('m1', 0), tiempoMs: 1.5 }])).toEqual(['v/marcadores/0: el tiempo debe ser un entero desde 0']);
  });

  it('los ids no se repiten', () => {
    expect(erroresMarcadores('v', [pregunta('m1', 1000), pregunta('m1', 2000)])).toEqual(['v/marcadores/1: el id «m1» se repite']);
  });

  it('una pregunta tiene enunciado, al menos 2 opciones y exactamente 1 correcta', () => {
    const sinEnunciado = pregunta('m1', 0);
    sinEnunciado.pregunta!.enunciado = { es: '  ' };
    expect(erroresMarcadores('v', [sinEnunciado])).toEqual(['v/marcadores/0/pregunta: falta el enunciado']);
    expect(erroresMarcadores('v', [pregunta('m1', 0, [true])])).toEqual(['v/marcadores/0/pregunta: necesita al menos 2 opciones']);
    expect(erroresMarcadores('v', [pregunta('m1', 0, [false, false])])).toEqual(['v/marcadores/0/pregunta: marca exactamente 1 opción correcta (hay 0)']);
    expect(erroresMarcadores('v', [pregunta('m1', 0, [true, true, false])])).toEqual(['v/marcadores/0/pregunta: marca exactamente 1 opción correcta (hay 2)']);
    const vacia = pregunta('m1', 0);
    vacia.pregunta!.opciones[1]!.contenido = { texto: { es: '' } };
    expect(erroresMarcadores('v', [vacia])).toEqual(['v/marcadores/0/pregunta: hay una opción vacía']);
    expect(erroresMarcadores('v', [{ id: 'm1', tiempoMs: 0, tipo: 'pregunta', obligatorio: true }])).toEqual(['v/marcadores/0/pregunta: falta la pregunta']);
  });

  it('el validador del curso aplica la regla con la duración del recurso', () => {
    const doc = loto();
    doc.recursos.find((r: { id: string }) => r.id === 'vid-procedimiento').duracionMs = 120000;
    expect(erroresCurso(doc)).toEqual(['p18/p18-video/marcadores/3: el tiempo 2:10 pasa la duración del video (2:00)']);
    expect(mmss(62000)).toBe('1:02');
  });
});
