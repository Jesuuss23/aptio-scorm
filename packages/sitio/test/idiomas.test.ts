// HU-1510 · Sitio en español e inglés (REQ-069, CP-122): cada página usa el contenido, el menú, el pie y los textos fijos
// de su idioma; hreflang (es, en, x-default) y los alternos del sitemap solo entre versiones publicadas; y el selector
// ES · EN sin JavaScript, que lleva a la misma página en el otro idioma o, si no está publicada, a su inicio.
import { armarInstantanea, type FilaPagina, type Instantanea } from '@aptio/schema/sitio-versiones';
import { AJUSTES_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { alternasHref, renderizarPagina, selectorDe, sitemapXml } from '../src/render.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
const F = '2026-11-13T15:00:00.000Z';
const pag = (ruta: string, idioma: string, estado = 'PUBLICADA'): FilaPagina => ({
  ruta, idioma, titulo: `${ruta} ${idioma}`, estado, publicadaEn: estado === 'PUBLICADA' ? F : null,
  bloques: [{ id: `${ruta}-${idioma}-0`, tipo: 'hero', orden: 0, visible: true, ajustes: null }],
});
/** CP-122 · Precios publicada en ES y en borrador en EN; los dos inicios publicados. */
const sitio = (precios: 'BORRADOR' | 'PUBLICADA', ajustes = AJUSTES_POR_DEFECTO): Instantanea =>
  armarInstantanea({ paginas: [pag('/', 'es'), pag('/', 'en'), pag('/precios', 'es'), pag('/precios', 'en', precios)], elementos: [], enlaces: [], ajustes }, 'produccion');
const hreflang = (html: string) => [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"\/>/g)].map((m) => `${m[1]} ${m[2]}`);

describe('sitio en español e inglés (HU-1510)', () => {
  it('CP-122: con Precios en borrador en inglés, el selector lleva a /en y no hay hreflang', () => {
    const inst = sitio('BORRADOR');
    expect(selectorDe(inst, '/precios', 'es')).toEqual({ actual: 'es', destino: 'en', ruta: '/en' });
    const html = renderizarPagina(inst, '/precios', 'es', op)!;
    expect(hreflang(html)).toEqual([]);
    expect(html.match(/<a href="\/s\/en" hrefLang="en" lang="en">EN<span class="sr"> \(English\)<\/span><\/a>/g)).toHaveLength(2);
    expect(html).toContain('<nav class="idiomas idiomas-escritorio" aria-label="Idioma"><span class="actual" aria-current="true" lang="es">ES');
    expect(html).toContain('<nav class="idiomas idiomas-celular" aria-label="Idioma">');
    expect(renderizarPagina(inst, '/precios', 'en', op)).toBeNull();
  });

  it('CP-122: con Precios publicada en los dos idiomas, el selector va a /en/precios y hay hreflang es, en y x-default', () => {
    const inst = sitio('PUBLICADA');
    expect(selectorDe(inst, '/precios', 'es')?.ruta).toBe('/en/precios');
    expect(selectorDe(inst, '/precios', 'en')).toEqual({ actual: 'en', destino: 'es', ruta: '/precios' });
    const esperado = ['es https://aptioscorm.com/precios', 'en https://aptioscorm.com/en/precios', 'x-default https://aptioscorm.com/precios'];
    expect(hreflang(renderizarPagina(inst, '/precios', 'es', op)!)).toEqual(esperado);
    const ingles = renderizarPagina(inst, '/precios', 'en', op)!;
    expect(hreflang(ingles)).toEqual(esperado);
    expect(ingles).toContain('<html lang="en">');
    expect(ingles).toContain('<a href="/s/precios" hrefLang="es" lang="es">ES<span class="sr"> (Español)</span></a>');
  });

  it('el selector no sale sin inicio en el otro idioma publicado ni con el ajuste apagado', () => {
    const sinInicio = armarInstantanea({ paginas: [pag('/', 'es'), pag('/precios', 'es'), pag('/', 'en', 'BORRADOR')], elementos: [], enlaces: [], ajustes: AJUSTES_POR_DEFECTO }, 'produccion');
    expect(selectorDe(sinInicio, '/precios', 'es')).toBeNull();
    expect(renderizarPagina(sinInicio, '/precios', 'es', op)).not.toContain('class="idiomas');
    const apagado = sitio('PUBLICADA', { ...AJUSTES_POR_DEFECTO, mostrarSelectorIdioma: false });
    expect(apagado.sitio?.mostrarSelectorIdioma).toBe(false);
    expect(selectorDe(apagado, '/precios', 'es')).toBeNull();
    expect(renderizarPagina(apagado, '/precios', 'es', op)).not.toContain('class="idiomas');
    // Encendido (el valor por defecto) no se guarda en la versión: las de antes de la HU-1510 no cambian.
    expect(sitio('PUBLICADA').sitio).not.toHaveProperty('mostrarSelectorIdioma');
  });

  it('el sitemap lleva los xhtml:link alternos solo en las rutas publicadas en los dos idiomas', () => {
    const xml = sitemapXml(sitio('PUBLICADA'), 'https://aptioscorm.com');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('<url><loc>https://aptioscorm.com/en/precios</loc><lastmod>2026-11-13T15:00:00.000Z</lastmod><xhtml:link rel="alternate" hreflang="es" href="https://aptioscorm.com/precios"/><xhtml:link rel="alternate" hreflang="en" href="https://aptioscorm.com/en/precios"/><xhtml:link rel="alternate" hreflang="x-default" href="https://aptioscorm.com/precios"/></url>');
    const borrador = sitemapXml(sitio('BORRADOR'), 'https://aptioscorm.com');
    expect(borrador).toContain('<url><loc>https://aptioscorm.com/precios</loc><lastmod>2026-11-13T15:00:00.000Z</lastmod></url>');
    expect(borrador).not.toContain('/en/precios');
    expect(alternasHref(sitio('BORRADOR'), '/', 'https://aptioscorm.com/').map((a) => a.hreflang)).toEqual(['es', 'en', 'x-default']);
  });

  it('la página en inglés usa los elementos, el menú, el pie y los textos fijos en inglés', () => {
    const inst = instantaneaDeEjemplo();
    const en = renderizarPagina(inst, '/', 'en', op)!;
    expect(en).toContain('<h1>From your client&#x27;s material to a SCORM package ready for the LMS</h1>');
    expect(en).toContain('<b>2 languages</b>');
    expect(en).toContain('<b>Laura Mendoza</b>');
    expect(en).not.toContain('Mariana Paredes');
    expect(en).not.toContain('4 días');
    expect(en).toContain('<a href="/s/en#testimonios">Customer stories</a>');
    expect(en).not.toContain('>Producto<');
    expect(en).toContain('<h2>Company</h2><ul><li><a href="/s/en/privacidad">Privacy</a>');
    expect(en).toContain('Microlearning capsules for training teams.');
    expect(en).toContain('<a class="btn primary" href="/s/en/agendar-demo">Book a demo</a>');
    expect(en).toContain('<h2 id="b-3">Produce your next capsule with Aptio SCORM</h2>');
    const es = renderizarPagina(inst, '/', 'es', op)!;
    expect(es).not.toContain('Laura Mendoza');
    expect(es).not.toContain('Customer stories');
    expect(es).toContain('<a class="btn primary" href="/s/agendar-demo">Agendar demo</a>');
  });
});
