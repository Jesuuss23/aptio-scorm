// @vitest-environment happy-dom
// HU-1401 · CP-101 · El foco nunca se pierde en las 8 interacciones: cuando el control que se usó se quita o se
// desactiva, el foco pasa al resultado, a la pregunta siguiente o a la otra flecha. El quiz con tiempo deja quitar el
// límite (WCAG 2.2.1) sin tocar vidas ni puntaje.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextoActividad } from '../src/interacciones/comun.ts';
import { ACTIVIDADES } from '../src/interacciones/index.ts';
import { textos } from '../src/textos.ts';
import type { ResultadoActividad, TipoInteraccion } from '../src/tipos.ts';
import { datosDe } from './catalogo.ts';

type D = Record<string, unknown>;
const es = (x: unknown) => (x as { es?: string; texto?: { es?: string } })?.es ?? (x as { texto?: { es?: string } })?.texto?.es ?? '';

function montar(tipo: TipoInteraccion, cambiar: (d: D) => D = (d) => d) {
  const { id, modo, datos } = datosDe(tipo);
  const anuncios: string[] = [];
  const resultados: ResultadoActividad[] = [];
  const ctx: ContextoActividad = {
    id, idioma: 'es', tx: textos('es'), modo, intentosMaximos: null, urlRecurso: () => undefined,
    anunciar: (t) => anuncios.push(t), terminar: (r) => resultados.push(r), activo: () => true,
  };
  const juego = document.createElement('div');
  juego.className = 'ap-juego';
  juego.append(ACTIVIDADES[tipo](cambiar(structuredClone(datos)), ctx));
  document.body.replaceChildren(juego);
  return { juego, datos: cambiar(structuredClone(datos)), anuncios, resultados };
}

