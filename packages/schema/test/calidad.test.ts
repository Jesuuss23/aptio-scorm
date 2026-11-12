// HU-0505 · Reglas del control de calidad (CP-054): accesibilidad, longitud por idioma, alineación básica y faltantes,
// sobre copias del caso LOTO (que no rompe ninguna regla).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { observacionesRegla } from '../src/calidad.js';
import type { CursoDoc, PantallaDoc } from '../src/revision.js';

const original = JSON.parse(readFileSync(new URL('../../ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8')) as CursoDoc;
const loto = () => structuredClone(original);
const pantalla = (doc: CursoDoc, id: string) => doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === id)!;
type Bloque = PantallaDoc['bloques'][number];
const bloque = (p: PantallaDoc, tipo: string) => p.bloques.find((b) => b.tipo === tipo)!;
const datos = (p: PantallaDoc) => bloque(p, 'interaccion').interaccion!.datos as Record<string, Record<string, unknown>[]>;
const PALETA = { primario: '#0B4F6C', secundario: '#20A39E', acento: '#FFBA49', fondo: '#FFFFFF', texto: '#1D1D1D' };

describe('control de calidad: accesibilidad', () => {
  it('CP-054 · una imagen no decorativa sin texto alternativo bloquea la entrega en esa pantalla', () => {
    const doc = loto();
    const p20 = pantalla(doc, 'p20');
    const img: Bloque = { id: 'p20-foto', tipo: 'imagen', decorativa: false };
    p20.bloques.push(img);
    const obs = observacionesRegla(doc);
    expect(obs).toEqual([{
      pantallaId: 'p20', tipo: 'ACCESIBILIDAD', severidad: 'bloquea-entrega', categoria: 'accesibilidad',
      mensaje: 'La imagen p20-foto no tiene texto alternativo.', ruta: `/modulos/0/capsulas/0/pantallas/19/bloques/${p20.bloques.length - 1}`,
    }]);
    // Decorativa, no se avisa; con alternativo en español y sin inglés en el curso, tampoco.
    img.decorativa = true;
    expect(observacionesRegla(doc)).toEqual([]);
    Object.assign(img, { decorativa: false, alt: { es: 'Foto del tablero' } });
    expect(observacionesRegla(doc)).toEqual([]);
  });

  it('con inglés en el curso, la imagen sin alternativo en inglés avisa', () => {
    const doc = loto();
    pantalla(doc, 'p01').titulo.en = 'Lockout/tagout';
    pantalla(doc, 'p20').bloques.push({ id: 'p20-foto', tipo: 'imagen', decorativa: false, alt: { es: 'Foto del tablero' } });
    // Las imágenes de LOTO (p05, p08, p16) tienen alternativo solo en español.
    expect(observacionesRegla(doc).map((o) => [o.pantallaId, o.severidad, o.mensaje])).toEqual(['p05-imagen', 'p08-imagen', 'p16-imagen', 'p20-foto'].map((id) => [
      id.slice(0, 3), 'aviso', `La imagen ${id} no tiene texto alternativo en inglés: tradúcelo en Idiomas.`,
    ]));
  });

  it('una narración con voz y sin subtítulos avisa, en cada idioma', () => {
    const doc = loto();
    const p03 = pantalla(doc, 'p03');
    delete p03.narracion!.porIdioma!.es!.subtitulosId;
    p03.narracion!.porIdioma!.en = { recursoAudioId: 'aud-p03-en' };
    expect(observacionesRegla(doc).map((o) => o.mensaje)).toEqual([
      'La narración en español no tiene subtítulos: genéralos en Producción.',
      'La narración en inglés no tiene subtítulos: genéralos en Producción.',
    ]);
  });

  it('el kit con poco contraste es una observación del curso (SUP-63)', () => {
    expect(observacionesRegla(loto(), { paleta: PALETA })).toEqual([]);
    const obs = observacionesRegla(loto(), { paleta: { ...PALETA, texto: '#9A9A9A', primario: '#7FB3D5' } });
    expect(obs.map((o) => [o.pantallaId, o.tipo, o.categoria])).toEqual([[null, 'ACCESIBILIDAD', 'accesibilidad'], [null, 'ACCESIBILIDAD', 'accesibilidad']]);
    expect(obs[0]!.mensaje).toMatch(/^Kit de marca: el texto sobre el fondo tiene contraste 2,\d:1, menor a 4,5:1/);
    expect(obs[1]!.mensaje).toMatch(/^Kit de marca: el primario sobre el fondo/);
  });
});

