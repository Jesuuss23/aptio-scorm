import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { fuentes } from '../src/fuentes.js';
import { archivoDeRuta, renderizar404, renderizarPagina, renderizarSitio, rutaPublica, sitemapXml } from '../src/render.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com/', base: '/s', anio: 2026 };
const niveles = (html: string) => [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

describe('sitio público pre-renderizado (HU-1508)', () => {
  it('es un documento HTML5 completo, sin JavaScript, con metadatos y fuentes propias', () => {
    const html = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)!;
    expect(html.startsWith('<!doctype html><html lang="es">')).toBe(true);
    expect(html).not.toMatch(/<script|\son[a-z]+=/i);
    expect(html).toContain('<title>Aptio SCORM · Inicio</title>');
    expect(html).toMatch(/<meta name="description" content="[^"]{50,}"\/>/);
    expect(html).toContain('<link rel="canonical" href="https://aptioscorm.com/"/>');
    expect(html).toContain('<meta name="robots" content="index, follow"/>');
    const precarga = [...html.matchAll(/rel="preload" href="([^"]+)"/g)].map((m) => m[1]);
    expect(precarga).toEqual([`/s/_fuentes/${fuentes()[0]!.archivo}`]);
    expect(fuentes().map((f) => `${f.familia} ${f.peso}`)).toEqual(['Atkinson Hyperlegible 400', 'Atkinson Hyperlegible 700', 'Plus Jakarta Sans 700', 'Plus Jakarta Sans 800']);
    expect(html.match(/font-display:swap/g)).toHaveLength(4);
    expect(html).not.toContain('fonts.googleapis');
  });

  it('un solo h1 y encabezados sin saltos; menú de celular con <details> nativo', () => {
    for (const [ruta, idioma] of [['/', 'es'], ['/funcionalidades/personaje', 'es'], ['/', 'en']] as const) {
      const n = niveles(renderizarPagina(instantaneaDeEjemplo(), ruta, idioma, op)!);
      expect(n.filter((x) => x === 1)).toHaveLength(1);
      expect(n[0]).toBe(1);
      expect(n.slice(1).map((x, i) => x - n[i]!).filter((salto) => salto > 1)).toEqual([]);
    }
    const html = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)!;
    expect(html).toMatch(/<details class="menu-celular"><summary>Menú<\/summary><nav class="nav-celular" aria-label="Principal \(menú\)">/);
    expect(html).toContain('<a href="https://blog.aptioscorm.com" target="_blank" rel="noopener">Blog</a>');
    expect(html).toContain('<a href="/s/funcionalidades/personaje">Producto</a>');
    expect(html).toContain('<a href="/s/#testimonios">Casos</a>');
    expect(html).toContain('<a href="/s/privacidad">Privacidad</a>');
  });

  it('en producción no sale ningún dato ficticio ni la franja de confianza; en pruebas salen marcados', () => {
    const prod = renderizarPagina(instantaneaDeEjemplo('pruebas'), '/', 'es', op)!;
    expect(prod).not.toContain('Persona de ejemplo');
    expect(prod).not.toContain('120 equipos');
    expect(prod).toContain('Mariana Paredes');
    const pruebas = renderizarPagina(instantaneaDeEjemplo('pruebas'), '/', 'es', { ...op, entorno: 'pruebas' })!;
    expect(pruebas).toContain('Persona de ejemplo<span class="fic">Dato de ejemplo</span>');
    expect(pruebas).toContain('120 equipos');
    expect(pruebas).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(pruebas).toContain('Sitio de pruebas');
  });

  it('escapa el texto del panel (RN-16-7)', () => {
    const html = renderizarPagina(instantaneaDeEjemplo('pruebas'), '/', 'es', { ...op, entorno: 'pruebas' })!;
    expect(html).toContain('Empresa &lt;b&gt;ficticia&lt;/b&gt;');
    expect(html).not.toContain('<b>ficticia</b>');
  });

  it('las páginas en inglés van bajo /en; un borrador no se dibuja', () => {
    expect(rutaPublica('/', 'en')).toBe('/en');
    expect(rutaPublica('/precios', 'en')).toBe('/en/precios');
    expect(archivoDeRuta('/en/precios')).toBe('en/precios/index.html');
    expect(archivoDeRuta('/')).toBe('index.html');
    const en = renderizarPagina(instantaneaDeEjemplo(), '/', 'en', op)!;
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('<link rel="canonical" href="https://aptioscorm.com/en"/>');
    expect(en).toContain('Skip to content');
    expect(renderizarPagina(instantaneaDeEjemplo(), '/borrador', 'es', op)).toBeNull();
    expect(renderizarSitio(instantaneaDeEjemplo(), op).map((a) => a.archivo)).toEqual([
      'en/index.html', 'index.html', 'funcionalidades/personaje/index.html', 'sectores/banca-y-seguros/index.html',
      'sectores/educacion-superior/index.html', 'sectores/mineria-y-energia/index.html', 'sectores/retail-y-consumo/index.html',
      '404.html', 'sitemap.xml', 'robots.txt',
    ]);
    expect(sitemapXml(instantaneaDeEjemplo(), op.sitioUrl)).toContain('<loc>https://aptioscorm.com/en</loc>');
  });

  it('la 404 es una página limpia, sin canonical y sin indexar', () => {
    const html = renderizar404(instantaneaDeEjemplo(), op);
    expect(html).toContain('<h1>Página no encontrada</h1>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('noindex, nofollow');
    expect(renderizar404(null, op)).not.toContain('<nav');
  });
});
