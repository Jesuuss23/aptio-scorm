// HU-1204 · CP-094 · Modo diagnóstico: búsqueda de la API con cada nivel y las ventanas de otro origen, registro de las
// últimas 200 llamadas con valores recortados a 200 caracteres, y un informe sin datos del participante.
import { describe, expect, it } from 'vitest';
import { ELEMENTOS_PRIVADOS, informeDiagnostico, MAXIMO_LLAMADAS, navegadorResumido, RegistroDiagnostico, VERSION_REPRODUCTOR } from '../src/diagnostico.ts';
import { type ApiScorm12, buscarApi, conectarScorm12, type VentanaLms } from '../src/scorm12.ts';

function api(valores: Record<string, string> = {}, error = '0'): ApiScorm12 {
  return {
    LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true',
    LMSGetValue: (k) => valores[k] ?? '', LMSSetValue: (k, v) => { valores[k] = v; return 'true'; },
    LMSGetLastError: () => error, LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
  };
}
const contexto = (registro: RegistroDiagnostico, conectado: boolean) => informeDiagnostico(registro, {
  curso: { id: 'c1', titulo: 'Bloqueo y etiquetado', pantallas: 30, huella: 'abc' }, conectado,
  inicial: { entrada: 'ab-initio', ubicacion: '', estado: 'not attempted', nota: '', suspendData: '' },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', enIframe: true,
  ahora: new Date('2026-11-11T12:00:00Z'),
});

