// @vitest-environment happy-dom
// HU-0804 · CP-079 · Cambio de idioma en el paquete bilingüe: en la pantalla 8 con puntos, cambiar a inglés deja la misma
// pantalla con los mismos puntos y el texto en inglés; el foco queda en el botón de idioma, suspend_data guarda `en` con
// LMSCommit y, al volver, el paquete abre en inglés. Con un solo idioma no hay botón.
// HU-0804 parte 2 · En inglés la pantalla narrada usa la pista `en`: su audio, su boca y sus subtítulos (con lang="en").
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { iniciarPaquete } from '../src/paquete.ts';
import { montar } from '../src/reproductor.ts';
import { aplanar } from '../src/navegacion.ts';
import { type ApiScorm12 } from '../src/scorm12.ts';
import { codificarSuspend, huellaCurso, leerSuspend } from '../src/suspend.ts';
import type { CursoReproductor } from '../src/tipos.ts';
import { cursoLotoBase } from './catalogo.ts';

/** LOTO con español e inglés: cada texto `{ es }` suma su inglés «[EN] …» (el título de p08 tiene el suyo). */
function lotoBilingue(): CursoReproductor {
  const curso = cursoLotoBase();
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visitar); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.es === 'string' && Object.keys(o).every((k) => k === 'es' || k === 'en')) { o.en = `[EN] ${o.es}`; return; }
    Object.values(o).forEach(visitar);
  };
  visitar(curso);
  curso.idiomas = ['es', 'en'];
  return curso;
}

const orden = aplanar(cursoLotoBase()).map((x) => x.pantalla.id);
const RESULTADOS = { p07: { completada: true, puntaje: 100, intentos: 1 } };
const EN_P08 = { pantallaId: 'p08', vistas: orden.slice(0, 8), resultados: RESULTADOS };

function contenedorNuevo() {
  const c = document.createElement('div');
  document.body.replaceChildren(c);
  return c;
}
const botonIdioma = (c: HTMLElement) => c.shadowRoot!.querySelector<HTMLButtonElement>('.ap-idioma');
const tituloPantalla = (c: HTMLElement) => c.shadowRoot!.querySelector('.ap-titulo-pantalla')?.textContent;

afterEach(() => { document.body.replaceChildren(); });

describe('botón de idioma (HU-0804)', () => {
  it('con un solo idioma no hay botón; con los dos, dice a qué idioma cambia', () => {
    const c = contenedorNuevo();
    const r = montar(c, cursoLotoBase(), { idioma: 'es' });
    expect(botonIdioma(c)).toBeNull();
    r.destruir();
    const r2 = montar(c, lotoBilingue(), { idioma: 'es' });
    expect(botonIdioma(c)?.textContent).toBe('EN');
    expect(botonIdioma(c)?.getAttribute('aria-label')).toBe('EN, ver en inglés');
    r2.destruir();
    // La vista previa ofrece los dos idiomas aunque el curso aún diga solo español.
    const r3 = montar(c, cursoLotoBase(), { idioma: 'es', idiomas: ['es', 'en'] });
    expect(botonIdioma(c)).not.toBeNull();
    r3.destruir();
  });

  it('CP-079 · en la pantalla 8 con puntos, cambiar a inglés deja la 8 con los mismos puntos y el texto en inglés', () => {
    const c = contenedorNuevo();
    const avisos: [string, string, number][] = [];
    const r = montar(c, lotoBilingue(), { idioma: 'es', reanudar: EN_P08, alCambiarIdioma: (i, e) => avisos.push([i, e.pantallaId, e.puntos]) });
    const antes = r.estado();
    expect(antes).toMatchObject({ pantallaId: 'p08', puntos: 100 });
    const tituloEs = tituloPantalla(c)!;
    expect(c.shadowRoot!.querySelector('.ap-r')?.getAttribute('lang')).toBe('es');

    botonIdioma(c)!.click();
    const despues = r.estado();
    expect(despues).toMatchObject({ pantallaId: 'p08', indice: antes.indice, puntos: 100, progreso: antes.progreso, nota: antes.nota });
    expect(despues.vistas).toEqual(antes.vistas);
    expect(despues.resultados).toEqual(RESULTADOS);
    expect(tituloPantalla(c)).toBe(`[EN] ${tituloEs}`);
    expect(c.shadowRoot!.querySelector('.ap-r')?.getAttribute('lang')).toBe('en');
    // LOTO usa Historias (HU-1103): Siguiente es la zona de la derecha, con su nombre en el idioma nuevo.
    expect(c.shadowRoot!.querySelector('button[aria-describedby="ap-motivo"]')?.textContent).toContain('Next');
    expect(avisos).toEqual([['en', 'p08', 100]]);
    // El foco vuelve al botón, que ahora ofrece español.
    expect(c.shadowRoot!.activeElement).toBe(botonIdioma(c));
    expect(botonIdioma(c)?.textContent).toBe('ES');

    // El objeto devuelto sigue mandando sobre el reproductor del idioma nuevo, y se puede volver al español.
    expect(r.siguiente()).toBe(true);
    expect(r.estado().pantallaId).toBe('p09');
    botonIdioma(c)!.click();
    expect(r.estado()).toMatchObject({ pantallaId: 'p09', puntos: 100 });
    expect(tituloPantalla(c)).not.toMatch(/^\[EN\]/);
    r.destruir();
  });
});

