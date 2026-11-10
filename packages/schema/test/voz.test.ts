import { describe, expect, it } from 'vitest';
import {
  aplicarPronunciacion, contieneTermino, erroresGlosario, erroresPronunciacion, narracionesDe, terminosCambiados, textoOrigen,
} from '../src/voz.js';

describe('pronunciación', () => {
  it('CP-027: «LOTO» → «lo-to» en el SSML y en lo que dirá la voz', () => {
    const r = aplicarPronunciacion('Aplica el LOTO antes de abrir el tablero.', [{ idioma: 'es', escrito: 'LOTO', pronunciado: 'lo-to' }], 'es');
    expect(r.ssml).toBe('<speak>Aplica el <sub alias="lo-to">LOTO</sub> antes de abrir el tablero.</speak>');
    expect(r.dicho).toBe('Aplica el lo-to antes de abrir el tablero.');
    expect(r.aplicados).toEqual(['LOTO']);
  });

  it('solo cambia palabras completas del idioma pedido y gana el término más largo', () => {
    const dic = [
      { idioma: 'es' as const, escrito: 'EPP', pronunciado: 'e pe pe' },
      { idioma: 'es' as const, escrito: 'EPP básico', pronunciado: 'equipo básico' },
      { idioma: 'en' as const, escrito: 'LOTO', pronunciado: 'low-toe' },
    ];
    const r = aplicarPronunciacion('Usa EPP básico, no EPPS. LOTO.', dic, 'es');
    expect(r.dicho).toBe('Usa equipo básico, no EPPS. LOTO.');
    expect(aplicarPronunciacion('Apply LOTO.', dic, 'en').dicho).toBe('Apply low-toe.');
  });

  it('escapa el texto para que no se inyecte SSML', () => {
    expect(aplicarPronunciacion('a < b & "c"', [], 'es').ssml).toBe('<speak>a &lt; b &amp; &quot;c&quot;</speak>');
  });

  it('valida el diccionario', () => {
    expect(erroresPronunciacion([
      { idioma: 'es', escrito: 'LOTO', pronunciado: 'lo-to' },
      { idioma: 'es', escrito: 'loto', pronunciado: 'lo to' },
      { idioma: 'en', escrito: 'LOTO', pronunciado: 'low-toe' },
      { idioma: 'es', escrito: 'EPP', pronunciado: '<break/>' },
      { idioma: 'es', escrito: 'SST', pronunciado: ' ' },
    ])).toEqual(['«loto» está repetido en español', '«EPP»: la pronunciación no admite etiquetas', '«SST»: falta cómo se pronuncia']);
  });
});

describe('glosario', () => {
  it('pide traducción o «no traducir» y no repite términos', () => {
    expect(erroresGlosario([
      { termino: 'LOTO', noTraducir: true },
      { termino: 'tablero', traduccion: 'panel' },
      { termino: 'Tablero', traduccion: 'board' },
      { termino: 'candado' },
    ])).toEqual(['«Tablero» está repetido', '«candado»: indica la traducción o marca «no traducir»']);
  });

  it('detecta términos cambiados y los busca como palabra completa', () => {
    const cambiados = terminosCambiados(
      [{ t: 'LOTO', v: 'x' }, { t: 'EPP', v: 'y' }, { t: 'SST', v: 'z' }],
      [{ t: 'loto', v: 'x' }, { t: 'EPP', v: 'otro' }, { t: 'candado', v: 'w' }],
      (x) => x.t, (x) => x.v,
    );
    expect(cambiados.sort()).toEqual(['candado', 'epp', 'sst']);
    expect(contieneTermino('Los pilotos', 'LOTO')).toBe(false);
    expect(contieneTermino('El loto, siempre', 'LOTO')).toBe(true);
  });
});

describe('textos del curso', () => {
  const doc = {
    modulos: [{ id: 'm1', capsulas: [{ id: 'c1', pantallas: [
      { id: 'p1', narracion: { texto: { es: 'Aplica el LOTO.' }, porIdioma: {} } },
      { id: 'p2', bloques: [{ id: 'b1', texto: { es: 'Candado' } }], narracion: { texto: { es: 'Sin términos.', en: 'No terms.' }, porIdioma: {} } },
    ] }] }],
  };

  it('encuentra la narración de cada pantalla', () => {
    expect(Object.fromEntries(narracionesDe(doc))).toEqual({ p1: { es: 'Aplica el LOTO.' }, p2: { es: 'Sin términos.', en: 'No terms.' } });
  });

  it('resuelve rutas JSON Pointer al texto o a su objeto por idioma', () => {
    expect(textoOrigen(doc, '/modulos/0/capsulas/0/pantallas/1/bloques/0/texto')).toBe('Candado');
    expect(textoOrigen(doc, '/modulos/0/capsulas/0/pantallas/0/narracion/texto/es')).toBe('Aplica el LOTO.');
    expect(textoOrigen(doc, '/modulos/9')).toBeNull();
  });
});
