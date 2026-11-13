// HU-1511 · Reglas del blog: la URL de WordPress segura, la lectura de la API REST (solo publicados sin clave, CP-154,
// texto plano e imagen de hasta 800 px), lo que ve el público (CP-123, CP-155), la categoría inicial (CP-159) y el tipo
// de imagen por su firma.
import { describe, expect, it } from 'vitest';
import {
  aplicarCambiosBlog, articulosDeCategoria, blogPublico, CONEXION_BLOG_POR_DEFECTO, categoriaInicial, enlaceEditarWp, esIpPrivada, type FilaArticuloBlog,
  leerArticuloWp, leerCategoriaWp, mimeDeImagen, textoDeHtml, validarUrlBlog,
} from '../src/sitio-blog.js';

const post = (extra: Record<string, unknown> = {}) => ({
  id: 10, slug: 'un-articulo', status: 'publish', date_gmt: '2026-11-01T15:00:00', link: 'https://blog.ejemplo.pe/un-articulo/',
  title: { rendered: 'Guía &amp; <em>trucos</em>' }, excerpt: { rendered: '<p>Hola&nbsp;mundo&hellip;</p>\n', protected: false }, content: { protected: false },
  categories: [3, 4, 3, -1], _embedded: { author: [{ name: 'Lucía' }] }, ...extra,
});

describe('URL de WordPress', () => {
  it('acepta https:// con dominio público y la guarda sin / final; vacía desconecta', () => {
    expect(validarUrlBlog(' https://Blog.Ejemplo.pe/ ')).toEqual({ ok: true, url: 'https://blog.ejemplo.pe' });
    expect(validarUrlBlog('https://ejemplo.pe/blog/')).toEqual({ ok: true, url: 'https://ejemplo.pe/blog' });
    expect(validarUrlBlog('')).toEqual({ ok: true, url: null });
    expect(validarUrlBlog(null)).toEqual({ ok: true, url: null });
  });

  it('rechaza http, IP, credenciales, puertos, parámetros y dominios internos', () => {
    const mal = (u: string) => { const r = validarUrlBlog(u); return r.ok ? null : r.mensaje; };
    expect(mal('http://blog.ejemplo.pe')).toBe('La URL del blog empieza con https://');
    expect(mal('https://192.168.1.10')).toBe('La URL del blog usa un dominio, no una dirección IP');
    expect(mal('https://[::1]')).toBe('La URL del blog usa un dominio, no una dirección IP');
    expect(mal('https://a:b@blog.ejemplo.pe')).toBe('La URL del blog va sin usuario, clave, puerto ni parámetros');
    expect(mal('https://blog.ejemplo.pe:8443')).toBe('La URL del blog va sin usuario, clave, puerto ni parámetros');
    expect(mal('https://blog.ejemplo.pe/?p=1')).toBe('La URL del blog va sin usuario, clave, puerto ni parámetros');
    expect(mal('https://wordpress.local')).toBe('La URL del blog necesita un dominio público');
    expect(mal('https://intranet')).toBe('La URL del blog necesita un dominio público');
  });

  it('reconoce las IP privadas, locales y reservadas', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.0.5', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(esIpPrivada(ip)).toBe(true);
    for (const ip of ['93.184.216.34', '172.32.0.1', '2606:4700::1111']) expect(esIpPrivada(ip)).toBe(false);
  });

  it('valida frecuencia y artículos por filtro', () => {
    expect(aplicarCambiosBlog(CONEXION_BLOG_POR_DEFECTO, { frecuenciaMin: 30, porPagina: 9, mostrarAutor: false })).toEqual({
      ok: true, conexion: { ...CONEXION_BLOG_POR_DEFECTO, frecuenciaMin: 30, porPagina: 9, mostrarAutor: false },
    });
    const r = aplicarCambiosBlog(CONEXION_BLOG_POR_DEFECTO, { frecuenciaMin: 5, porPagina: 2, url: 'ftp://x' });
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['url', 'frecuenciaMin', 'porPagina']);
  });
});

