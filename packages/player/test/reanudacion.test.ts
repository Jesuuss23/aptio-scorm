// HU-1105 · Cuándo se pregunta «¿Continuar donde lo dejaste?» y con qué estado se monta el reproductor (CP-089, CP-092).
// El aviso dentro del Shadow DOM y los botones se prueban en Playwright (apps/web/e2e/reanudacion.spec.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplanar } from '../src/navegacion.ts';
import { decidirReanudacion, estadoReanudado } from '../src/reanudacion.ts';
import { codificarSuspend, huellaCurso } from '../src/suspend.ts';
import type { CursoReproductor } from '../src/tipos.ts';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
const pantallas = aplanar(loto);
const orden = pantallas.map((x) => x.pantalla.id);
const H = huellaCurso(loto.id, orden);
const resultados = { p07: { completada: true, puntaje: 100, intentos: 1 }, p10: { completada: true, puntaje: 50, intentos: 3 } };
const suspend = codificarSuspend(orden, { idioma: 'es', vistas: orden.slice(0, 12), resultados }, H);

describe('decidir si se reanuda', () => {
  it('con avance válido y una pantalla que no es la primera, devuelve dónde y con qué volver', () => {
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p12', suspendData: suspend }, orden, H)).toEqual({ pantallaId: 'p12', vistas: orden.slice(0, 12), resultados });
    // Hay LMS que no informan cmi.core.entry: se acepta si lo guardado es válido.
    expect(decidirReanudacion({ entrada: '', ubicacion: 'p12', suspendData: suspend }, orden, H)).not.toBeNull();
  });

  it('no pregunta en un intento nuevo, en la primera pantalla, sin ubicación válida ni con datos de otro curso', () => {
    expect(decidirReanudacion({ entrada: 'ab-initio', ubicacion: 'p12', suspendData: suspend }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p01', suspendData: suspend }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p99', suspendData: suspend }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: '', suspendData: suspend }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p12', suspendData: '' }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p12', suspendData: suspend.slice(0, -4) }, orden, H)).toBeNull();
    expect(decidirReanudacion({ entrada: 'resume', ubicacion: 'p12', suspendData: suspend }, orden, huellaCurso('otro', orden))).toBeNull();
  });
});

describe('montar con `reanudar`', () => {
  it('restaura vistas, resultados con sus intentos y la pantalla actual; lo más lejano visto queda alcanzable', () => {
    const x = estadoReanudado(pantallas, { pantallaId: 'p12', vistas: orden.slice(0, 12), resultados });
    expect(x.actual).toBe(11);
    expect(x.maxima).toBe(11);
    expect([...x.vistas]).toEqual(orden.slice(0, 12));
    expect(Object.fromEntries(x.resultados)).toEqual(resultados);
  });

  it('descarta ids que ya no están y, si la pantalla no existe, empieza en la primera', () => {
    const x = estadoReanudado(pantallas, { pantallaId: 'p99', vistas: ['p01', 'p02', 'borrada'], resultados: { borrada: { completada: true, puntaje: 10 } } });
    expect(x.actual).toBe(0);
    expect([...x.vistas]).toEqual(['p01', 'p02']);
    expect(x.resultados.size).toBe(0);
    expect(x.maxima).toBe(1);
  });

  it('la pantalla actual cuenta como vista aunque no viniera en la lista', () => {
    const x = estadoReanudado(pantallas, { pantallaId: 'p05', vistas: ['p01'], resultados: {} });
    expect([...x.vistas]).toEqual(['p01', 'p05']);
    expect(x.maxima).toBe(4);
  });
});
