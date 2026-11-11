// HU-1105 · suspend_data v2 (huella del curso e intentos) con lectura de v1, y lectura resiliente: truncado, corrupto o
// de otro curso se descarta sin lanzar (CP-089, CP-092).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplanar } from '../src/navegacion.ts';
import { codificarSuspend, huellaCurso, leerSuspend } from '../src/suspend.ts';
import type { CursoReproductor } from '../src/tipos.ts';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
const orden = aplanar(loto).map((x) => x.pantalla.id);
const H = huellaCurso(loto.id, orden);
const datos = {
  idioma: 'es',
  vistas: orden.slice(0, 12),
  resultados: { p07: { completada: true, puntaje: 100, intentos: 2 }, p10: { completada: true, puntaje: 75, intentos: 1 }, p20: { completada: true, puntaje: null } },
};

describe('suspend_data v2', () => {
  it('guarda la huella del curso y los intentos, y se lee igual', () => {
    const texto = codificarSuspend(orden, datos, H);
    expect(texto).toBe(`2|${H}|es|0-11|6:1:100:2,9:1:75:1,19:1:-`);
    expect(leerSuspend(orden, texto, H)).toEqual(datos);
    // Sin huella esperada se acepta cualquiera (lo usa el diagnóstico); con otra huella, no.
    expect(leerSuspend(orden, texto)).toEqual(datos);
  });

  it('sigue leyendo el formato v1 de los paquetes ya entregados (sin intentos)', () => {
    expect(leerSuspend(orden, '1|es|0-11|6:1:100,19:1:-', H)).toEqual({
      idioma: 'es', vistas: orden.slice(0, 12), resultados: { p07: { completada: true, puntaje: 100 }, p20: { completada: true, puntaje: null } },
    });
  });

  it('la huella cambia con otro curso o con otro orden de pantallas', () => {
    expect(huellaCurso('otro-curso', orden)).not.toBe(H);
    expect(huellaCurso(loto.id, [...orden].reverse())).not.toBe(H);
    expect(huellaCurso(loto.id, orden)).toBe(H);
  });
});

describe('lectura resiliente', () => {
  const bueno = codificarSuspend(orden, datos, H);
  it.each([
    ['vacío', ''],
    ['truncado sin resultados', bueno.slice(0, bueno.lastIndexOf('|'))],
    ['truncado a la mitad de un resultado', bueno.slice(0, bueno.indexOf(':1:75') + 2)],
    ['de otro curso', codificarSuspend(orden, datos, huellaCurso('otro', orden))],
    ['posición que no existe en el curso', `2|${H}|es|0-40|`],
    ['resultado de una pantalla que no existe', `2|${H}|es|0|99:1:80`],
    ['rango al revés', `2|${H}|es|5-2|`],
    ['puntaje fuera de 0–100', `2|${H}|es|0|6:1:180`],
    ['texto que no es número', `2|${H}|es|0-x|`],
    ['completada que no es 0 ni 1', `2|${H}|es|0|6:sí:80`],
    ['idioma raro', `2|${H}|<script>|0|`],
    ['versión desconocida', `3|${H}|es|0|`],
    ['otro formato (otro autor)', '{"pagina":12}'],
  ])('%s → null', (_, texto) => {
    expect(() => leerSuspend(orden, texto, H)).not.toThrow();
    expect(leerSuspend(orden, texto, H)).toBeNull();
  });

  it('tampoco lanza con un valor que no es texto (LMS defectuoso)', () => {
    expect(leerSuspend(orden, null as unknown as string, H)).toBeNull();
    expect(leerSuspend(orden, 42 as unknown as string, H)).toBeNull();
  });
});
