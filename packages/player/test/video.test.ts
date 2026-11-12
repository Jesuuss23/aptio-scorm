// @vitest-environment happy-dom
// HU-0901 · Preguntas en el video (CP-080, RN-09-1): con un reloj simulado (el `timeupdate` del video), el video se
// detiene en el tiempo de la pregunta y la muestra; al acertar sigue solo; al fallar muestra la retroalimentación y deja
// reintentar; una no obligatoria se salta; la pantalla queda completa al terminar el video con las obligatorias hechas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aplanar, motivoBloqueo } from '../src/navegacion.ts';
import { montar } from '../src/reproductor.ts';
import type { BloqueVideo, CursoReproductor, Idioma, MarcadorVideo } from '../src/tipos.ts';
import { preguntaAlcanzada, saltoBloqueado, videoCompleto } from '../src/video.ts';
import { cursoLotoBase } from './catalogo.ts';

const q = (id: string, segundo: number, obligatorio = true): MarcadorVideo => ({
  id, tiempoMs: segundo * 1000, tipo: 'pregunta', obligatorio,
  pregunta: {
    id: `${id}-q`, enunciado: { es: '¿Qué se hace antes de apagar el equipo?' },
    opciones: [{ id: `${id}-a`, contenido: { texto: { es: 'Avisar a los afectados' } }, correcta: true }, { id: `${id}-b`, contenido: { texto: { es: 'Retirar los candados' } }, correcta: false }],
    retroalimentacion: { correcta: { es: 'Bien: primero se avisa.' }, incorrecta: { es: 'Primero se avisa a los afectados.' } },
  },
});
const capitulo: MarcadorVideo = { id: 'cap', tiempoMs: 0, tipo: 'capitulo', obligatorio: false, titulo: { es: 'Inicio' } };

function curso(marcadores: MarcadorVideo[], impedirAdelantar = false): CursoReproductor {
  const c = cursoLotoBase();
  const p = c.modulos.flatMap((m) => m.capsulas.flatMap((x) => x.pantallas)).find((x) => x.id === 'p18')!;
  const v = p.bloques.find((b) => b.tipo === 'video') as BloqueVideo;
  v.marcadores = marcadores;
  v.reglas = { impedirAdelantar, porcentajeMinimo: 90 };
  return c;
}

