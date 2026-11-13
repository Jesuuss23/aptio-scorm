// HU-1512 · SEO técnico en el HTML pre-renderizado: título, descripción, canonical y Open Graph; «Indexar» apagado
// (CP-125: noindex, fuera del sitemap y sin hreflang); JSON-LD WebPage, FAQPage, Product y Organization; robots.txt con
// las reglas extra, y el archivo de redirecciones de la versión (CP-124).
import { describe, expect, it } from 'vitest';
import { armarInstantanea, type FilaPagina, type Instantanea } from '@aptio/schema/sitio-versiones';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { ARCHIVO_REDIRECCIONES, jsonLdSeguro, renderizarPagina, renderizarSitio, robotsTxt, sinJsonLd, sitemapXml } from '../src/render.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
const jsonLd = (html: string) => JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)![1]!) as Record<string, unknown>;
const fila = (ruta: string, idioma: string, extra: Partial<FilaPagina> = {}): FilaPagina => ({
  ruta, idioma, titulo: `Página ${ruta}`, estado: 'PUBLICADA', publicadaEn: '2026-11-13T15:00:00.000Z', bloques: [{ id: `${ruta}${idioma}`, tipo: 'cta', orden: 0, visible: true, ajustes: null }], ...extra,
});
const sitio = (paginas: FilaPagina[], extra: Partial<Parameters<typeof armarInstantanea>[0]> = {}): Instantanea => armarInstantanea({ paginas, elementos: [], enlaces: [], ...extra }, 'produccion');

describe('metadatos de cada página', () => {
  it('meta título, descripción, canonical propio y Open Graph', () => {
    const html = renderizarPagina(instantaneaDeEjemplo(), '/funcionalidades/personaje', 'es', op)!;
    expect(html).toContain('<title>Personaje con boca sincronizada para cursos SCORM</title>');
    expect(html).toContain('<meta name="description" content="Un personaje SVG que habla con la boca sincronizada al audio, sin video: cambias el texto y la boca se rehace sola."/>');
    expect(html).toContain('<link rel="canonical" href="https://aptioscorm.com/funcionalidades/personaje"/>');
    expect(html).toContain('<meta property="og:title" content="Personaje con boca sincronizada para cursos SCORM"/>');
    expect(html).toContain('<meta property="og:url" content="https://aptioscorm.com/funcionalidades/personaje"/>');
    expect(html).toContain('<meta property="og:type" content="website"/><meta property="og:site_name" content="Aptio SCORM"/><meta property="og:locale" content="es_PE"/>');
    expect(html).toContain('<meta name="robots" content="index, follow"/>');
    expect(renderizarPagina(instantaneaDeEjemplo(), '/', 'en', op)).toContain('<meta property="og:locale" content="en_US"/>');

    const propio = sitio([fila('/a', 'es', { canonical: '/b' }), fila('/c', 'es', { canonical: 'https://otro.pe/c' })]);
    expect(renderizarPagina(propio, '/a', 'es', op)).toContain('<link rel="canonical" href="https://aptioscorm.com/b"/>');
    expect(renderizarPagina(propio, '/c', 'es', op)).toContain('<link rel="canonical" href="https://otro.pe/c"/>');
    // Sin SEO propio, el título con el nombre del sitio y el texto general.
    expect(renderizarPagina(propio, '/a', 'es', op)).toContain('<title>Página /a · Aptio SCORM</title>');
  });

  it('los textos del SEO se escapan (RN-16-7)', () => {
    const html = renderizarPagina(sitio([fila('/a', 'es', { metaTitulo: 'Uno "dos" & <tres>', metaDescripcion: '</script><script>alert(1)</script>' })]), '/a', 'es', op)!;
    expect(html).toContain('<title>Uno &quot;dos&quot; &amp; &lt;tres&gt;</title>');
    expect(sinJsonLd(html)).not.toMatch(/<script/);
    expect(jsonLd(html)).toMatchObject({ name: 'Uno "dos" & <tres>', description: '</script><script>alert(1)</script>' });
    expect(jsonLdSeguro({ a: '</script>&\u2028' })).toBe('{"a":"\\u003c/script\\u003e\\u0026\\u2028"}');
  });
});