describe('búsqueda de la API con registro', () => {
  it('sin API anota los 8 niveles (0 a 7) de ventanas padre y la ventana que abrió el curso', () => {
    let ventana: VentanaLms = {};
    for (let i = 0; i < 9; i++) ventana = { parent: ventana };
    const abridora: VentanaLms = {};
    const registro = new RegistroDiagnostico();
    expect(buscarApi({ ...ventana, opener: abridora }, registro)).toBeNull();
    expect(registro.busqueda.filter((p) => p.origen !== 'opener').map((p) => p.nivel)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(registro.busqueda[0]).toEqual({ nivel: 0, origen: 'propia', resultado: 'sin-api' });
    expect(registro.busqueda.at(-1)).toEqual({ nivel: 0, origen: 'opener', resultado: 'sin-api' });
    expect(registro.hallazgo()).toBeNull();
  });

  it('marca la ventana de otro origen y dónde quedó la API', () => {
    const ajena = Object.defineProperty({ parent: { API: api() } }, 'API', { get() { throw new Error('SecurityError'); } }) as VentanaLms;
    const registro = new RegistroDiagnostico();
    expect(buscarApi({ parent: ajena }, registro)).not.toBeNull();
    expect(registro.busqueda).toEqual([
      { nivel: 0, origen: 'propia', resultado: 'sin-api' },
      { nivel: 1, origen: 'padre', resultado: 'otro-origen' },
      { nivel: 2, origen: 'padre', resultado: 'api' },
    ]);
    expect(registro.hallazgo()).toEqual({ origen: 'padre', nivel: 2 });
  });
});

describe('registro de llamadas', () => {
  it('anota cada llamada al LMS con su respuesta y el código de error', () => {
    const registro = new RegistroDiagnostico(() => 0);
    const lms = conectarScorm12(api({ 'cmi.core.entry': 'ab-initio' }), { orden: ['p01'], idioma: 'es', registro, avisar: () => {} });
    lms.reportar({ pantallaId: 'p01', nota: null, leccion: 'incomplete', vistas: ['p01'], resultados: {} });
    lms.terminar();
    const metodos = registro.lista().map((l) => l.metodo);
    expect(metodos[0]).toBe('LMSInitialize');
    expect(metodos).toContain('LMSGetValue');
    expect(metodos).toContain('LMSSetValue');
    expect(metodos).toContain('LMSCommit');
    expect(metodos.at(-1)).toBe('LMSFinish');
    expect(registro.lista().find((l) => l.elemento === 'cmi.core.entry')).toEqual({ ms: 0, metodo: 'LMSGetValue', elemento: 'cmi.core.entry', respuesta: 'ab-initio', error: '0' });
    expect(registro.lista().find((l) => l.metodo === 'LMSSetValue' && l.elemento === 'cmi.core.lesson_location')).toMatchObject({ metodo: 'LMSSetValue', valor: 'p01', respuesta: 'true', error: '0' });
  });

  it('anota el error del LMS y la excepción si lanza', () => {
    const registro = new RegistroDiagnostico();
    conectarScorm12(api({}, '101'), { orden: ['p01'], idioma: 'es', registro, avisar: () => {} });
    expect(registro.lista()[0]).toMatchObject({ metodo: 'LMSInitialize', error: '101' });
    const otro = new RegistroDiagnostico();
    conectarScorm12({ ...api(), LMSInitialize: () => { throw new Error('caído'); } }, { orden: ['p01'], idioma: 'es', registro: otro, avisar: () => {} });
    expect(otro.lista()[0]).toMatchObject({ metodo: 'LMSInitialize', respuesta: '(excepción) caído' });
  });

  it('guarda solo las últimas 200 y recorta cada valor a 200 caracteres', () => {
    const registro = new RegistroDiagnostico();
    for (let i = 0; i < 250; i++) registro.anotarLlamada('LMSSetValue', 'true', '0', 'cmi.suspend_data', `${i}|${'x'.repeat(500)}`);
    expect(registro.total()).toBe(250);
    expect(registro.lista()).toHaveLength(MAXIMO_LLAMADAS);
    expect(registro.lista()[0]!.valor!.startsWith('50|')).toBe(true);
    expect(registro.lista().every((l) => l.valor!.length === 200)).toBe(true);
    let avisos = 0;
    const dejar = registro.escuchar(() => avisos++);
    registro.anotarLlamada('LMSCommit', 'true', '0');
    dejar();
    registro.anotarLlamada('LMSCommit', 'true', '0');
    expect(avisos).toBe(1);
  });
});

describe('informe', () => {
  it('nunca lleva el id ni el nombre del participante', () => {
    const registro = new RegistroDiagnostico();
    registro.anotarLlamada('LMSGetValue', 'Ana Quispe', '0', 'cmi.core.student_name');
    registro.anotarLlamada('LMSGetValue', 'U-20231', '0', 'cmi.core.student_id');
    registro.anotarLlamada('LMSSetValue', 'true', '0', 'cmi.core.student_name', 'Ana Quispe');
    const texto = JSON.stringify(contexto(registro, true));
    expect(texto).not.toContain('Ana Quispe');
    expect(texto).not.toContain('U-20231');
    expect(ELEMENTOS_PRIVADOS).toEqual(['cmi.core.student_id', 'cmi.core.student_name']);
    expect(registro.lista().every((l) => l.respuesta === '[omitido]')).toBe(true);
  });

  it('trae la búsqueda, lo leído al entrar, el navegador resumido y las versiones', () => {
    const registro = new RegistroDiagnostico();
    buscarApi({}, registro);
    const inf = contexto(registro, false);
    expect(inf).toMatchObject({
      aptio: 'diagnostico-scorm12', version: 1, generado: '2026-11-11T12:00:00.000Z', reproductor: VERSION_REPRODUCTOR,
      curso: { id: 'c1', pantallas: 30, huella: 'abc' }, navegador: 'Chrome 131 · Windows NT 10.0', enIframe: true,
      api: { encontrada: false, origen: null, nivel: null, conectado: false },
      busqueda: [{ nivel: 0, origen: 'propia', resultado: 'sin-api' }],
      inicial: { entrada: 'ab-initio', estado: 'not attempted', suspendDataCaracteres: 0 },
      llamadas: { total: 0, guardadas: 0, lista: [] },
    });
  });

  it('resume el navegador sin el resto del User-Agent', () => {
    expect(navegadorResumido('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15')).toBe('Safari 17 · Mac OS X 14.5');
    expect(navegadorResumido('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Edge 131 · Windows NT 10.0');
    expect(navegadorResumido('raro')).toBe('Desconocido · sistema desconocido');
  });
});