/** Monta LOTO en p18 con un video simulado: `avanzar(s)` mueve el reloj y dispara `timeupdate`, como el navegador. */
function abrir(marcadores: MarcadorVideo[], { impedir = false, idioma = 'es' as Idioma } = {}) {
  const contenedor = document.createElement('div');
  document.body.replaceChildren(contenedor);
  const c = curso(marcadores, impedir);
  if (idioma === 'en') c.idiomas = ['es', 'en'];
  const r = montar(contenedor, c, { revision: true, idioma, urlRecurso: (id) => (id === 'vid-procedimiento' ? 'data:video/mp4;base64,' : undefined) });
  r.ir('p18');
  const sombra = contenedor.shadowRoot!;
  const video = sombra.querySelector('video')!;
  let tiempo = 0;
  let pausado = true;
  Object.defineProperty(video, 'currentTime', { get: () => tiempo, set: (v: number) => { tiempo = v; }, configurable: true });
  Object.defineProperty(video, 'paused', { get: () => pausado, configurable: true });
  video.play = vi.fn<() => Promise<void>>(() => { pausado = false; video.dispatchEvent(new Event('play')); return Promise.resolve(); });
  video.pause = vi.fn<() => void>(() => { pausado = true; });
  const avanzar = (hasta: number) => { if (pausado) return; tiempo = hasta; video.dispatchEvent(new Event('timeupdate')); };
  const pregunta = () => sombra.querySelector<HTMLElement>('.ap-video-pregunta');
  const opcion = (texto: string) => [...sombra.querySelectorAll<HTMLButtonElement>('.ap-video-pregunta .ap-opcion')].find((b) => b.textContent === texto)!;
  /** Mueve la aguja como el navegador: `seeking` con el tiempo nuevo y luego `seeked`. */
  const ir = (s: number) => { tiempo = s; video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked')); };
  const aviso = () => sombra.querySelector<HTMLElement>('.ap-video-bloqueo[role="alert"]')!.textContent;
  return { r, video, avanzar, ir, aviso, pregunta, opcion, sombra, tiempo: () => tiempo, pausado: () => pausado };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('preguntas en el video (HU-0901)', () => {
  it('una pregunta se alcanza al cruzar su tiempo reproduciendo; el capítulo y lo resuelto no cuentan', () => {
    const lista = [capitulo, q('m2', 80), q('m1', 45)];
    expect(preguntaAlcanzada(lista, new Set(), 44.75, 44.99)).toBeNull();
    expect(preguntaAlcanzada(lista, new Set(), 44.75, 45.2)?.id).toBe('m1');
    expect(preguntaAlcanzada(lista, new Set(['m1']), 44.75, 90)?.id).toBe('m2');
    expect(preguntaAlcanzada(lista, new Set(), 60, 10)).toBeNull();
    expect(preguntaAlcanzada([q('m0', 0)], new Set(), -1, 0.1)?.id).toBe('m0');
    expect(videoCompleto(lista, new Set(['m1']), true)).toBe(false);
    expect(videoCompleto([q('m1', 45), q('m2', 80, false)], new Set(['m1']), true)).toBe(true);
    expect(videoCompleto([q('m1', 45)], new Set(['m1']), false)).toBe(false);
  });

  it('CP-080 · con una pregunta en 0:45, al reproducir el video se detiene en 0:45 y la muestra; acertar lo reanuda', async () => {
    const { video, avanzar, pregunta, opcion, sombra, tiempo, pausado } = abrir([capitulo, q('m1', 45)]);
    await video.play();
    avanzar(44.8);
    expect(pregunta()).toBeNull();
    avanzar(45.1);
    expect(pausado()).toBe(true);
    expect(tiempo()).toBe(45);
    expect(pregunta()!.getAttribute('role')).toBe('dialog');
    expect(pregunta()!.textContent).toContain('Pregunta en 0:45');
    expect(sombra.activeElement?.textContent).toBe('¿Qué se hace antes de apagar el equipo?');
    // Mientras la pregunta está abierta, el video no arranca.
    await video.play();
    expect(pausado()).toBe(true);
    opcion('Avisar a los afectados').click();
    expect(pregunta()!.textContent).toContain('Bien: primero se avisa.');
    vi.advanceTimersByTime(900);
    expect(pregunta()).toBeNull();
    expect(pausado()).toBe(false);
    // Ya respondida, no vuelve a salir.
    avanzar(46);
    expect(pregunta()).toBeNull();
  });

  it('al fallar muestra la retroalimentación y deja reintentar', async () => {
    const { video, avanzar, pregunta, opcion, pausado } = abrir([q('m1', 45)]);
    await video.play();
    avanzar(45.2);
    opcion('Retirar los candados').click();
    expect(pregunta()!.textContent).toContain('Primero se avisa a los afectados. Intenta de nuevo.');
    expect(opcion('Retirar los candados').getAttribute('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(2000);
    expect(pregunta()).not.toBeNull();
    expect(pausado()).toBe(true);
    opcion('Avisar a los afectados').click();
    vi.advanceTimersByTime(900);
    expect(pregunta()).toBeNull();
  });

  it('una pregunta no obligatoria se salta; una obligatoria no tiene «Saltar»', async () => {
    const opcional = abrir([q('m1', 10, false)]);
    await opcional.video.play();
    opcional.avanzar(10.3);
    const saltar = [...opcional.sombra.querySelectorAll('button')].find((b) => b.textContent === 'Saltar')!;
    saltar.click();
    expect(opcional.pregunta()).toBeNull();
    expect(opcional.pausado()).toBe(false);
    const obligatoria = abrir([q('m1', 10)]);
    await obligatoria.video.play();
    obligatoria.avanzar(10.3);
    expect([...obligatoria.sombra.querySelectorAll('button')].some((b) => b.textContent === 'Saltar')).toBe(false);
  });

  it('la pantalla queda completa al terminar el video con las obligatorias respondidas', async () => {
    const { r, video, avanzar, opcion } = abrir([q('m1', 45), q('m2', 80, false)]);
    await video.play();
    avanzar(45.1);
    opcion('Avisar a los afectados').click();
    vi.advanceTimersByTime(900);
    expect(r.estado().resultados.p18).toBeUndefined();
    video.dispatchEvent(new Event('ended'));
    expect(r.estado().resultados.p18).toEqual({ completada: true, puntaje: null, intentos: 1 });
  });

  it('terminar el video sin responder la obligatoria no la completa; una pantalla obligatoria con video bloquea con su motivo', async () => {
    const { r, video } = abrir([q('m1', 45)]);
    await video.play();
    video.dispatchEvent(new Event('ended'));
    expect(r.estado().resultados.p18).toBeUndefined();
    const pantallas = aplanar(curso([q('m1', 45)]));
    const i = pantallas.findIndex((x) => x.pantalla.id === 'p18');
    expect(pantallas[i]).toMatchObject({ conActividad: true, conVideo: true });
    const resultados = new Map(pantallas.slice(0, i).map((x) => [x.pantalla.id, { completada: true, puntaje: null, intentos: 1 }]));
    expect(motivoBloqueo(pantallas, { actual: i, maxima: i, resultados }, 'secuencial', i + 1)).toBe('video');
    resultados.set('p18', { completada: true, puntaje: null, intentos: 1 });
    expect(motivoBloqueo(pantallas, { actual: i, maxima: i, resultados }, 'secuencial', i + 1)).toBeNull();
  });

  it('si el archivo no carga, avisa y la pantalla no se bloquea por eso', () => {
    const { r, video, sombra } = abrir([q('m1', 45)]);
    video.dispatchEvent(new Event('error'));
    expect(sombra.querySelector('.ap-video-aviso[role="status"]')!.textContent).toBe('El video no se pudo cargar; puedes continuar.');
    expect(r.estado().resultados.p18).toEqual({ completada: true, puntaje: null, intentos: 1 });
  });
});

describe('impedir adelantar (HU-0902)', () => {
  it('con la regla, ir más allá de una pregunta pendiente devuelve la primera de ellas; sin la regla o resuelta, nada', () => {
    const lista = [capitulo, q('m2', 130), q('m1', 80, false)];
    expect(saltoBloqueado(lista, new Set(), 120, true)?.id).toBe('m1');
    expect(saltoBloqueado(lista, new Set(), 80, true)).toBeNull();
    expect(saltoBloqueado(lista, new Set(), 60, true)).toBeNull();
    expect(saltoBloqueado(lista, new Set(['m1']), 140, true)?.id).toBe('m2');
    expect(saltoBloqueado(lista, new Set(['m1', 'm2']), 140, true)).toBeNull();
    expect(saltoBloqueado(lista, new Set(), 140, false)).toBeNull();
  });

  it('CP-081 · con una pregunta pendiente en 1:20, ir a 2:00 no se permite: vuelve a 1:20, la muestra y dice por qué', async () => {
    const { video, avanzar, ir, aviso, pregunta, tiempo, pausado } = abrir([q('m1', 80)], { impedir: true });
    await video.play();
    avanzar(30);
    ir(120);
    expect(tiempo()).toBe(80);
    expect(pausado()).toBe(true);
    expect(pregunta()!.getAttribute('role')).toBe('dialog');
    expect(pregunta()!.textContent).toContain('Pregunta en 1:20');
    expect(aviso()).toBe('No puedes adelantar: responde primero la pregunta de 1:20.');
  });

  it('en inglés el aviso sale en inglés', async () => {
    const { video, ir, aviso } = abrir([q('m1', 80)], { impedir: true, idioma: 'en' });
    await video.play();
    ir(120);
    expect(aviso()).toBe("You can't skip ahead: first answer the question at 1:20.");
  });

  it('retroceder siempre se puede; sin la regla se adelanta libre', async () => {
    const con = abrir([q('m1', 80)], { impedir: true });
    await con.video.play();
    con.avanzar(50);
    con.ir(10);
    expect(con.tiempo()).toBe(10);
    expect(con.pregunta()).toBeNull();
    expect(con.aviso()).toBe('');

    const sin = abrir([q('m1', 80)]);
    await sin.video.play();
    sin.ir(120);
    expect(sin.tiempo()).toBe(120);
    expect(sin.pregunta()).toBeNull();
  });

  it('después de responderla o saltarla se puede pasar', async () => {
    const { video, avanzar, ir, aviso, opcion, tiempo, pregunta } = abrir([q('m1', 80), q('m2', 100, false)], { impedir: true });
    await video.play();
    avanzar(80.1);
    opcion('Avisar a los afectados').click();
    vi.advanceTimersByTime(900);
    ir(120);
    // Queda la opcional de 1:40: también bloquea hasta saltarla.
    expect(tiempo()).toBe(100);
    expect(aviso()).toBe('No puedes adelantar: responde primero la pregunta de 1:40.');
    [...pregunta()!.querySelectorAll('button')].find((b) => b.textContent === 'Saltar')!.click();
    expect(aviso()).toBe('');
    ir(120);
    expect(tiempo()).toBe(120);
    expect(pregunta()).toBeNull();
  });
});
