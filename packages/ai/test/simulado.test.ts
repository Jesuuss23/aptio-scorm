import { describe, expect, it } from 'vitest';
import { leerSalidaSimulada, tareasSimuladas, validarSalida } from '../src/index.js';

describe('modo simulado con el caso LOTO', () => {
  it('responde las 19 tareas de IA más voz y boca', () => {
    const tareas = tareasSimuladas();
    expect(tareas.filter((t) => t.startsWith('IA-'))).toHaveLength(19);
    expect(tareas).toEqual(expect.arrayContaining(['IA-01', 'IA-19', 'VOZ', 'BOCA']));
  });

  it('cada salida grabada valida contra su esquema', () => {
    const fallidas = tareasSimuladas().filter((tarea) => {
      try {
        leerSalidaSimulada(tarea);
        return false;
      } catch {
        return true;
      }
    });
    expect(fallidas).toEqual([]);
  });

  it('devuelve la estructura de IA-04', () => {
    const r = leerSalidaSimulada('IA-04');
    expect(r.archivo).toBe('02-IA-04-estructura.json');
    expect(r.datos).toHaveProperty('objetivos');
  });

  it('rechaza una salida que no cumple el esquema y una tarea desconocida', () => {
    expect(validarSalida('IA-04', { objetivos: 'no es una lista' }).length).toBeGreaterThan(0);
    expect(() => leerSalidaSimulada('IA-99')).toThrow(/no tiene salida/);
  });
});
