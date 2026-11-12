// HU-1202 · Perfiles de la Entrega y peso legible del paquete.
import { describe, expect, it } from 'vitest';
import type { Recurso } from '../api';
import { esDeIa, mb, megas, PERFILES, recursosDelCurso } from './entrega';

describe('entrega', () => {
  it('ofrece los 5 perfiles del contrato, cada uno con su recomendación', () => {
    expect(PERFILES.map((p) => p.id)).toEqual(['generico', 'moodle', 'blackboard', 'chamilo', 'canvas']);
    expect(PERFILES.every((p) => p.recomendacion.length > 40)).toBe(true);
  });

  it('muestra el peso en KB o MB', () => {
    expect(megas(null)).toBe('—');
    expect(megas(200)).toBe('1 KB');
    expect(megas(512_000)).toBe('500 KB');
    expect(megas(15_518_924)).toBe('14.8 MB');
  });

  it('HU-1201 · el peso estimado en MB lleva un decimal como máximo', () => {
    expect(mb(300.04)).toBe('300');
    expect(mb(14.83)).toBe('14.8');
    expect(mb(1234.5)).toBe('1,234.5');
  });

  it('HU-1406 · lista los recursos generados que usa el curso, sin paquetes: lo de IA primero', () => {
    const r = (id: string, tipo: string, nombre: string, proveedor: string | null) => ({ id, tipo, nombre, proveedor }) as Recurso;
    const documento = { recursos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'p' }] };
    const lista = recursosDelCurso(documento, [
      r('c', 'SUBTITULO', 'p01.vtt', 'aptio'), r('b', 'IMAGEN', 'Faja.png', 'recraft'), r('a', 'AUDIO', 'p01.mp3', 'google'),
      r('d', 'AUDIO', 'Aarón.mp3', 'google'), r('p', 'PAQUETE', 'curso.zip', 'aptio'), r('x', 'IMAGEN', 'Suelta.png', 'recraft'),
    ]);
    expect(lista.map((x) => x.nombre)).toEqual(['Aarón.mp3', 'p01.mp3', 'Faja.png', 'p01.vtt']);
    expect(recursosDelCurso({}, [r('a', 'AUDIO', 'p01.mp3', 'google')])).toEqual([]);
    expect([esDeIa({ proveedor: 'google' }), esDeIa({ proveedor: 'Aptio' }), esDeIa({ proveedor: null }), esDeIa({ proveedor: ' ' })]).toEqual([true, false, false, false]);
  });
});
