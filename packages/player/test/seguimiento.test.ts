import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { puntajeMemoria, porcentaje } from '../src/interacciones/comun.ts';
import { promedio } from '../src/interacciones/decision.ts';
import { desordenar } from '../src/interacciones/ordenar.ts';
import { acierta } from '../src/interacciones/quiz.ts';
import { barajar } from '../src/dom.ts';
import { aplanar } from '../src/navegacion.ts';
import { seguimiento } from '../src/seguimiento.ts';
import type { CursoReproductor, ResultadoActividad } from '../src/tipos.ts';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
const pantallas = aplanar(loto);
const todas = new Set(pantallas.map((x) => x.pantalla.id));
const con = (pares: [string, number | null][]) => new Map<string, ResultadoActividad>(pares.map(([id, p]) => [id, { completada: true, puntaje: p }]));
const actividades = pantallas.filter((x) => x.conActividad).map((x) => x.pantalla.id);

describe('seguimiento que se reportaría al LMS', () => {
  it('empieza incompleto y sin nota', () => {
    expect(seguimiento(pantallas, new Set(['p01']), new Map(), loto.seguimiento)).toEqual({ progreso: 3, nota: null, puntos: 0, leccion: 'incomplete' });
  });

  it('la nota sale solo de la sumativa (p28) y aprueba con 70', () => {
    const formativas = actividades.filter((id) => id !== 'p28').map((id): [string, number | null] => [id, 40]);
    const aprobado = seguimiento(pantallas, todas, con([...formativas, ['p28', 80]]), loto.seguimiento);
    expect(aprobado).toMatchObject({ progreso: 100, nota: 80, leccion: 'passed' });
    expect(seguimiento(pantallas, todas, con([...formativas, ['p28', 60]]), loto.seguimiento)).toMatchObject({ nota: 60, leccion: 'failed' });
  });

  it('con «pantallas obligatorias» se completa al recorrerlas con sus actividades', () => {
    const reglas = { ...loto.seguimiento, criterioCompletado: 'pantallas-obligatorias' as const };
    expect(seguimiento(pantallas, todas, con(actividades.slice(1).map((id): [string, number] => [id, 100])), reglas).leccion).toBe('incomplete');
    expect(seguimiento(pantallas, todas, con(actividades.map((id): [string, number] => [id, 100])), reglas).leccion).toBe('completed');
  });
});

describe('puntajes de las interacciones (docs/05-interacciones.md)', () => {
  it('memoria: 100 × pares / (pares + errores × 0,5)', () => {
    expect(puntajeMemoria(4, 0)).toBe(100);
    expect(puntajeMemoria(4, 2)).toBe(80);
  });
  it('clasificar, ordenar, quiz y deslizar: % de aciertos', () => {
    expect(porcentaje(5, 7)).toBe(71);
    expect(porcentaje(0, 0)).toBe(0);
  });
  it('quiz: acierta solo con exactamente las correctas', () => {
    const p = { opciones: [{ id: 'a', correcta: true }, { id: 'b', correcta: true }, { id: 'c', correcta: false }] } as Parameters<typeof acierta>[0];
    expect(acierta(p, new Set(['a', 'b']))).toBe(true);
    expect(acierta(p, new Set(['a']))).toBe(false);
    expect(acierta(p, new Set(['a', 'b', 'c']))).toBe(false);
  });
  it('decisión: promedio del camino', () => {
    expect(promedio([100, 50])).toBe(75);
    expect(promedio([])).toBe(0);
  });
  it('baraja igual con la misma clave y ordenar nunca empieza resuelto', () => {
    const pasos = ['a', 'b', 'c', 'd', 'e'];
    expect(barajar(pasos, 'p15')).toEqual(barajar(pasos, 'p15'));
    for (const clave of ['x', 'y', 'z', 'p15-ordenar-0', 'p15-ordenar-1']) expect(desordenar(pasos, clave)).not.toEqual(pasos);
    expect([...desordenar(pasos, 'q')].sort()).toEqual(pasos);
  });
});
