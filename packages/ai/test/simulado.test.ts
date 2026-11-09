import { describe, expect, it } from 'vitest';
import { leerSalidaSimulada, tareasSimuladas, validarSalida } from '../src/index.js';

describe('modo simulado con el caso LOTO', () => {
  it('responde las 18 tareas de IA más voz y boca', () => {
    const tareas = tareasSimuladas();
    expect(tareas.filter((t) => t.startsWith('IA-'))).toHaveLength(18);
    expect(tareas).toEqual(expect.arrayContaining(['IA-01', 'IA-18', 'VOZ', 'BOCA']));
  });

  it('cada salida grabada valida contra su esquema', () => {
    for (const tarea of tareasSimuladas()) expect(() => leerSalidaSimulada(tarea), tarea).not.toThrow();
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