describe('control de calidad: longitud por idioma', () => {
  it('el español que no cabe en su componente avisa con su ruta y los caracteres (SUP-72)', () => {
    const doc = loto();
    pantalla(doc, 'p04').titulo.es = 'Bloqueo y etiquetado de todas las fuentes de energía peligrosa';
    const [o] = observacionesRegla(doc);
    expect(o).toEqual({
      pantallaId: 'p04', tipo: 'CALIDAD', severidad: 'aviso', categoria: 'longitud', ruta: '/modulos/0/capsulas/0/pantallas/3/titulo',
      mensaje: '«Bloqueo y etiquetado de todas las fuent…» no cabe en su espacio: 62 de 45 caracteres.',
    });
  });

  it('el inglés solo avisa si su fila quedó en Desborde (lo aceptado largo por una persona no)', () => {
    const doc = loto();
    const p07 = pantalla(doc, 'p07');
    const tarjeta = (datos(p07).pares![2]!.b as { texto: { es: string; en?: string } }).texto;
    tarjeta.en = '[EN] Cilindros y mangueras';
    // Sin inglés en las imágenes, el curso ya avisa por sus alternativos: se traducen para mirar solo la longitud.
    for (const p of doc.modulos[0]!.capsulas[0]!.pantallas) for (const b of p.bloques) if (b.alt?.es) b.alt.en = `[EN] ${b.alt.es}`;
    const ruta = '/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b/texto';
    expect(observacionesRegla(doc)).toEqual([]);
    expect(observacionesRegla(doc, { desbordesEn: [ruta] })).toEqual([{
      pantallaId: 'p07', tipo: 'IDIOMA', severidad: 'aviso', categoria: 'longitud', ruta,
      mensaje: 'En inglés, «[EN] Cilindros y mangueras» no cabe en su espacio (26 de 24 caracteres): revísalo en Idiomas.',
    }]);
  });
});

describe('control de calidad: alineación y faltantes', () => {
  it('una actividad sin objetivo y un objetivo sin actividad ni pregunta', () => {
    const doc = loto();
    // p10 es la única actividad de obj-2 junto con p17, p25 y p26: se quitan todas sus pantallas de práctica.
    for (const id of ['p10', 'p17', 'p25', 'p26']) pantalla(doc, id).objetivoIds = [];
    for (const q of datos(pantalla(doc, 'p28')).preguntas!) if (q.objetivoId === 'obj-2') q.objetivoId = 'obj-1';
    const p28 = pantalla(doc, 'p28');
    p28.objetivoIds = ['obj-1', 'obj-3'];
    const obs = observacionesRegla(doc);
    expect(obs.filter((o) => o.pantallaId).map((o) => [o.pantallaId, o.tipo, o.mensaje])).toEqual(['p10', 'p17', 'p25', 'p26'].map((id) => [id, 'ALINEACION', 'La actividad no está ligada a ningún objetivo: elige el objetivo que practica.']));
    expect(obs.filter((o) => !o.pantallaId)).toEqual([{
      pantallaId: null, tipo: 'ALINEACION', severidad: 'aviso', categoria: 'alineacion',
      mensaje: 'El objetivo «Distinguir prácticas seguras de prácticas riesgosas durante…» no tiene ninguna actividad ni pregunta.',
    }]);
  });

  it('actividad sin retroalimentación: quiz, clasificar, deslizar y decisión', () => {
    const doc = loto();
    const q = datos(pantalla(doc, 'p22')).preguntas![0]!;
    (q.retroalimentacion as { incorrecta: { es: string } }).incorrecta.es = ' ';
    for (const e of datos(pantalla(doc, 'p10')).elementos!) delete e.retroalimentacion;
    for (const a of datos(pantalla(doc, 'p26')).afirmaciones!) delete a.retroalimentacion;
    const opcion = (datos(pantalla(doc, 'p17')).nodos![0]!.opciones as Record<string, unknown>[])[0]!;
    opcion.consecuencia = { es: '' };
    const obs = observacionesRegla(doc);
    expect(obs.map((o) => [o.pantallaId, o.categoria])).toEqual([['p10', 'faltante'], ['p17', 'faltante'], ['p22', 'faltante'], ['p26', 'faltante']]);
    expect(obs[0]!.mensaje).toBe('La actividad no tiene retroalimentación: agrega qué decir al acertar y al fallar.');
    // Basta un elemento con retroalimentación en clasificar.
    datos(pantalla(doc, 'p10')).elementos![0]!.retroalimentacion = { es: 'Bien' };
    expect(observacionesRegla(doc).some((o) => o.pantallaId === 'p10')).toBe(false);
  });
});
