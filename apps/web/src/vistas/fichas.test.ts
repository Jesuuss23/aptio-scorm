import { describe, expect, it } from 'vitest';
import { leerInforme, resumenInforme } from './fichas';

describe('informe del modo diagnóstico en la ficha (HU-1204)', () => {
  it('acepta un objeto JSON, deja vacío como «sin informe» y rechaza lo demás', () => {
    expect(leerInforme('')).toEqual({});
    expect(leerInforme('  \n')).toEqual({});
    expect(leerInforme('{"aptio":"diagnostico-scorm12"}')).toEqual({ informe: { aptio: 'diagnostico-scorm12' } });
    for (const malo of ['{"a":', '[1,2]', '"texto"', '3', 'null']) expect(leerInforme(malo).error).toMatch(/no es un JSON válido/);
  });

  it('resume si el paquete encontró la API y en qué navegador', () => {
    expect(resumenInforme(null)).toBe('—');
    expect(resumenInforme({ api: { encontrada: false }, navegador: 'Chrome 130 · Windows NT 10.0' })).toBe('Sin API SCORM · Chrome 130 · Windows NT 10.0');
    expect(resumenInforme({ api: { encontrada: true, conectado: true } })).toBe('API encontrada');
    expect(resumenInforme({ api: { encontrada: true, conectado: false } })).toBe('API encontrada, sin conexión');
    expect(resumenInforme({ otro: 1 })).toBe('Informe pegado');
  });
});
