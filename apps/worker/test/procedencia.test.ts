// HU-1406 · REQ-062 · Un recurso GENERADO no se guarda sin proveedor, modelo y licencia; lo de la plataforma es `aptio`.
import { describe, expect, it } from 'vitest';
import { conProcedencia, PROCEDENCIA_SUBTITULOS, procedenciaPaquete } from '../src/procedencia.js';

describe('procedencia de los recursos generados (HU-1406)', () => {
  it('deja pasar un recurso generado con los tres datos, y cualquiera que no sea generado', () => {
    const voz = { origen: 'GENERADO', nombre: 'p01-es.mp3', proveedor: 'google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech' };
    expect(conProcedencia(voz)).toBe(voz);
    expect(conProcedencia({ origen: 'CLIENTE', nombre: 'manual.pdf' })).toEqual({ origen: 'CLIENTE', nombre: 'manual.pdf' });
  });

  it('rechaza un recurso generado al que le falta algún dato, y dice cuál', () => {
    expect(() => conProcedencia({ origen: 'GENERADO', nombre: 'p01-es.vtt', licencia: 'Generado por Aptio SCORM' }))
      .toThrow('El recurso generado «p01-es.vtt» no tiene proveedor, modelo (REQ-062)');
    expect(() => conProcedencia({ origen: 'GENERADO', nombre: 'x.png', proveedor: 'recraft', modelo: 'recraftv3', licencia: '  ' })).toThrow('no tiene licencia');
  });

  it('los subtítulos por letras y el paquete se registran con el proveedor aptio', () => {
    expect(conProcedencia({ origen: 'GENERADO', nombre: 'p01-es.vtt', ...PROCEDENCIA_SUBTITULOS })).toMatchObject({ proveedor: 'aptio', modelo: 'subtitulos-por-letras v1' });
    expect(procedenciaPaquete('SCORM12')).toEqual({ proveedor: 'aptio', modelo: 'exportador-scorm12 v1', licencia: 'Paquete generado por Aptio SCORM' });
    expect(procedenciaPaquete('HTML').modelo).toBe('exportador-html v1');
  });
});
