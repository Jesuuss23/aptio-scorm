// HU-1001 · Matriz de alineación (CP-083, RN-10-1, RN-10-2): roles, niveles por disposición, alertas e indicadores,
// sobre copias del caso LOTO (que tiene 2 alertas: obj-2 y obj-3 se evalúan con el reto final en «recordar»).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplicarNiveles, elementosAlineacion, informeAlineacion } from '../src/alineacion.js';
import type { CursoDoc } from '../src/revision.js';
import { validarCurso } from '../src/validar.js';

const original = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoDoc;
const loto = () => structuredClone(original);
const objetivo = (doc: CursoDoc, id: string) => informeAlineacion(doc).objetivos.find((o) => o.id === id)!;

describe('alineación pedagógica', () => {
  it('LOTO tiene 2 alertas: obj-2 y obj-3 se evalúan solo en «recordar»', () => {
    const informe = informeAlineacion(loto());
    expect(informe.objetivos.map((o) => [o.id, o.alertas])).toEqual([
      ['obj-1', []],
      ['obj-2', ['Se evalúa solo en «recordar», menor que «comprender»']],
      ['obj-3', ['Se evalúa solo en «recordar», menor que «aplicar»']],
    ]);
    expect(informe.totalAlertas).toBe(2);
    // p03 (la presentación de Ana) no tiene objetivo.
    expect(informe.indicadores).toEqual({ objetivosAlineados: 1, elementosSinObjetivo: 1, equilibrio: { presenta: 15, practica: 8, evalua: 8 } });
  });

  it('RN-10-1 · el reto final cuenta cada pregunta con su objetivo; las formativas practican y el contenido presenta', () => {
    const elementos = elementosAlineacion(loto());
    // Portada, objetivos, secciones, resultados y cierre no cuentan.
    expect(elementos.some((x) => ['p01', 'p02', 'p12', 'p23', 'p29', 'p30'].includes(x.pantallaId))).toBe(false);
    expect(elementos.filter((x) => x.pantallaId === 'p28').map((x) => [x.preguntaId, x.rol, x.objetivoIds])).toEqual([
      ['bq-01', 'E', ['obj-2']], ['bq-02', 'E', ['obj-1']], ['bq-03', 'E', ['obj-1']], ['bq-04', 'E', ['obj-1']],
      ['bq-05', 'E', ['obj-2']], ['bq-06', 'E', ['obj-3']], ['bq-07', 'E', ['obj-3']], ['bq-08', 'E', ['obj-2']],
    ]);
    const de = (id: string) => elementos.find((x) => x.pantallaId === id)!;
    expect([de('p07'), de('p10'), de('p15'), de('p20'), de('p18'), de('p04')].map((x) => [x.rol, x.nivelBloom, x.nivelEscrito])).toEqual([
      ['A', 'recordar', false], ['A', 'comprender', false], ['A', 'aplicar', false], ['A', 'comprender', false], ['P', 'comprender', false], ['P', 'recordar', false],
    ]);
    expect(de('p15')).toMatchObject({ numero: 15, titulo: expect.any(String) });
  });

  it('CP-083 · un objetivo «aplicar» evaluado solo con preguntas «recordar» tiene la alerta', () => {
    const doc = loto();
    expect(objetivo(doc, 'obj-3')).toMatchObject({
      nivelBloom: 'aplicar',
      evalua: [{ preguntaId: 'bq-06', nivelBloom: 'recordar' }, { preguntaId: 'bq-07', nivelBloom: 'recordar' }],
      alertas: ['Se evalúa solo en «recordar», menor que «aplicar»'],
    });
    // Una pregunta al nivel del objetivo la resuelve; el nivel queda escrito y el curso sigue validando.
    expect(aplicarNiveles(doc, [{ pantallaId: 'p28', preguntaId: 'bq-06', nivelBloom: 'aplicar' }])).toBeNull();
    expect(objetivo(doc, 'obj-3').alertas).toEqual([]);
    expect(objetivo(doc, 'obj-3').evalua[0]).toMatchObject({ nivelBloom: 'aplicar', nivelEscrito: true });
    expect(validarCurso(doc).valido).toBe(true);
  });

  it('cambiar el nivel de un objetivo o de una pantalla recalcula sus alertas', () => {
    const doc = loto();
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-2', nivelBloom: 'recordar' }])).toBeNull();
    expect(objetivo(doc, 'obj-2').alertas).toEqual([]);
    // La práctica de obj-1 (memoria, recordar) no llega a «analizar».
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-1', nivelBloom: 'analizar' }])).toBeNull();
    expect(objetivo(doc, 'obj-1').alertas).toEqual(['La práctica no llega a «analizar»', 'Se evalúa solo en «recordar», menor que «analizar»']);
    expect(aplicarNiveles(doc, [{ pantallaId: 'p07', nivelBloom: 'analizar' }])).toBeNull();
    expect(objetivo(doc, 'obj-1').alertas).toEqual(['Se evalúa solo en «recordar», menor que «analizar»']);
    expect(validarCurso(doc).valido).toBe(true);
  });

  it('RN-10-2 · sin presentación, práctica ni evaluación hay una alerta por cada una', () => {
    const doc = loto() as CursoDoc & { objetivos: { id: string; texto: { es: string }; nivelBloom: string }[] };
    doc.objetivos.push({ id: 'obj-4', texto: { es: 'Explicar el permiso de trabajo' }, nivelBloom: 'comprender' });
    expect(objetivo(doc, 'obj-4').alertas).toEqual(['No se presenta', 'No tiene práctica', 'No se evalúa']);
  });

  it('un cambio a algo que no existe no toca nada y lo dice', () => {
    const doc = loto();
    expect(aplicarNiveles(doc, [{ objetivoId: 'obj-9', nivelBloom: 'aplicar' }])).toBe('El objetivo obj-9 no existe');
    expect(aplicarNiveles(doc, [{ pantallaId: 'p28', preguntaId: 'bq-99', nivelBloom: 'aplicar' }])).toBe('La pregunta bq-99 no existe en p28');
    expect(aplicarNiveles(doc, [{ pantallaId: 'p99', nivelBloom: 'aplicar' }])).toBe('La pantalla p99 no existe');
  });
});
