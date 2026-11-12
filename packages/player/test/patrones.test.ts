// @vitest-environment happy-dom
// HU-1103 · Patrones de navegación (RN-11-1, RN-11-2, RN-11-4, CP-087): los 7 patrones dibujan su marco sobre el mismo
// núcleo. Historias avanza con las zonas ‹ ›, deslizando y con las flechas, y respeta la regla secuencial; el mapa de
// misiones agrupa por secciones y deja entrar solo a las estaciones que permite la regla.
import { afterEach, describe, expect, it } from 'vitest';
import { aplanar } from '../src/navegacion.ts';
import { estaciones, marcoDe, PATRONES_BASE, patronDe } from '../src/patrones.ts';
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

// HU-1104 · El patrón personalizado (RN-11-3): sus 5 opciones se aplican sobre el marco de su base.
describe('patrón personalizado (HU-1104)', () => {
  const personalizado = (o: Record<string, unknown>, modo: 'libre' | 'condiciones' = 'libre') =>
    con({ patron: 'personalizado', modo, patronPersonalizado: { nombre: 'Prueba', base: 'clasico', progreso: 'barra', avance: 'botones', menu: 'temario', marcador: false, barra: 'abajo', ...o } });
  const montado = (o: Record<string, unknown>) => {
    const c = contenedorNuevo();
    const r = montar(c, personalizado(o));
    return { c, r, s: c.shadowRoot! };
  };

  it('marcoDe: la base con las opciones del personalizado encima; lo inválido se ignora', () => {
    expect(marcoDe({ patron: 'personalizado', patronPersonalizado: { base: 'mapa', progreso: 'puntos', avance: 'botones', menu: 'mapa', marcador: true, barra: 'abajo' } }))
      .toEqual({ base: 'mapa', cabecera: true, progreso: 'puntos', avance: 'botones', menu: 'mapa', marcador: true, barra: 'abajo' });
    expect(marcoDe({ patron: 'personalizado', patronPersonalizado: { base: 'historias', progreso: 'arcoiris', marcador: 'si' } }))
      .toEqual({ base: 'historias', cabecera: true, progreso: 'segmentos', avance: 'deslizar-y-botones', menu: 'temario', marcador: false, barra: 'ninguna' });
    // Los patrones del catálogo no leen patronPersonalizado.
    expect(marcoDe({ patron: 'clasico', patronPersonalizado: { base: 'mapa', barra: 'ninguna' } }).barra).toBe('abajo');
  });

  it('progreso: barra, segmentos, puntos, porcentaje o ninguno', () => {
    const visto: Record<string, string[]> = {};
    for (const progreso of ['barra', 'segmentos', 'puntos', 'porcentaje', 'ninguno']) {
      const { s, r } = montado({ progreso });
      visto[progreso] = ['.ap-avance', '.ap-segmentos:not(.ap-segmentos-puntos)', '.ap-segmentos-puntos', '.ap-porcentaje'].filter((sel) => s.querySelector(sel));
      r.destruir();
    }
    expect(visto).toEqual({
      barra: ['.ap-avance', '.ap-porcentaje'], segmentos: ['.ap-segmentos:not(.ap-segmentos-puntos)'], puntos: ['.ap-segmentos-puntos'],
      porcentaje: ['.ap-porcentaje'], ninguno: [],
    });
  });

  it('avance: solo con «deslizar y botones» se desliza; «desplazar» dice «Continuar ↓» y avanza con ↓', () => {
    const botones = montado({ avance: 'botones' });
    deslizar(botones.c, -120);
    expect(botones.r.estado().indice).toBe(0);
    botones.r.destruir();
    const desliza = montado({ avance: 'deslizar-y-botones' });
    deslizar(desliza.c, -120);
    expect(desliza.r.estado().indice).toBe(1);
    desliza.r.destruir();
    const desplaza = montado({ avance: 'desplazar' });
    expect(desplaza.s.querySelector('.ap-pie')!.textContent).toMatch(/↑ Volver.*Continuar ↓/);
    desplaza.s.querySelector('.ap-pie')!.querySelector<HTMLElement>('.ap-primario')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(desplaza.r.estado().indice).toBe(1);
  });

  it('menú: temario, mapa, temas o ninguno', () => {
    const visto: Record<string, unknown> = {};
    for (const menu of ['temario', 'mapa', 'temas', 'ninguno']) {
      const { c, s, r } = montado({ menu });
      visto[menu] = { temario: Boolean(boton(c, /Temario/)), mapa: s.querySelector('.ap-mapa-titulo')?.textContent ?? null, enMapa: r.estado().enMapa };
      r.destruir();
    }
    expect(visto).toEqual({
      temario: { temario: true, mapa: null, enMapa: false },
      mapa: { temario: false, mapa: 'Tu ruta de misiones', enMapa: true },
      temas: { temario: false, mapa: 'Elige un tema', enMapa: true },
      ninguno: { temario: false, mapa: null, enMapa: false },
    });
  });

  it('marcador: los puntos van en un marcador flotante en lugar de la barra', () => {
    const con_ = montado({ marcador: true });
    expect(con_.s.querySelector('.ap-hud .ap-puntos')?.textContent).toBe('★ 0 puntos');
    expect(con_.s.querySelector('.ap-barra .ap-puntos')).toBeNull();
    con_.r.destruir();
    const sin = montado({ marcador: false });
    expect(sin.s.querySelector('.ap-hud')).toBeNull();
    expect(sin.s.querySelector('.ap-barra .ap-puntos')).not.toBeNull();
  });

  it('barra: Anterior y Siguiente arriba, abajo, flotantes o como zonas, y siempre avanzan con su nombre', () => {
    const donde: Record<string, string> = {};
    const conPie: Record<string, boolean> = {};
    const indice: Record<string, number> = {};
    for (const barra of ['arriba', 'abajo', 'flotante', 'ninguna']) {
      const { c, s, r } = montado({ barra });
      const sig = boton(c, 'Siguiente')!;
      donde[barra] = sig.closest('.ap-barra') ? 'cabecera' : sig.closest('.ap-pie') ? 'pie' : sig.className;
      conPie[barra] = Boolean(s.querySelector('.ap-pie'));
      sig.click();
      indice[barra] = r.estado().indice;
      r.destruir();
    }
    expect(donde).toEqual({ arriba: 'cabecera', abajo: 'pie', flotante: 'ap-fab ap-fab-der', ninguna: 'ap-zona ap-zona-der' });
    expect(conPie).toEqual({ arriba: false, abajo: true, flotante: false, ninguna: false });
    expect(indice).toEqual({ arriba: 1, abajo: 1, flotante: 1, ninguna: 1 });
    // Sin cabecera (base Inmersivo), «arriba» los pone en el marcador.
    const { c, r } = montado({ base: 'inmersivo', barra: 'arriba' });
    expect(boton(c, 'Siguiente')!.closest('.ap-hud')).not.toBeNull();
    r.destruir();
  });

  it('CP-088 · «tablero de misiones de seguridad»: mapa con 3 estaciones, progreso con puntos y marcador; la regla sigue mandando', () => {
    const c = contenedorNuevo();
    const r = montar(c, personalizado({ nombre: 'Tablero de misiones de seguridad', base: 'mapa', progreso: 'puntos', menu: 'mapa', marcador: true }, 'condiciones'));
    expect(r.estado()).toMatchObject({ patron: 'personalizado', patronAplicado: 'mapa', enMapa: true });
    expect(c.shadowRoot!.querySelectorAll('.ap-estacion')).toHaveLength(3);
    expect(boton(c, /^Misión 2:/)!.disabled).toBe(true);
    // El marcador de puntos flotante se ve también en el mapa.
    expect((c.shadowRoot!.querySelector('.ap-hud') as HTMLElement).hidden).toBe(false);
    boton(c, /^Misión 1:/)!.click();
    expect(c.shadowRoot!.querySelectorAll('.ap-segmentos-puntos i')).toHaveLength(30);
    expect(c.shadowRoot!.querySelector('.ap-hud .ap-puntos')).not.toBeNull();
    for (let i = r.estado().indice; i < p07; i++) r.siguiente();
    expect(r.siguiente()).toBe(false);
    expect(motivo(c)).toBe('Completa la actividad para continuar');
  });
});
