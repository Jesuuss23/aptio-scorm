// @vitest-environment happy-dom
// HU-0610 · Disparadores simples en el reproductor (CP-069, REQ-045, RN-11-4): con el reloj de la línea de tiempo,
// «a los 3 s → mostrar botón» hace aparecer un botón oculto; «termina la voz» se cumple al terminar el audio o, sin audio,
// al entrar; «ir a» respeta la regla; al volver a la pantalla todo empieza de nuevo. En el editor se ven con ▶.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cumplidos, visibilidad } from '../src/disparadores.ts';
import { ESTILOS } from '../src/estilos.ts';
import { montar, type OpcionesReproductor } from '../src/reproductor.ts';
import type { CursoReproductor, Disparador, Pantalla } from '../src/tipos.ts';
import { cursoLotoBase } from './catalogo.ts';

const BOTON = 'p05-boton-seguir';
const mostrarA3: Disparador = { id: 'p05-disp-1', cuando: { evento: 'tiempo', segundo: 3 }, accion: { tipo: 'mostrar', elementoId: BOTON } };
/** LOTO con un botón agregado y oculto en p05, y los disparadores dados. */
function curso(disparadores: Disparador[], ajustes: Pantalla['ajustes'] = {}): CursoReproductor {
  const c = cursoLotoBase();
  const p = c.modulos.flatMap((m) => m.capsulas.flatMap((x) => x.pantallas)).find((x) => x.id === 'p05')!;
  p.extras = [{ id: BOTON, tipo: 'boton', texto: { es: 'Seguir' }, x: 60, y: 80, ancho: 25 }];
  p.ajustes = { [BOTON]: { oculto: true }, ...ajustes };
  p.disparadores = disparadores;
  return c;
}
const SIN_AUDIO = { urlRecurso: () => undefined } as const;
function abrir(c: CursoReproductor, opciones: OpcionesReproductor = SIN_AUDIO) {
  const contenedor = document.createElement('div');
  document.body.replaceChildren(contenedor);
  const r = montar(contenedor, c, opciones);
  r.ir('p05');
  const el = (id: string) => contenedor.shadowRoot!.querySelector<HTMLElement>(`[data-bloque="${id}"]`)!;
  const visible = (id: string) => !['ap-oculto-el', 'ap-fuera', 'ap-disparo-oculto'].some((k) => el(id).classList.contains(k));
  return { r, el, visible, sombra: contenedor.shadowRoot! };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('disparadores en el reproductor (HU-0610)', () => {
  it('se cumplen una vez, en orden; manda el último que se cumplió sobre cada elemento', () => {
    const lista: Disparador[] = [mostrarA3, { id: 'd2', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ocultar', elementoId: BOTON } }];
    expect(cumplidos(lista, new Set(), 2.9, false)).toEqual([]);
    expect(cumplidos(lista, new Set(), 3, false).map((d) => d.id)).toEqual(['p05-disp-1']);
    expect(cumplidos(lista, new Set(['p05-disp-1']), 9, true).map((d) => d.id)).toEqual(['d2']);
    expect(visibilidad(lista, ['p05-disp-1'])).toEqual(new Map([[BOTON, 'mostrar']]));
    expect(visibilidad(lista, ['p05-disp-1', 'd2'])).toEqual(new Map([[BOTON, 'ocultar']]));
    expect(ESTILOS).toContain('.ap-r .ap-disparo-oculto{display:none!important}');
  });

  it('CP-069 · «a los 3 s → mostrar botón»: el botón oculto aparece a los 3 s', () => {
    const { r, visible } = abrir(curso([mostrarA3]));
    expect(visible(BOTON)).toBe(false);
    vi.advanceTimersByTime(2900);
    expect(visible(BOTON)).toBe(false);
    vi.advanceTimersByTime(200);
    expect(visible(BOTON)).toBe(true);
    expect(r.estado().disparados).toEqual(['p05-disp-1']);
  });

  it('«mostrar» gana sobre retardoS y «ocultar» sobre finS (sin finS el elemento quedaría)', () => {
    const { visible } = abrir(curso([
      { id: 'd1', cuando: { evento: 'tiempo', segundo: 1 }, accion: { tipo: 'mostrar', elementoId: 'p05-dato' } },
      { id: 'd2', cuando: { evento: 'tiempo', segundo: 2 }, accion: { tipo: 'ocultar', elementoId: 'p05-titulo' } },
    ], { 'p05-dato': { retardoS: 10 } }));
    expect([visible('p05-dato'), visible('p05-titulo')]).toEqual([false, true]);
    vi.advanceTimersByTime(1100);
    expect([visible('p05-dato'), visible('p05-titulo')]).toEqual([true, true]);
    vi.advanceTimersByTime(1000);
    expect([visible('p05-dato'), visible('p05-titulo')]).toEqual([true, false]);
  });

  it('«termina la voz»: sin audio en el idioma se cumple al entrar; con audio, al terminar (en pausa, espera)', () => {
    const ocultarImagen: Disparador = { id: 'd1', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ocultar', elementoId: 'p05-imagen' } };
    const sin = abrir(curso([ocultarImagen]));
    expect(sin.visible('p05-imagen')).toBe(false);
    expect(sin.r.estado().disparados).toEqual(['d1']);
    sin.r.destruir();

    const con = abrir(curso([ocultarImagen]), { urlRecurso: () => 'data:audio/wav;base64,' });
    vi.advanceTimersByTime(20_000);
    expect(con.visible('p05-imagen')).toBe(true);
    con.sombra.querySelector('audio')!.dispatchEvent(new Event('ended'));
    expect(con.visible('p05-imagen')).toBe(false);
    expect(con.r.estado().disparados).toEqual(['d1']);
  });

  it('«ir a otra pantalla» salta si la regla lo deja; si la bloquea (RN-11-4), no salta y dice por qué', () => {
    const atras = abrir(curso([{ id: 'd1', cuando: { evento: 'tiempo', segundo: 1 }, accion: { tipo: 'ir-a', pantallaId: 'p03' } }]));
    vi.advanceTimersByTime(1100);
    expect(atras.r.estado().pantallaId).toBe('p03');
    atras.r.destruir();

    // p09 queda después de la memoria de p07 sin hacer (actividades obligatorias).
    const lejos = abrir(curso([{ id: 'd1', cuando: { evento: 'tiempo', segundo: 1 }, accion: { tipo: 'ir-a', pantallaId: 'p09' } }]));
    vi.advanceTimersByTime(1100);
    expect(lejos.r.estado()).toMatchObject({ pantallaId: 'p05', disparados: ['d1'] });
    expect(lejos.sombra.querySelector('#ap-motivo')!.textContent).toBe('Completa la actividad para continuar');
  });

  it('al salir y volver a entrar, los elementos y los disparadores empiezan de nuevo', () => {
    const { r, visible } = abrir(curso([mostrarA3]));
    vi.advanceTimersByTime(3100);
    expect(visible(BOTON)).toBe(true);
    r.siguiente();
    r.anterior();
    expect(r.estado()).toMatchObject({ pantallaId: 'p05', disparados: [] });
    expect(visible(BOTON)).toBe(false);
    vi.advanceTimersByTime(3100);
    expect(visible(BOTON)).toBe(true);
  });

  it('en el editor se ve todo; con ▶ Reproducir se aplican en vivo y un «ir a» solo se avisa', () => {
    const saltos: unknown[] = [];
    const { r, el } = abrir(curso([mostrarA3, { id: 'd2', cuando: { evento: 'tiempo', segundo: 4 }, accion: { tipo: 'ir-a', pantallaId: 'p09' } }]), {
      ...SIN_AUDIO, sinTiempos: true, sinAcciones: true, revision: true, alSalto: (x) => saltos.push(x),
    });
    // Lienzo quieto: el botón oculto se ve tenue (lo pinta el editor) y no corre ningún disparador.
    vi.advanceTimersByTime(5000);
    expect(el(BOTON).classList.contains('ap-oculto-el')).toBe(true);
    expect(saltos).toEqual([]);
    r.reproducir(0);
    vi.advanceTimersByTime(3100);
    expect(el(BOTON).classList.contains('ap-oculto-el')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(saltos).toEqual([{ pantallaId: 'p09', bloqueado: null }]);
    expect(r.estado().pantallaId).toBe('p05');
    // Al mover la aguja vuelve a como lo dejó el editor.
    r.irA(1);
    expect(el(BOTON).classList.contains('ap-oculto-el')).toBe(true);
  });
});
