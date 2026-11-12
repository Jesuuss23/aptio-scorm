// HU-1203 · En el HTML autocontenido no hay LMS: el paquete no busca la API de SCORM (no toca `API`, `parent` ni
// `opener`), no avisa en la consola y no reporta nada; en SCORM 1.2 la busca como siempre.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegistroDiagnostico } from '../src/diagnostico.ts';
import { conectarPaquete, type DatosPaquete } from '../src/paquete.ts';
import type { VentanaLms } from '../src/scorm12.ts';

const datos = (modo?: 'html' | 'scorm12') => ({ curso: { id: 'c', seguimiento: {} }, idioma: 'es', rutas: {}, ...(modo ? { modo } : {}) }) as unknown as DatosPaquete;

/** Una ventana que cuenta cada vez que alguien mira su API, su padre o su abridora. */
function ventanaEspia(api?: unknown) {
  const vistas: string[] = [];
  const v = {} as VentanaLms;
  for (const k of ['API', 'parent', 'opener'] as const) {
    Object.defineProperty(v, k, { get: () => { vistas.push(k); return k === 'API' ? api : null; } });
  }
  return { v, vistas };
}

const apiFalsa = () => {
  const llamadas: string[] = [];
  const f = (n: string, r = 'true') => (...a: unknown[]) => { llamadas.push([n, ...a].join(' ')); return r; };
  return {
    llamadas,
    api: { LMSInitialize: f('LMSInitialize'), LMSFinish: f('LMSFinish'), LMSGetValue: f('LMSGetValue', ''), LMSSetValue: f('LMSSetValue'), LMSCommit: f('LMSCommit'), LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '' },
  };
};

afterEach(() => vi.restoreAllMocks());

describe('paquete HTML sin LMS (HU-1203)', () => {
  it("con modo 'html' no busca la API, no avisa y no reporta nada", () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { api, llamadas } = apiFalsa();
    const { v, vistas } = ventanaEspia(api);
    const registro = new RegistroDiagnostico();
    const lms = conectarPaquete(datos('html'), v, registro, ['p01', 'p02'], 'h');
    expect(vistas).toEqual([]);
    expect(registro.busqueda).toEqual([]);
    expect(lms.conectado).toBe(false);
    lms.reportar({ pantallaId: 'p02', vistas: ['p01', 'p02'], resultados: {}, progreso: 50, puntos: 0 } as never);
    lms.terminar();
    expect(llamadas).toEqual([]);
    expect(registro.total()).toBe(0);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('sin modo (SCORM 1.2) busca la API en la ventana y se conecta', () => {
    const { api, llamadas } = apiFalsa();
    const { v, vistas } = ventanaEspia(api);
    const registro = new RegistroDiagnostico();
    const lms = conectarPaquete(datos(), v, registro, ['p01'], 'h');
    expect(vistas[0]).toBe('API');
    expect(registro.busqueda).toEqual([{ nivel: 0, origen: 'propia', resultado: 'api' }]);
    expect(lms.conectado).toBe(true);
    expect(llamadas[0]).toBe('LMSInitialize ');
  });
});