/** Lo que hace el teclado: enfocar el botón y activarlo (Enter o Espacio disparan click). */
const pulsar = async (el: Element | null) => {
  expect(el, 'el control existe').not.toBeNull();
  (el as HTMLElement).focus();
  (el as HTMLElement).click();
  await Promise.resolve();
};
const activo = () => document.activeElement as HTMLElement | null;
const boton = (raiz: Element, texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(texto)) ?? null;

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('foco en las interacciones (HU-1401)', () => {
  it('INT-01 · la carta emparejada conserva el foco (aria-disabled, no disabled); al terminar, el foco va al resultado y Reintentar vuelve al inicio', async () => {
    const { juego, datos } = montar('INT-01');
    const cartas = () => [...juego.querySelectorAll<HTMLButtonElement>('.ap-carta')];
    const texto = (b: HTMLButtonElement) => (b.getAttribute('aria-label') ?? '').replace(/^Carta \d+: /, '');
    // Se abren de a dos para leerlas.
    const leidas: string[] = [];
    for (let i = 0; i < cartas().length; i += 2) {
      await pulsar(cartas()[i]!); leidas[i] = texto(cartas()[i]!);
      await pulsar(cartas()[i + 1]!); leidas[i + 1] = texto(cartas()[i + 1]!);
    }
    // Tras cada pareja (salvo la que termina el juego), la segunda carta sigue enfocada y no está desactivada.
    const tras: { enfocada: boolean; disabled: boolean; aria: string | null }[] = [];
    for (const p of datos.pares as { a: unknown; b: unknown }[]) {
      const a = cartas()[leidas.indexOf(es(p.a))]!;
      const b = cartas()[leidas.indexOf(es(p.b))]!;
      if (a.classList.contains('ap-pareja')) continue;
      await pulsar(a);
      await pulsar(b);
      tras.push({ enfocada: activo() === b, disabled: b.disabled, aria: b.getAttribute('aria-disabled') });
    }
    expect(tras.length).toBeGreaterThan(1);
    expect(tras.slice(0, -1)).toEqual(tras.slice(0, -1).map(() => ({ enfocada: true, disabled: false, aria: 'true' })));
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
    expect(activo()?.getAttribute('tabindex')).toBe('-1');
    await pulsar(boton(juego, 'Intentar de nuevo'));
    expect(activo()).toBe(cartas()[0]);
  });

  it('INT-02 · al comprobar, «Comprobar» desaparece y el foco pasa al resultado, que también se anuncia', async () => {
    const { juego, datos, anuncios } = montar('INT-02');
    for (const e of datos.elementos as { id: string; grupoCorrecto: string }[]) await pulsar(juego.querySelector(`[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`));
    await pulsar(boton(juego, 'Comprobar'));
    expect(boton(juego, 'Comprobar')).toBeNull();
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
    expect(anuncios.at(-1)).toBe(activo()?.textContent?.replace('★ ', ''));
  });

  it('INT-03 · al llegar al primer lugar, la flecha ↑ se desactiva y el foco pasa a la ↓ del mismo paso', async () => {
    const { juego } = montar('INT-03');
    const segundo = juego.querySelectorAll('.ap-paso')[1]!.getAttribute('data-paso')!;
    await pulsar(juego.querySelector(`[data-paso="${segundo}"] [data-mover="-1"]`));
    const fila = juego.querySelector(`[data-paso="${segundo}"]`)!;
    expect([...juego.querySelectorAll('.ap-paso')].indexOf(fila)).toBe(0);
    expect(activo()).toBe(fila.querySelector('[data-mover="1"]'));
    // Bajar desde ahí deja el foco en la misma flecha, que sigue disponible.
    await pulsar(activo());
    expect(activo()?.getAttribute('data-mover')).toBe('1');
    expect(activo()?.closest('.ap-paso')?.getAttribute('data-paso')).toBe(segundo);
    await pulsar(boton(juego, 'Comprobar'));
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
  });

  it('INT-04 · la tarjeta volteada conserva el foco y anuncia que terminó', async () => {
    const { juego, anuncios, resultados } = montar('INT-04');
    for (const t of juego.querySelectorAll<HTMLButtonElement>('.ap-tarjeta')) {
      await pulsar(t);
      expect(activo()).toBe(t);
      expect(t.getAttribute('aria-pressed')).toBe('true');
    }
    expect(resultados).toEqual([{ completada: true, puntaje: null }]);
    expect(anuncios).toContain('Actividad completada');
  });

  it('INT-05 · tras responder, el foco va a «Siguiente pregunta»; luego, al enunciado nuevo; al final, al resultado', async () => {
    const { juego } = montar('INT-05');
    for (let n = 0; ; n++) {
      const opcion = juego.querySelector<HTMLButtonElement>('.ap-opcion:not([disabled])');
      if (!opcion) break;
      await pulsar(opcion);
      const seguir = juego.querySelector<HTMLButtonElement>('.ap-acciones .ap-primario');
      if (seguir?.textContent === 'Responder') await pulsar(seguir);
      const siguiente = juego.querySelector<HTMLButtonElement>('.ap-acciones .ap-primario')!;
      expect(activo()).toBe(siguiente);
      const fin = siguiente.textContent === 'Ver resultado';
      await pulsar(siguiente);
      if (fin) break;
      expect(activo()?.classList.contains('ap-enunciado')).toBe(true);
      expect(n).toBeLessThan(20);
    }
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
  });

  it('INT-05 · «Quitar el límite de tiempo» detiene el reloj en esta y en las preguntas siguientes, sin quitar vidas', async () => {
    vi.useFakeTimers();
    const { juego, anuncios } = montar('INT-05');
    const vidas = () => juego.querySelector('.ap-vidas')?.getAttribute('aria-label');
    const antes = vidas();
    expect(juego.querySelector('.ap-tiempo')?.textContent).toBe('30 s');
    vi.advanceTimersByTime(3000);
    expect(juego.querySelector('.ap-tiempo')?.textContent).toBe('27 s');
    await pulsar(boton(juego, 'Quitar el límite de tiempo'));
    expect(boton(juego, 'Quitar el límite de tiempo')).toBeNull();
    expect(juego.querySelector('.ap-tiempo')?.textContent).toBe('Sin límite de tiempo');
    expect(activo()?.classList.contains('ap-enunciado')).toBe(true);
    expect(anuncios.at(-1)).toBe('Límite de tiempo quitado: responde a tu ritmo.');
    // Pasan dos minutos: nadie responde por tiempo y las vidas siguen.
    vi.advanceTimersByTime(120_000);
    expect(juego.querySelector('.ap-retro')?.textContent).toBe('');
    expect(vidas()).toBe(antes);
    // La pregunta siguiente tampoco tiene reloj ni botón.
    await pulsar(juego.querySelector('.ap-opcion:not([disabled])'));
    await pulsar(juego.querySelector('.ap-acciones .ap-primario'));
    expect(juego.querySelector('.ap-tiempo')?.textContent).toBe('Sin límite de tiempo');
    expect(boton(juego, 'Quitar el límite de tiempo')).toBeNull();
    vi.advanceTimersByTime(120_000);
    expect(juego.querySelector('.ap-retro')?.textContent).toBe('');
  });

  it('INT-05 · sin quitarlo, el tiempo se acaba como antes y el foco va a «Siguiente pregunta»', () => {
    vi.useFakeTimers();
    const { juego } = montar('INT-05');
    (juego.querySelector('.ap-opcion') as HTMLElement).focus();
    vi.advanceTimersByTime(30_000);
    expect(juego.querySelector('.ap-retro')?.textContent).toContain('Se acabó el tiempo');
    expect(boton(juego, 'Quitar el límite de tiempo')).toBeNull();
    expect(activo()).toBe(juego.querySelector('.ap-acciones .ap-primario'));
  });

  it('INT-06 · el punto abierto conserva el foco y su contenido se anuncia', async () => {
    const { juego } = montar('INT-06');
    const panel = juego.querySelector('.ap-panel-punto')!;
    expect(panel.getAttribute('aria-live')).toBe('polite');
    for (const p of juego.querySelectorAll<HTMLButtonElement>('.ap-punto')) {
      await pulsar(p);
      expect(activo()).toBe(p);
      expect(panel.textContent).not.toBe('');
    }
  });

  it('INT-07 · tras responder, el foco va a «Continuar»; luego, a la afirmación siguiente', async () => {
    const { juego } = montar('INT-07');
    for (;;) {
      const opcion = juego.querySelector<HTMLButtonElement>('[data-respuesta]:not([disabled])');
      if (!opcion) break;
      await pulsar(opcion);
      const seguir = juego.querySelector<HTMLButtonElement>('.ap-acciones .ap-primario')!;
      expect(activo()).toBe(seguir);
      const fin = seguir.textContent === 'Ver resultado';
      await pulsar(seguir);
      if (fin) break;
      expect(activo()?.closest('.ap-afirmacion')).not.toBeNull();
      expect(activo()?.textContent).toMatch(/^«.+»$/);
    }
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
  });

  it('INT-08 · tras elegir, el foco va a «Continuar»; luego, a la situación siguiente; al final, al resultado', async () => {
    const { juego } = montar('INT-08');
    for (;;) {
      await pulsar(juego.querySelector('.ap-opcion:not([disabled])'));
      const seguir = juego.querySelector<HTMLButtonElement>('.ap-acciones .ap-primario')!;
      expect(activo()).toBe(seguir);
      const fin = seguir.textContent !== 'Continuar';
      await pulsar(seguir);
      if (fin) break;
      expect(activo()?.classList.contains('ap-situacion')).toBe(true);
    }
    expect(activo()?.classList.contains('ap-resultado-texto')).toBe(true);
    // Reintentar lleva el foco a la primera situación, para que el lector la lea.
    await pulsar(boton(juego, 'Intentar de nuevo'));
    expect(activo()?.classList.contains('ap-situacion')).toBe(true);
  });
});
