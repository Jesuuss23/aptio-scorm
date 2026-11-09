import { describe, expect, it } from 'vitest';
import { COLAS, esCola, leerEvento, opcionesRedis } from '../src/index.js';

describe('colas y eventos', () => {
  it('define las cuatro colas de la arquitectura', () => {
    expect(COLAS).toEqual(['ia', 'voz', 'media', 'export']);
    expect(esCola('voz')).toBe(true);
    expect(esCola('otra')).toBe(false);
  });

  it('toma Redis de las variables de entorno', () => {
    expect(opcionesRedis({ REDIS_HOST: 'redis', REDIS_PORT: '6380' })).toMatchObject({ host: 'redis', port: 6380 });
    expect(opcionesRedis({})).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('lee un evento válido y descarta lo demás', () => {
    const evento = {
      tipo: 'estado', trabajoId: 't1', organizacionId: 'o1', cola: 'ia', tarea: 'IA-01',
      estado: 'EN_CURSO', progreso: 0, en: new Date(0).toISOString(),
    };
    expect(leerEvento(JSON.stringify(evento))).toEqual(evento);
    expect(leerEvento('no es json')).toBeNull();
    expect(leerEvento(JSON.stringify({ ...evento, cola: 'otra' }))).toBeNull();
    expect(leerEvento(JSON.stringify({ cola: 'ia' }))).toBeNull();
  });
});
