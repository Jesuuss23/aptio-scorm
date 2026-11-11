// HU-1202 · Adaptador SCORM 1.2: búsqueda de la API (algoritmo de ADL), ciclo de vida, tolerancia a errores del LMS y
// límite de suspend_data (CP-091, CP-092 preliminar).
// HU-1105 · Sin LMSCommit al entrar y sin degradar un «passed» ni bajar la nota que el LMS ya tenía (CP-092).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aplanar } from '../src/navegacion.ts';
import { type ApiScorm12, buscarApi, codificarSuspend, conectarScorm12, huellaCurso, LIMITE_SUSPEND, leerSuspend, tiempoScorm, type VentanaLms } from '../src/scorm12.ts';
import type { CursoReproductor } from '../src/tipos.ts';

const loto = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoReproductor;
const orden = aplanar(loto).map((x) => x.pantalla.id);
const H = huellaCurso('', orden);

/** LMS de prueba: guarda los valores y registra cada llamada. `fallar` hace que esos elementos respondan error 405. */
function lmsDePrueba(inicial: Record<string, string> = {}, fallar: string[] = []) {
  const valores: Record<string, string> = { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', ...inicial };
  const llamadas: string[] = [];
  let error = '0';
  const api: ApiScorm12 = {
    LMSInitialize: () => { llamadas.push('LMSInitialize'); error = '0'; return 'true'; },
    LMSFinish: () => { llamadas.push('LMSFinish'); error = '0'; return 'true'; },
    LMSGetValue: (k) => { llamadas.push(`get ${k}`); error = '0'; return valores[k] ?? ''; },
    LMSSetValue: (k, v) => {
      llamadas.push(`set ${k}`);
      if (fallar.includes(k)) { error = '405'; return 'false'; }
      error = '0';
      valores[k] = v;
      return 'true';
    },
    LMSCommit: () => { llamadas.push('LMSCommit'); error = '0'; return 'true'; },
    LMSGetLastError: () => error,
    LMSGetErrorString: (c) => (c === '405' ? 'Incorrect Data Type' : ''),
    LMSGetDiagnostic: () => '',
  };
  return { api, valores, llamadas };
}

const estado = (pantallaId: string, extra: Partial<{ nota: number | null; leccion: 'incomplete' | 'completed' | 'passed' | 'failed'; vistas: string[] }> = {}) => ({
  pantallaId, nota: null, leccion: 'incomplete' as const, vistas: orden.slice(0, orden.indexOf(pantallaId) + 1), resultados: {}, ...extra,
});

describe('búsqueda de la API (algoritmo de ADL)', () => {
  it('la encuentra en la propia ventana, en un padre o en la ventana que abrió el curso', () => {
    const { api } = lmsDePrueba();
    const propia: VentanaLms = { API: api };
    expect(buscarApi(propia)).toBe(api);

    const lms: VentanaLms = { API: api };
    lms.parent = lms;
    const marco: VentanaLms = { parent: lms };
    const curso: VentanaLms = { parent: marco };
    expect(buscarApi(curso)).toBe(api);

    const abridora: VentanaLms = { API: api };
    const emergente: VentanaLms = { opener: abridora };
    emergente.parent = emergente;
    expect(buscarApi(emergente)).toBe(api);
  });

  it('se rinde después de 7 niveles y no falla con ventanas de otro origen', () => {
    const { api } = lmsDePrueba();
    let ventana: VentanaLms = { API: api };
    for (let i = 0; i < 9; i++) ventana = { parent: ventana };
    expect(buscarApi(ventana)).toBeNull();

    const ajena = Object.defineProperty({}, 'API', { get() { throw new Error('SecurityError'); } }) as VentanaLms;
    expect(buscarApi({ parent: ajena })).toBeNull();
    expect(buscarApi({})).toBeNull();
  });
});

describe('ciclo de vida CMI', () => {
  it('inicia en incomplete con exit=suspend, reporta avance con LMSCommit y termina con tiempo y LMSFinish', () => {
    const { api, valores, llamadas } = lmsDePrueba();
    let reloj = 0;
    const lms = conectarScorm12(api, { orden, idioma: 'es', avisar: () => {}, ahora: () => reloj });
    expect(lms.conectado).toBe(true);
    expect(llamadas[0]).toBe('LMSInitialize');
    expect(valores['cmi.core.lesson_status']).toBe('incomplete');
    expect(valores['cmi.core.exit']).toBe('suspend');
    // Al entrar no se hace LMSCommit: lo guardado no cambia hasta el primer avance.
    expect(llamadas).not.toContain('LMSCommit');

    reloj = 65_000;
    expect(lms.reportar(estado('p03'))).toBe(true);
    expect(valores['cmi.core.lesson_location']).toBe('p03');
    expect(valores['cmi.suspend_data']).toBe(`2|${H}|es|0-2|`);
    expect(valores['cmi.core.session_time']).toBe('00:01:05');
    expect(llamadas.at(-1)).toBe('LMSCommit');

    // Sin cambios no se escribe ni se hace commit.
    const antes = llamadas.length;
    expect(lms.reportar(estado('p03'))).toBe(false);
    expect(llamadas.length).toBe(antes);

    lms.reportar(estado('p28', { nota: 80, leccion: 'passed', vistas: orden }));
    expect(valores).toMatchObject({ 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '80', 'cmi.core.score.min': '0', 'cmi.core.score.max': '100' });

    reloj = 3_725_000;
    lms.terminar();
    lms.terminar();
    expect(valores['cmi.core.session_time']).toBe('01:02:05');
    expect(llamadas.slice(-2)).toEqual(['LMSCommit', 'LMSFinish']);
    expect(llamadas.filter((x) => x === 'LMSFinish')).toHaveLength(1);
  });

  it('lee lo guardado al volver y no reabre un estado ya cerrado', () => {
    const { api, valores } = lmsDePrueba({ 'cmi.core.lesson_status': 'passed', 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': '1|es|0-11|' });
    const lms = conectarScorm12(api, { orden, idioma: 'es', avisar: () => {} });
    expect(lms.inicial).toEqual({ entrada: 'resume', ubicacion: 'p12', suspendData: '1|es|0-11|', estado: 'passed', nota: '' });
    expect(valores['cmi.core.lesson_status']).toBe('passed');
  });

  it('un «passed» guardado no vuelve a incomplete al empezar de nuevo, y la nota no baja (mejor nota)', () => {
    const { api, valores } = lmsDePrueba({ 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90', 'cmi.core.entry': 'resume' });
    const lms = conectarScorm12(api, { orden, idioma: 'es', avisar: () => {} });
    lms.reportar(estado('p01'));
    expect(valores['cmi.core.lesson_status']).toBe('passed');
    expect(valores['cmi.core.lesson_location']).toBe('p01');
    expect(valores['cmi.suspend_data']).toBe(`2|${H}|es|0|`);
    lms.reportar(estado('p28', { nota: 60, leccion: 'failed', vistas: orden }));
    expect(valores).toMatchObject({ 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' });
    lms.reportar(estado('p28', { nota: 95, leccion: 'passed', vistas: orden }));
    expect(valores['cmi.core.score.raw']).toBe('95');
  });

  it('con «última nota» la nota puede bajar, pero el estado no se degrada', () => {
    const { api, valores } = lmsDePrueba({ 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '90' });
    const lms = conectarScorm12(api, { orden, idioma: 'es', mejorNota: false, avisar: () => {} });
    lms.reportar(estado('p28', { nota: 40, leccion: 'incomplete', vistas: orden }));
    expect(valores).toMatchObject({ 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '40' });
    lms.reportar(estado('p28', { nota: 80, leccion: 'passed', vistas: orden }));
    expect(valores['cmi.core.lesson_status']).toBe('passed');
  });

  it('un error del LMS se avisa y no corta el resto del reporte', () => {
    const { api, valores } = lmsDePrueba({}, ['cmi.core.score.raw']);
    const avisos: string[] = [];
    const lms = conectarScorm12(api, { orden, idioma: 'es', avisar: (m) => avisos.push(m) });
    expect(() => lms.reportar(estado('p28', { nota: 90, leccion: 'passed' }))).not.toThrow();
    expect(valores['cmi.core.lesson_status']).toBe('passed');
    expect(valores['cmi.suspend_data']).toMatch(/^2\|[0-9a-z]+\|es\|/);
    expect(avisos).toEqual(['LMSSetValue("cmi.core.score.raw") respondió el error 405 (Incorrect Data Type).']);
  });

  it('una API que lanza excepciones tampoco rompe el curso', () => {
    const { api } = lmsDePrueba();
    const rota: ApiScorm12 = { ...api, LMSSetValue: () => { throw new Error('LMS caído'); } };
    const avisos: string[] = [];
    const lms = conectarScorm12(rota, { orden, idioma: 'es', avisar: (m) => avisos.push(m) });
    expect(lms.reportar(estado('p02'))).toBe(false);
    expect(avisos[0]).toContain('LMS caído');
  });

  it('sin API (HTML fuera del LMS) no hace nada', () => {
    const lms = conectarScorm12(null, { orden, idioma: 'es', avisar: () => { throw new Error('no debe avisar'); } });
    expect(lms.conectado).toBe(false);
    expect(lms.reportar(estado('p02'))).toBe(false);
    expect(() => lms.terminar()).not.toThrow();
  });

  it('si LMSInitialize falla, no envía nada más', () => {
    const { api, llamadas } = lmsDePrueba();
    const lms = conectarScorm12({ ...api, LMSInitialize: () => 'false' }, { orden, idioma: 'es', avisar: () => {} });
    expect(lms.conectado).toBe(false);
    lms.reportar(estado('p02'));
    expect(llamadas.filter((x) => x.startsWith('set'))).toEqual([]);
  });
});

describe('suspend_data', () => {
  it('codifica y lee avance y resultados de LOTO en pocos caracteres', () => {
    const datos = { idioma: 'es', vistas: orden, resultados: { p07: { completada: true, puntaje: 100 }, p20: { completada: true, puntaje: null }, p28: { completada: true, puntaje: 80 } } };
    const texto = codificarSuspend(orden, datos);
    expect(texto).toBe(`2|${H}|es|0-29|6:1:100,19:1:-,27:1:80`);
    expect(leerSuspend(orden, texto)).toEqual(datos);
    expect(leerSuspend(orden, 'otro formato')).toBeNull();
    expect(leerSuspend(orden, '')).toBeNull();
  });

  it('no envía un suspend_data de más de 4096 caracteres y lo avisa una sola vez', () => {
    const largo = Array.from({ length: 2000 }, (_, i) => `x${i}`);
    const resultados = Object.fromEntries(largo.map((id) => [id, { completada: true, puntaje: 50 }]));
    // Vistas salteadas para que no se puedan juntar en rangos.
    const vistas = largo.filter((_, i) => i % 2 === 0);
    expect(codificarSuspend(largo, { idioma: 'es', vistas, resultados }).length).toBeGreaterThan(LIMITE_SUSPEND);

    const { api, valores } = lmsDePrueba();
    const avisos: string[] = [];
    const lms = conectarScorm12(api, { orden: largo, idioma: 'es', avisar: (m) => avisos.push(m) });
    lms.reportar({ pantallaId: 'x10', nota: null, leccion: 'incomplete', vistas, resultados });
    lms.reportar({ pantallaId: 'x12', nota: null, leccion: 'incomplete', vistas, resultados });
    expect(valores['cmi.suspend_data']).toBeUndefined();
    expect(valores['cmi.core.lesson_location']).toBe('x12');
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('4096');
  });

  it('el tiempo de sesión sigue el formato HH:MM:SS', () => {
    expect(tiempoScorm(0)).toBe('00:00:00');
    expect(tiempoScorm(59_999)).toBe('00:00:59');
    expect(tiempoScorm(36_000_000 * 15)).toBe('150:00:00');
  });
});
