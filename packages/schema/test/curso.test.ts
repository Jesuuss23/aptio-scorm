// CP-002 · Validación compartida: los 17 casos del esquema (1 válido, 16 inválidos),
// el curso esperado del caso LOTO y los tipos generados al día.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advertenciasCurso, type Curso, esCursoValido, validarCurso } from '../src/index.js';
// @ts-expect-error: script en JavaScript sin tipos
import { generar } from '../scripts/generar-tipos.mjs';

const leer = (ruta: string) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const base: Curso = leer('../ejemplos/ejemplo-capsula.json');
// Los casos manipulan el documento como JSON libre, igual que lo haría un cliente de la API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Libre = any;
const pantalla = (c: Libre, id: string): Libre => c.modulos[0].capsulas[0].pantallas.find((p: Libre) => p.id === id);

const casos: [string, (c: Libre) => Libre, boolean][] = [
  ['El ejemplo original es válido', (c) => c, false],
  ['Falta traducción al inglés en un texto', (c) => { delete pantalla(c, 'p01-portada').bloques[0].contenido.en; return c; }, true],
  ['Recurso inexistente', (c) => { pantalla(c, 'p02-energias').bloques[0].recursoId = 'no-existe'; return c; }, true],
  ['Objetivo inexistente', (c) => { pantalla(c, 'p03-memoria').objetivoIds = ['obj-9']; return c; }, true],
  ['Clasificar con grupo inexistente', (c) => { pantalla(c, 'p04-clasificar').bloques[0].interaccion.datos.elementos[0].grupoCorrecto = 'g-otro'; return c; }, true],
  ['Quiz sin opción correcta', (c) => { pantalla(c, 'p06-quiz').bloques[0].interaccion.datos.preguntas[0].opciones.forEach((o: Libre) => (o.correcta = false)); return c; }, true],
  ['Memoria con menos de 3 pares', (c) => { pantalla(c, 'p03-memoria').bloques[0].interaccion.datos.pares.length = 2; return c; }, true],
  ['Imagen no decorativa sin texto alternativo', (c) => { pantalla(c, 'p01-portada').bloques.push({ id: 'b-img', tipo: 'imagen', recursoId: 'img-fondo-planta', decorativa: false }); return c; }, true],
  ['Documento como origen sin página', (c) => { delete pantalla(c, 'p02-energias').bloques[1].origen.paginas; return c; }, true],
  ['Narración generada sin bocas', (c) => { delete pantalla(c, 'p02-energias').narracion.porIdioma.es.bocas; return c; }, true],
  ['Id duplicado', (c) => { pantalla(c, 'p07-cierre').id = 'p01-portada'; return c; }, true],
  ['Bilingüe con un solo idioma', (c) => { c.idiomas = ['es']; return c; }, true],
  ['Pregunta de video sin pregunta', (c) => { delete pantalla(c, 'p05-video').bloques[0].marcadores[1].pregunta; return c; }, true],
  ['Tarjetas (INT-04) como sumativa', (c) => { pantalla(c, 'p03-memoria').bloques[0].interaccion = { tipo: 'INT-04', modo: 'sumativa', datos: { tarjetas: [{ id: 't1', frente: { texto: { es: 'a', en: 'a' } }, reverso: { texto: { es: 'b', en: 'b' } } }, { id: 't2', frente: { texto: { es: 'c', en: 'c' } }, reverso: { texto: { es: 'd', en: 'd' } } }] } }; return c; }, true],
  ['Disposición desconocida (v0.2)', (c) => { pantalla(c, 'p02-energias').disposicion = 'collage'; return c; }, true],
  ['Ajuste con color fuera del kit (v0.2)', (c) => { pantalla(c, 'p02-energias').ajustes.titulo.color = '#FF0000'; return c; }, true],
  ['Elemento agregado sin posición (v0.2)', (c) => { delete pantalla(c, 'p02-energias').extras[0].x; return c; }, true],
];

describe('esquema del curso v0.2 · 17 casos', () => {
  it('son 17 casos', () => expect(casos).toHaveLength(17));
  it.each(casos)('%s', (_nombre, mutar, esperaError) => {
    const { valido, errores } = validarCurso(mutar(structuredClone(base)));
    expect(valido).toBe(!esperaError);
    expect(errores.length > 0).toBe(esperaError);
  });
});

describe('resultado de la validación', () => {
  it('el ejemplo es válido y avisa lo pendiente para exportar', () => {
    const r = validarCurso(base);
    expect(r).toMatchObject({ valido: true, errores: [] });
    expect(r.advertencias).toEqual(advertenciasCurso(base));
    expect(esCursoValido(base)).toBe(true);
  });

  it('un documento que no es un curso devuelve errores del esquema, sin lanzar', () => {
    const r = validarCurso({ titulo: 'sin estructura' });
    expect(r.valido).toBe(false);
    expect(r.errores[0]).toMatch(/^esquema /);
    expect(r.advertencias).toEqual([]);
  });

  it('el curso esperado del caso LOTO es válido', () => {
    const loto = leer('../../ai/casos/loto/curso-esperado-es.json');
    expect(validarCurso(loto).errores).toEqual([]);
  });
});

describe('tipos generados', () => {
  it('src/curso.generado.ts está al día con el esquema', async () => {
    const actual = readFileSync(new URL('../src/curso.generado.ts', import.meta.url), 'utf8');
    expect(actual).toBe(await generar());
  });
});
