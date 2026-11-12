// @vitest-environment happy-dom
// HU-1103 · Patrones de navegación (RN-11-1, RN-11-2, RN-11-4, CP-087): los 7 patrones dibujan su marco sobre el mismo
// núcleo. Historias avanza con las zonas ‹ ›, deslizando y con las flechas, y respeta la regla secuencial; el mapa de
// misiones agrupa por secciones y deja entrar solo a las estaciones que permite la regla.
import { afterEach, describe, expect, it } from 'vitest';
import { aplanar } from '../src/navegacion.ts';
import { estaciones, PATRONES_BASE, patronDe } from '../src/patrones.ts';
import { montar } from '../src/reproductor.ts';
import type { CursoReproductor, Navegacion } from '../src/tipos.ts';
import { cursoLotoBase } from './catalogo.ts';

const con = (navegacion: Navegacion): CursoReproductor => ({ ...cursoLotoBase(), navegacion: { ...cursoLotoBase().navegacion, ...navegacion } });
function contenedorNuevo() {
  const c = document.createElement('div');
  document.body.replaceChildren(c);
  return c;
}
const raiz = (c: HTMLElement) => c.shadowRoot!.querySelector<HTMLElement>('.ap-r')!;
/** Nombre accesible aproximado: aria-label o el texto sin lo que está oculto al lector (aria-hidden). */
const textoLeido = (n: Node): string => n.nodeType === 3 ? n.textContent ?? '' : (n as Element).getAttribute?.('aria-hidden') === 'true' ? '' : [...n.childNodes].map(textoLeido).join('');
const nombreDe = (b: HTMLElement) => (b.getAttribute('aria-label') ?? textoLeido(b)).trim();
const boton = (c: HTMLElement, nombre: string | RegExp) => [...c.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')]
  .find((b) => !b.hidden && (typeof nombre === 'string' ? nombreDe(b) === nombre : nombre.test(nombreDe(b))));
const motivo = (c: HTMLElement) => c.shadowRoot!.querySelector('#ap-motivo')?.textContent;
const tecla = (c: HTMLElement, key: string) => raiz(c).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const deslizar = (c: HTMLElement, dx: number, dy = 0) => {
  const cuerpo = c.shadowRoot!.querySelector('.ap-cuerpo')!;
  cuerpo.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true }));
  cuerpo.dispatchEvent(new PointerEvent('pointerup', { clientX: 200 + dx, clientY: 200 + dy, bubbles: true }));
};
const p07 = aplanar(cursoLotoBase()).findIndex((x) => x.pantalla.id === 'p07');

afterEach(() => { document.body.replaceChildren(); });