describe('CP-125 · una página sin indexar', () => {
  const inst = sitio([fila('/', 'es'), fila('/precios', 'es'), fila('/precios', 'en', { indexar: false }), fila('/oculta', 'es', { indexar: false })]);

  it('lleva noindex, sale del sitemap y no tiene hreflang hacia ni desde ella', () => {
    const oculta = renderizarPagina(inst, '/oculta', 'es', op)!;
    expect(oculta).toContain('<meta name="robots" content="noindex"/>');
    const es = renderizarPagina(inst, '/precios', 'es', op)!;
    const en = renderizarPagina(inst, '/precios', 'en', op)!;
    expect(es).toContain('<meta name="robots" content="index, follow"/>');
    expect(en).toContain('<meta name="robots" content="noindex"/>');
    for (const html of [es, en]) expect(html).not.toContain('hreflang');
    const mapa = sitemapXml(inst, op.sitioUrl);
    expect(mapa).toContain('<loc>https://aptioscorm.com/precios</loc>');
    expect(mapa).not.toMatch(/\/oculta|\/en\/precios|xhtml:link/);
  });

  it('en pruebas todas siguen con noindex, nofollow', () => {
    const pruebas = renderizarPagina(inst, '/oculta', 'es', { ...op, entorno: 'pruebas' })!;
    expect(pruebas).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });
});

describe('datos estructurados (JSON-LD)', () => {
  it('el inicio: Organization y FAQPage con sus preguntas visibles', () => {
    const d = jsonLd(renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)!);
    expect(d['@context']).toBe('https://schema.org');
    const [org, pagina] = d['@graph'] as Record<string, unknown>[];
    expect(org).toEqual({ '@type': 'Organization', name: 'Aptio SCORM', url: 'https://aptioscorm.com/' });
    expect(pagina).toMatchObject({ '@type': 'FAQPage', url: 'https://aptioscorm.com/', inLanguage: 'es-PE' });
    expect(pagina!.mainEntity).toEqual([{ '@type': 'Question', name: '¿Funciona con mi LMS?', acceptedAnswer: { '@type': 'Answer', text: 'Sí: el paquete cumple SCORM 1.2 de forma estricta.' } }]);
    // El inicio en inglés también lleva Organization.
    expect((jsonLd(renderizarPagina(instantaneaDeEjemplo(), '/', 'en', op)!)['@graph'] as { '@type': string }[]).map((n) => n['@type'])).toEqual(['Organization', 'WebPage']);
  });

  it('Product con la marca, WebPage por defecto y FAQPage sin preguntas como WebPage', () => {
    expect(jsonLd(renderizarPagina(instantaneaDeEjemplo(), '/funcionalidades/personaje', 'es', op)!)).toEqual({
      '@context': 'https://schema.org', '@type': 'Product', name: 'Personaje con boca sincronizada para cursos SCORM',
      description: 'Un personaje SVG que habla con la boca sincronizada al audio, sin video: cambias el texto y la boca se rehace sola.',
      url: 'https://aptioscorm.com/funcionalidades/personaje', inLanguage: 'es-PE', brand: { '@type': 'Brand', name: 'Aptio SCORM' },
    });
    const inst = sitio([fila('/a', 'es'), fila('/b', 'es', { datosEstructurados: 'FAQPage' })]);
    expect(jsonLd(renderizarPagina(inst, '/a', 'es', op)!)['@type']).toBe('WebPage');
    expect(jsonLd(renderizarPagina(inst, '/b', 'es', op)!)['@type']).toBe('WebPage');
  });
});

describe('robots.txt y redirecciones', () => {
  it('suma las reglas extra en producción; en pruebas sigue bloqueando todo', () => {
    expect(robotsTxt(op, 'Disallow: /panel\n# interno')).toBe('User-agent: *\nAllow: /\nDisallow: /panel\n# interno\n\nSitemap: https://aptioscorm.com/sitemap.xml\n');
    expect(robotsTxt(op)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://aptioscorm.com/sitemap.xml\n');
    expect(robotsTxt({ ...op, entorno: 'pruebas' }, 'Allow: /x')).toBe('User-agent: *\nDisallow: /\n');
    const archivos = renderizarSitio(sitio([fila('/', 'es')], { robotsExtra: 'Disallow: /panel' }), op);
    expect(archivos.find((a) => a.archivo === 'robots.txt')!.contenido).toContain('Allow: /\nDisallow: /panel\n');
  });

  it('CP-124: la versión guarda sus redirecciones activas en un archivo que no se sirve', () => {
    const con = renderizarSitio(sitio([fila('/', 'es')], { redirecciones: [{ desde: '/vieja', hacia: '/', activa: true }, { desde: '/off', hacia: '/', activa: false }] }), op);
    expect(JSON.parse(con.find((a) => a.archivo === ARCHIVO_REDIRECCIONES)!.contenido)).toEqual([{ desde: '/vieja', hacia: '/' }]);
    expect(renderizarSitio(sitio([fila('/', 'es')]), op).some((a) => a.archivo === ARCHIVO_REDIRECCIONES)).toBe(false);
  });
});