describe('lectura de la API REST de WordPress', () => {
  it('CP-154: solo artículos publicados sin clave, con texto plano y categorías únicas', () => {
    expect(leerArticuloWp(post())).toEqual({
      id: 10, slug: 'un-articulo', titulo: 'Guía & trucos', extracto: 'Hola mundo…', categorias: [3, 4], autor: 'Lucía',
      fecha: new Date('2026-11-01T15:00:00Z'), enlace: 'https://blog.ejemplo.pe/un-articulo/', imagen: null,
    });
    expect(leerArticuloWp(post({ status: 'draft' }))).toBeNull();
    expect(leerArticuloWp(post({ status: 'private' }))).toBeNull();
    expect(leerArticuloWp(post({ content: { protected: true } }))).toBeNull();
    expect(leerArticuloWp(post({ excerpt: { rendered: '', protected: true } }))).toBeNull();
    expect(leerArticuloWp(post({ link: 'javascript:alert(1)' }))).toBeNull();
    expect(leerArticuloWp(post({ title: { rendered: '   ' } }))).toBeNull();
    expect(leerArticuloWp('nada')).toBeNull();
  });

  it('la imagen es el tamaño más grande de hasta 800 px, o el original si no hay tamaños', () => {
    const media = (sizes: object, extra: object = {}) => post({ _embedded: { 'wp:featuredmedia': [{ source_url: 'https://blog.ejemplo.pe/o.jpg', media_details: { width: 2000, height: 1000, sizes }, ...extra }] } });
    expect(leerArticuloWp(media({ medium: { source_url: 'https://blog.ejemplo.pe/300.jpg', width: 300, height: 150 }, medium_large: { source_url: 'https://blog.ejemplo.pe/768.jpg', width: 768, height: 384 }, large: { source_url: 'https://blog.ejemplo.pe/1024.jpg', width: 1024, height: 512 } }))?.imagen)
      .toEqual({ origen: 'https://blog.ejemplo.pe/768.jpg', ancho: 768, alto: 384 });
    expect(leerArticuloWp(media({}))?.imagen).toEqual({ origen: 'https://blog.ejemplo.pe/o.jpg', ancho: 2000, alto: 1000 });
    expect(leerArticuloWp(media({}, { source_url: 'http://inseguro.pe/o.jpg' }))?.imagen).toBeNull();
  });

  it('categorías: nombre en texto plano y slug seguro', () => {
    expect(leerCategoriaWp({ id: 4, name: 'Casos &amp; ejemplos', slug: 'casos' })).toEqual({ id: 4, nombre: 'Casos & ejemplos', slug: 'casos' });
    expect(leerCategoriaWp({ id: 5, name: 'Raro', slug: '../x' })).toEqual({ id: 5, nombre: 'Raro', slug: 'categoria-5' });
    expect(leerCategoriaWp({ id: 0, name: 'x' })).toBeNull();
    expect(textoDeHtml('<script>x</script> uno\u0007 dos', 50)).toBe('x uno dos');
    expect(textoDeHtml('palabra '.repeat(10), 20)).toBe('palabra palabra…');
  });
});

describe('lo que ve el público', () => {
  const cats = [
    { id: 3, nombre: 'Guías', slug: 'guias', orden: 1, visible: true },
    { id: 4, nombre: 'Casos', slug: 'casos', orden: 0, visible: true },
    { id: 5, nombre: 'Internas', slug: 'internas', orden: 2, visible: false },
    { id: 6, nombre: 'Vacía', slug: 'vacia', orden: 3, visible: true },
  ];
  const art = (id: number, categorias: number[], dia: number, visible = true): FilaArticuloBlog => ({
    id, titulo: `A${id}`, extracto: '', categorias, autor: 'Ana', fecha: `2026-11-0${dia}T10:00:00.000Z`, enlace: `https://b.pe/${id}/`, visible, imagen: dia === 1 ? 'abcdef0123456789.jpg' : null, imagenAncho: 768, imagenAlto: 432,
  });
  const arts = [art(1, [3], 5), art(2, [3, 4], 4), art(3, [5], 3), art(4, [4, 5], 2), art(5, [], 1), art(6, [3], 6, false)];
  const conexion = { ...CONEXION_BLOG_POR_DEFECTO, url: 'https://b.pe' };

  it('CP-123 y CP-155: filtros visibles en orden con su número; sin ocultos ni categorías vacías', () => {
    const b = blogPublico(conexion, cats, arts);
    expect(b.categorias).toEqual([{ slug: 'casos', nombre: 'Casos', cantidad: 2 }, { slug: 'guias', nombre: 'Guías', cantidad: 2 }]);
    expect(b.articulos.map((a) => [a.id, a.categorias])).toEqual([[1, ['guias']], [2, ['guias', 'casos']], [4, ['casos']], [5, []]]);
    expect(b.articulos.at(-1)).toMatchObject({ autor: 'Ana', imagen: { archivo: 'abcdef0123456789.jpg', ancho: 768, alto: 432 } });
    expect(articulosDeCategoria(b, 'casos')?.map((a) => a.id)).toEqual([2, 4]);
    expect(articulosDeCategoria(b)).toHaveLength(4);
    expect(articulosDeCategoria(b, 'internas')).toBeNull();
    const sin = blogPublico({ ...conexion, mostrarAutor: false, mostrarImagen: false }, cats, arts);
    expect(sin.articulos.some((a) => a.autor || a.imagen)).toBe(false);
  });

  it('CP-159: la categoría inicial por nombre o slug, sin mayúsculas; si no es un filtro, null', () => {
    const b = blogPublico(conexion, cats, arts);
    expect(categoriaInicial(b, 'GUÍAS')).toBe('guias');
    expect(categoriaInicial(b, 'casos')).toBe('casos');
    expect(categoriaInicial(b, 'Internas')).toBeNull();
    expect(categoriaInicial(b, null)).toBeNull();
  });

  it('el tipo de imagen sale de su firma y el enlace de edición del administrador', () => {
    expect(mimeDeImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mimeDeImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(mimeDeImagen(new TextEncoder().encode('RIFF1234WEBPVP8 '))).toBe('image/webp');
    expect(mimeDeImagen(new TextEncoder().encode('<svg onload="x">'))).toBeNull();
    expect(enlaceEditarWp('https://b.pe', 7)).toBe('https://b.pe/wp-admin/post.php?post=7&action=edit');
  });
});
