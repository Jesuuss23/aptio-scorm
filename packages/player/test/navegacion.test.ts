import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplanar, type Avance, modoDe, motivoBloqueo } from '../src/navegacion.ts';
import type { CursoReproductor, ResultadoActividad } from '../src/tipos.ts';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
const pantallas = aplanar(loto);
const indice = (id: string) => pantallas.findIndex((x) => x.pantalla.id === id);
const avance = (actual: number, maxima = actual, hechas: string[] = []): Avance => ({
  actual, maxima, resultados: new Map<string, ResultadoActividad>(hechas.map((id) => [id, { completada: true, puntaje: 100 }])),
});

describe('reglas de avance (RN-11-1, RN-11-4)', () => {
  it('aplana las 30 pantallas de LOTO en orden y marca las que tienen actividad', () => {
    expect(pantallas).toHaveLength(30);
    expect(pantallas[0]!.pantalla.id).toBe('p01');
    expect(pantallas.filter((x) => x.conActividad).map((x) => x.pantalla.id)).toEqual(['p07', 'p10', 'p15', 'p17', 'p20', 'p22', 'p25', 'p26', 'p28']);
  });

  it('sin navegación en el curso usa actividades obligatorias', () => {
    const { navegacion: _n, ...sin } = loto;
    expect(modoDe(sin)).toBe('condiciones');
    expect(modoDe(loto)).toBe('condiciones');
  });

  it('CP-086: con actividades obligatorias no pasa de una actividad sin hacerla', () => {
    const p07 = indice('p07');
    expect(motivoBloqueo(pantallas, avance(p07), 'condiciones', p07 + 1)).toBe('actividad');
    expect(motivoBloqueo(pantallas, avance(p07, p07, ['p07']), 'condiciones', p07 + 1)).toBeNull();
    // Tampoco desde el temario se salta una actividad pendiente, pero sí se vuelve atrás.
    expect(motivoBloqueo(pantallas, avance(2), 'condiciones', indice('p09'))).toBe('actividad');
    expect(motivoBloqueo(pantallas, avance(2), 'condiciones', indice('p05'))).toBeNull();
    expect(motivoBloqueo(pantallas, avance(p07), 'condiciones', 0)).toBeNull();
  });

  it('libre deja ir a cualquier pantalla', () => {
    expect(motivoBloqueo(pantallas, avance(0), 'libre', 29)).toBeNull();
    expect(motivoBloqueo(pantallas, avance(0), 'libre', 30)).toBe('orden');
  });

  it('secuencial deja ir a las vistas y a la siguiente de la más lejana', () => {
    expect(motivoBloqueo(pantallas, avance(1, 3), 'secuencial', 3)).toBeNull();
    expect(motivoBloqueo(pantallas, avance(1, 3), 'secuencial', 4)).toBeNull();
    expect(motivoBloqueo(pantallas, avance(1, 3), 'secuencial', 5)).toBe('orden');
    const p07 = indice('p07');
    expect(motivoBloqueo(pantallas, avance(p07), 'secuencial', p07 + 1)).toBe('actividad');
  });
});
