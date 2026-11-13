// HU-1511 · Sección Blog desde WordPress en el render: CP-123 (filtros con su número y listas por categoría, sin
// JavaScript), CP-155 (categoría y artículo ocultos fuera de la sección y del pie), CP-159 (la landing empieza en su
// categoría inicial), la imagen copiada y robots.txt con el sitemap del blog.
import { describe, expect, it } from 'vitest';
import { blogDeEjemplo, instantaneaDeEjemplo } from '../src/ejemplo.js';
import { cssBlog, renderizarPagina, renderizarSitio, robotsTxt } from '../src/render.js';
import { resolverPedido } from '../src/servir.js';
import { blogPublico } from '@aptio/schema/sitio-blog';

const ej = blogDeEjemplo();
const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', blog: ej.publico };
const inicio = () => renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)!;
const seccion = (html: string) => html.slice(html.indexOf('id="blog"'), html.indexOf('</section>', html.indexOf('id="blog"')));

describe('sección Blog (HU-1511)', () => {
  it('CP-123: un radio y una etiqueta por filtro con su número, y una lista por filtro; el CSS muestra la del radio marcado', () => {
    const html = seccion(inicio());
    expect(html).toContain('aria-label="Filtrar artículos por categoría"');
    const etiquetas = [...html.matchAll(/<label for="bf-\d+-([a-z-]+)"[^>]*>([^<]+) <span class="n">\((\d+)\)<\/span>/g)].map((m) => [m[1], m[2], Number(m[3])]);
    expect(etiquetas).toEqual([['todas', 'Todas', 7], ['microaprendizaje', 'Microaprendizaje', 1], ['estandares', 'Estándares', 1], ['guias', 'Guías', 2], ['accesibilidad', 'Accesibilidad', 1], ['gestion', 'Gestión', 1], ['casos', 'Casos', 1]]);
    const guias = html.slice(html.indexOf('class="lista l-guias"'), html.indexOf('</ul>', html.indexOf('class="lista l-guias"')));
    expect([...guias.matchAll(/<h3><a href="([^"]+)">/g)].map((m) => m[1])).toEqual(['https://blog.aptioscorm.com/preparar-un-manual-para-una-capsula/', 'https://blog.aptioscorm.com/guiones-para-voz-con-ia/']);
    // «Todas» muestra hasta 6 (porPagina) y empieza marcada.
    const todas = html.slice(html.indexOf('class="lista l-todas"'), html.indexOf('</ul>', html.indexOf('class="lista l-todas"')));
    expect(todas.match(/<article/g)).toHaveLength(6);
    expect(html).toMatch(/<input type="radio" class="bf bf-todas" id="bf-\d+-todas" name="blog-\d+" checked="" value="todas"/);
    expect(html).toContain('Ver todos los artículos en el blog');
    expect(html).not.toContain('<script');
    expect(inicio()).toContain('.bf-guias:checked~.listas .l-guias');
    expect(cssBlog(null)).toBe('');
  });

  it('CP-155: la categoría oculta y el artículo oculto no salen en la sección ni en «Últimos artículos» del pie', () => {
    const html = inicio();
    expect(html).not.toContain('Noticias internas');
    expect(html).not.toContain('Celebramos 10 años');
    expect(html).not.toContain('Evaluación formativa y sumativa');
    const pie = html.slice(html.indexOf('<footer'));
    expect(pie).toContain('<h2>Últimos artículos</h2>');
    expect([...pie.matchAll(/<li><a href="https:\/\/blog\.aptioscorm\.com\/[^"]+">([^<]+)<\/a><\/li>/g)].map((m) => m[1])).toEqual([
      'Qué es una cápsula de microaprendizaje y cuándo usarla', 'SCORM 1.2, SCORM 2004 y cmi5: cuál pedir a tu proveedor', 'Cómo preparar un manual para convertirlo en cápsula',
    ]);
  });

  it('CP-159: en una landing la sección empieza en su categoría inicial; si no es un filtro visible, en Todas', () => {
    const banca = seccion(renderizarPagina(instantaneaDeEjemplo(), '/sectores/banca-y-seguros', 'es', op)!);
    expect(banca).toMatch(/checked="" value="estandares"/);
    expect(banca).not.toMatch(/checked="" value="todas"/);
    const blogSinEstandares = blogPublico(ej.conexion, ej.categorias.map((c) => (c.slug === 'estandares' ? { ...c, visible: false } : c)), ej.articulos);
    const otra = seccion(renderizarPagina(instantaneaDeEjemplo(), '/sectores/banca-y-seguros', 'es', { ...op, blog: blogSinEstandares })!);
    expect(otra).toMatch(/checked="" value="todas"/);
  });

  it('sin copia del blog o sin artículos visibles, no hay sección ni columna; con imagen, se sirve desde /_blog/', () => {
    const sin = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', { ...op, blog: null })!;
    expect(sin).not.toContain('id="blog"');
    expect(sin).not.toContain('Últimos artículos');
    const vacio = blogPublico(ej.conexion, ej.categorias, ej.articulos.map((a) => ({ ...a, visible: false })));
    expect(renderizarPagina(instantaneaDeEjemplo(), '/', 'es', { ...op, blog: vacio })).not.toContain('id="blog"');

    const conImagen = blogPublico(ej.conexion, ej.categorias, ej.articulos.map((a, i) => (i === 0 ? { ...a, imagen: '0123456789abcdef.jpg', imagenAncho: 768, imagenAlto: 432 } : a)));
    const html = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', { ...op, blog: conImagen })!;
    expect(html).toContain('<img src="/s/_blog/0123456789abcdef.jpg" alt="" loading="lazy" decoding="async" width="768" height="432"/>');
    expect(resolverPedido('/_blog/0123456789abcdef.jpg')).toEqual({ tipo: 'blog', archivo: '0123456789abcdef.jpg' });
    expect(resolverPedido('/_blog/../x.jpg')).toBeNull();
    expect(resolverPedido('/_blog/evil.svg')).toBeNull();
  });

  it('robots.txt enlaza el sitemap de WordPress; el texto del artículo se escapa', () => {
    expect(robotsTxt(op)).toContain('Sitemap: https://blog.aptioscorm.com/wp-sitemap.xml');
    expect(robotsTxt({ ...op, blog: null })).not.toContain('wp-sitemap');
    const raro = blogPublico(ej.conexion, ej.categorias, [{ ...ej.articulos[0]!, titulo: '<script>alert(1)</script> & más' }]);
    const html = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', { ...op, blog: raro })!;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; más');
    expect(renderizarSitio(instantaneaDeEjemplo(), op).find((a) => a.archivo === 'robots.txt')?.contenido).toContain('wp-sitemap.xml');
  });
});