describe('pista en inglés (HU-0804 parte 2)', () => {
  const ANA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../docs/diseno/personaje/plantilla-ana.svg'), 'utf8');
  const VTT = {
    'vtt-p03-es': 'WEBVTT\n\n00:00.000 --> 00:02.000\nSoy Ana, supervisora de seguridad.\n',
    'vtt-p03-en': 'WEBVTT\n\n00:00.000 --> 00:02.000\nI am Ana, safety supervisor.\n',
  } as Record<string, string>;
  /** LOTO bilingüe con la pista en inglés de p03: otro audio, otra boca (F) y otros subtítulos. */
  function conPistaIngles(): CursoReproductor {
    const curso = lotoBilingue();
    const p03 = curso.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p03')!;
    const es = p03.narracion!.porIdioma!.es!;
    p03.narracion!.porIdioma!.en = { ...structuredClone(es), recursoAudioId: 'aud-p03-en', subtitulosId: 'vtt-p03-en', duracionMs: 9000, bocas: [[0, 'F'], [8000, 'X']] };
    return curso;
  }

  it('al cambiar a inglés en una pantalla narrada, suenan el audio, la boca y los subtítulos en inglés', async () => {
    const c = contenedorNuevo();
    const r = montar(c, conPistaIngles(), {
      idioma: 'es', revision: true, inicio: 'p03',
      urlRecurso: (id) => `https://recursos.prueba/${id}`, cargarSvg: async () => ANA, cargarSubtitulos: async (id) => VTT[id],
    });
    const sombra = () => c.shadowRoot!;
    const subtitulos = () => sombra().querySelector<HTMLElement>('.ap-subtitulos')!;
    const esperar = () => new Promise((ok) => setTimeout(ok, 20));
    expect(r.estado().pantallaId).toBe('p03');
    expect(sombra().querySelector('audio')?.getAttribute('src')).toBe('https://recursos.prueba/aud-p03-es');
    expect(subtitulos().getAttribute('lang')).toBe('es');

    botonIdioma(c)!.click();
    expect(r.estado().pantallaId).toBe('p03');
    expect(sombra().querySelector('audio')?.getAttribute('src')).toBe('https://recursos.prueba/aud-p03-en');
    expect(r.duracion()).toBeGreaterThanOrEqual(9);
    // CC encendido: con la aguja quieta en 1 s, la frase del WebVTT en inglés y la boca de la pista en inglés.
    [...sombra().querySelectorAll<HTMLButtonElement>('.ap-boton-barra')].find((b) => b.textContent?.startsWith('CC'))!.click();
    await esperar();
    r.irA(1);
    expect(subtitulos().getAttribute('lang')).toBe('en');
    expect(subtitulos().hidden).toBe(false);
    expect(subtitulos().textContent).toBe('I am Ana, safety supervisor.');
    expect(sombra().querySelector('svg[data-boca]')?.getAttribute('data-boca')).toBe('F');
    r.destruir();
  });
});