describe('patrones de navegación (HU-1103)', () => {
  it('patronDe: sin navegación, Clásico; el personalizado usa su base; un valor desconocido cae en Clásico', () => {
    expect(patronDe(undefined)).toBe('clasico');
    for (const p of PATRONES_BASE) expect(patronDe({ patron: p })).toBe(p);
    expect(patronDe({ patron: 'personalizado', patronPersonalizado: { base: 'mapa', progreso: 'puntos' } })).toBe('mapa');
    expect(patronDe({ patron: 'personalizado' })).toBe('clasico');
    expect(patronDe({ patron: 'carrusel' })).toBe('clasico');
  });

  it('los 7 patrones dibujan su marco y mantienen Anterior y Siguiente con su nombre accesible', () => {
    const marcos: Record<string, { barra: boolean; pie: boolean; zonas: boolean; hud: boolean; temario: boolean; mapa: boolean; avanza?: boolean | null }> = {};
    for (const patron of PATRONES_BASE) {
      const c = contenedorNuevo();
      const r = montar(c, con({ patron, modo: 'libre', mostrar: ['temario', 'progreso', 'contador', 'puntos'] }));
      const s = c.shadowRoot!;
      expect(raiz(c).dataset.patron).toBe(patron);
      expect(r.estado().patronAplicado).toBe(patron);
      marcos[patron] = {
        barra: Boolean(s.querySelector('.ap-barra')), pie: Boolean(s.querySelector('.ap-pie')), zonas: Boolean(s.querySelector('.ap-zona')),
        hud: Boolean(s.querySelector('.ap-hud')), temario: Boolean(boton(c, /Temario/)), mapa: Boolean(s.querySelector('.ap-mapa')),
      };
      // En Mapa y Menú de temas se empieza eligiendo estación; en los demás, Siguiente (o «Continuar ↓») avanza.
      marcos[patron]!.avanza = patron === 'mapa' || patron === 'hub' ? null : Boolean(boton(c, /Siguiente|Continuar/)) && r.siguiente() && r.estado().indice === 1;
      r.destruir();
    }
    expect(marcos).toEqual({
      clasico: { barra: true, pie: true, zonas: false, hud: false, temario: true, mapa: false, avanza: true },
      historias: { barra: true, pie: false, zonas: true, hud: false, temario: true, mapa: false, avanza: true },
      vertical: { barra: true, pie: true, zonas: false, hud: false, temario: true, mapa: false, avanza: true },
      mapa: { barra: true, pie: true, zonas: false, hud: false, temario: false, mapa: true, avanza: null },
      hub: { barra: true, pie: true, zonas: false, hud: false, temario: false, mapa: true, avanza: null },
      ramificado: { barra: true, pie: true, zonas: false, hud: false, temario: false, mapa: false, avanza: true },
      inmersivo: { barra: false, pie: false, zonas: false, hud: true, temario: true, mapa: false, avanza: true },
    });
  });

  it('Vertical dice «↑ Volver» y «Continuar ↓»; Inmersivo muestra los puntos en su marcador', () => {
    const c = contenedorNuevo();
    montar(c, con({ patron: 'vertical', modo: 'libre' }));
    expect(c.shadowRoot!.querySelector('.ap-pie')!.textContent).toMatch(/↑ Volver.*Continuar ↓/);
    const c2 = contenedorNuevo();
    montar(c2, con({ patron: 'inmersivo', modo: 'libre', mostrar: ['puntos', 'progreso'] }));
    expect(c2.shadowRoot!.querySelector('.ap-hud')!.textContent).toContain('0 puntos');
  });

  it('CP-087 · Historias con regla secuencial: avanza con las zonas, deslizando y con las flechas, y respeta el orden', () => {
    const c = contenedorNuevo();
    const r = montar(c, con({ patron: 'historias', modo: 'secuencial', siguienteSeHabilita: 'siempre', mostrar: ['progreso'] }));
    const segmentos = c.shadowRoot!.querySelectorAll('.ap-segmentos i');
    expect(segmentos).toHaveLength(30);
    // Zona derecha (botón), deslizar a la izquierda y flecha derecha: tres pantallas.
    boton(c, /Siguiente/)!.click();
    expect(r.estado().indice).toBe(1);
    deslizar(c, -120);
    expect(r.estado().indice).toBe(2);
    tecla(c, 'ArrowRight');
    expect(r.estado().indice).toBe(3);
    // Deslizar a la derecha vuelve; un gesto corto o vertical no cuenta.
    deslizar(c, 120);
    expect(r.estado().indice).toBe(2);
    deslizar(c, -20);
    deslizar(c, -60, 200);
    expect(r.estado().indice).toBe(2);
    boton(c, /Anterior/)!.click();
    expect(r.estado().indice).toBe(1);
    expect(c.shadowRoot!.querySelectorAll('.ap-segmentos i.ap-visto')).toHaveLength(4);
    // En la actividad de p07 no se pasa por ningún camino hasta hacerla (RN-11-4), y no se salta el orden.
    for (let i = r.estado().indice; i < p07; i++) expect(r.siguiente()).toBe(true);
    expect(r.estado().pantallaId).toBe('p07');
    expect(boton(c, /Siguiente/)!.disabled).toBe(true);
    expect(motivo(c)).toBe('Completa la actividad para continuar');
    deslizar(c, -120);
    tecla(c, 'ArrowRight');
    expect(r.estado().pantallaId).toBe('p07');
    expect(r.ir('p20')).toBe(false);
  });

  it('el mapa agrupa LOTO en 3 estaciones (una por sección) y solo deja entrar a las que permite la regla', () => {
    const curso = con({ patron: 'mapa', modo: 'condiciones' });
    expect(estaciones(curso, aplanar(curso)).map((e) => [e.titulo.es, e.desde, e.hasta])).toEqual([
      ['Bloqueo y etiquetado', 0, 10], ['Los seis pasos del bloqueo', 11, 21], ['Retiro del bloqueo', 22, 29],
    ]);
    const c = contenedorNuevo();
    const r = montar(c, curso);
    expect(r.estado().enMapa).toBe(true);
    expect(c.shadowRoot!.querySelector('.ap-mapa-titulo')?.textContent).toBe('Tu ruta de misiones');
    const estacion = (n: number) => boton(c, new RegExp(`^Misión ${n}:`))!;
    expect(nombreDe(estacion(1))).toBe('Misión 1: Bloqueo y etiquetado, 0 de 11 pantallas');
    // La segunda queda bloqueada: antes hay actividades sin hacer.
    expect(estacion(2).disabled).toBe(true);
    expect(nombreDe(estacion(2))).toContain('bloqueada');
    estacion(1).click();
    expect(r.estado()).toMatchObject({ enMapa: false, pantallaId: 'p01' });
    expect(c.shadowRoot!.querySelector('.ap-titulo-pantalla')).not.toBeNull();
    r.siguiente();
    // «← Mapa» vuelve al mapa con el avance de la estación.
    boton(c, /Mapa/)!.click();
    expect(r.estado().enMapa).toBe(true);
    expect(nombreDe(estacion(1))).toBe('Misión 1: Bloqueo y etiquetado, 2 de 11 pantallas');
    // En libre todas las estaciones están abiertas; entrar a la 3 lleva a su primera pantalla.
    const c2 = contenedorNuevo();
    const r2 = montar(c2, con({ patron: 'hub', modo: 'libre' }));
    expect(c2.shadowRoot!.querySelector('.ap-mapa-titulo')?.textContent).toBe('Elige un tema');
    boton(c2, /^Tema 3:/)!.click();
    expect(r2.estado().pantallaId).toBe('p23');
    expect(boton(c2, /Temas/)).toBeTruthy();
  });

  it('Ramificado no ofrece temario ni saltos; sin marco (revisión) el mapa no aparece', () => {
    const c = contenedorNuevo();
    montar(c, con({ patron: 'ramificado', mostrar: ['temario', 'progreso'] }));
    expect(boton(c, /Temario/)).toBeUndefined();
    const c2 = contenedorNuevo();
    const r = montar(c2, con({ patron: 'mapa' }), { marco: false, revision: true, inicio: 'p05' });
    expect(r.estado()).toMatchObject({ enMapa: false, pantallaId: 'p05' });
  });
});