describe('paquete bilingüe en el LMS (HU-0804)', () => {
  function lms(inicial: Record<string, string> = {}) {
    const valores: Record<string, string> = { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', ...inicial };
    const llamadas: string[] = [];
    const api: ApiScorm12 = {
      LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSGetValue: (k) => valores[k] ?? '',
      LMSSetValue: (k, v) => { llamadas.push(`set ${k}`); valores[k] = v; return 'true'; },
      LMSCommit: () => { llamadas.push('LMSCommit'); return 'true'; },
      LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
    };
    const ventana = Object.assign(Object.create(window) as Window, { API: api, addEventListener: () => undefined });
    return { valores, llamadas, ventana };
  }
  const datos = (curso: CursoReproductor) => ({ curso, idioma: 'es' as const, rutas: {}, diagnostico: false });

  it('cambiar de idioma guarda `en` en suspend_data con LMSCommit, y al volver el paquete abre en inglés en la misma pantalla', () => {
    const curso = lotoBilingue();
    const huella = huellaCurso(curso.id, orden);
    const guardado = codificarSuspend(orden, { idioma: 'es', vistas: orden.slice(0, 8), resultados: RESULTADOS }, huella);
    const l = lms({ 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': 'p08', 'cmi.suspend_data': guardado });
    const c = contenedorNuevo();
    // navegacion.reanudar «automatica» para no pasar por el aviso en esta prueba.
    curso.navegacion = { ...curso.navegacion, reanudar: 'automatica' } as NonNullable<CursoReproductor['navegacion']>;
    const p = iniciarPaquete(c, datos(curso), l.ventana);
    expect(p.reproductor.estado()).toMatchObject({ pantallaId: 'p08', puntos: 100 });
    l.llamadas.length = 0;
    botonIdioma(c)!.click();
    expect(leerSuspend(orden, l.valores['cmi.suspend_data']!, huella)?.idioma).toBe('en');
    expect(l.llamadas).toContain('LMSCommit');
    expect(l.valores['cmi.core.lesson_location']).toBe('p08');
    p.reproductor.destruir();

    // Al volver: misma pantalla, mismos puntos, en inglés.
    const vuelta = lms({ 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': 'p08', 'cmi.suspend_data': l.valores['cmi.suspend_data']! });
    const c2 = contenedorNuevo();
    const p2 = iniciarPaquete(c2, datos(curso), vuelta.ventana);
    expect(p2.reproductor.estado()).toMatchObject({ pantallaId: 'p08', puntos: 100 });
    expect(c2.shadowRoot!.querySelector('.ap-r')?.getAttribute('lang')).toBe('en');
    p2.reproductor.destruir();
  });

  it('la primera vez abre en español; un idioma guardado que el paquete no trae se ignora', () => {
    const solo = cursoLotoBase();
    const huella = huellaCurso(solo.id, orden);
    const enIngles = codificarSuspend(orden, { idioma: 'en', vistas: orden.slice(0, 3), resultados: {} }, huella);
    const c = contenedorNuevo();
    const p = iniciarPaquete(c, datos(lotoBilingue()), lms().ventana);
    expect(c.shadowRoot!.querySelector('.ap-r')?.getAttribute('lang')).toBe('es');
    p.reproductor.destruir();
    const c2 = contenedorNuevo();
    const p2 = iniciarPaquete(c2, datos(solo), lms({ 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': 'p03', 'cmi.suspend_data': enIngles }).ventana);
    expect(c2.shadowRoot!.querySelector('.ap-r')?.getAttribute('lang')).toBe('es');
    p2.reproductor.destruir();
  });
});
