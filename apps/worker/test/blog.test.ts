// HU-1511 · Sincronización del blog con WordPress, contra PostgreSQL y el S3 local reales y un WordPress simulado:
// solo artículos publicados sin clave (CP-154), la imagen copiada al bucket, lo oculto sigue oculto, las categorías
// nuevas entran al final, y si WordPress falla la copia queda y el error se guarda (CP-156). El render toma el blog.
import { Almacen, configDesdeEnv, prepararAlmacen } from '@aptio/almacen';
import { ID_BLOG, prisma } from '@aptio/db';
import { claveBlog, renderizarPagina, instantaneaDeEjemplo } from '@aptio/sitio';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type DependenciasBlog, sincronizarBlog } from '../src/blog.js';
import { opcionesPrerender } from '../src/sitio-prerender.js';

const endpoint = process.env.AWS_ENDPOINT ?? 'http://localhost:9000';
const hayS3 = await fetch(`${endpoint}/_localstack/health`).then((r) => r.ok).catch(() => false);
const hayBase = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const config = configDesdeEnv({ AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', ...process.env, AWS_ENDPOINT: endpoint });
const almacen = new Almacen({ ...config, bucket: 'aptio-pruebas-blog' });
const WP = 'https://blog.ejemplo.pe';
// Un PNG mínimo (firma + IHDR): basta para reconocerlo por su firma.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

const categoria = (id: number, name: string, slug: string) => ({ id, name, slug, count: 1 });
const post = (id: number, titulo: string, cats: number[], extra: Record<string, unknown> = {}) => ({
  id, slug: `articulo-${id}`, status: 'publish', date: '2026-11-01T10:00:00', date_gmt: `2026-11-0${id % 9 || 1}T15:00:00`, link: `${WP}/articulo-${id}/`,
  title: { rendered: titulo }, excerpt: { rendered: `<p>Resumen de ${titulo} &amp; más</p>`, protected: false }, content: { rendered: '', protected: false },
  categories: cats, _embedded: { author: [{ name: 'Equipo Aptio' }] }, ...extra,
});
const conImagen = {
  _embedded: {
    author: [{ name: 'Lucía' }],
    'wp:featuredmedia': [{ source_url: `${WP}/img/grande.png`, media_details: { width: 2000, height: 1000, sizes: { medium_large: { source_url: `${WP}/img/768.png`, width: 768, height: 384 }, large: { source_url: `${WP}/img/1024.png`, width: 1024, height: 512 } } } }],
  },
};

/** Un WordPress simulado: lo que devuelve cada ruta, y los pedidos que recibió. */
function wordpress(estado: { categorias: unknown[]; posts: unknown[]; caido?: boolean }) {
  const pedidos: string[] = [];
  const obtener: DependenciasBlog['obtener'] = async (url, init) => {
    pedidos.push(url);
    expect(init.redirect).toBe('error');
    if (estado.caido) throw new TypeError('fetch failed');
    const u = new URL(url);
    if (u.pathname === '/wp-json/wp/v2/categories') return Response.json(estado.categorias);
    // Sin `status=publish`, WordPress mandaría solo lo publicado igual; el simulado lo exige para comprobar el pedido.
    if (u.pathname === '/wp-json/wp/v2/posts') return u.searchParams.get('status') === 'publish' ? Response.json(estado.posts) : new Response('[]', { status: 400 });
    if (u.pathname.startsWith('/img/')) return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    return new Response('no', { status: 404 });
  };
  return { pedidos, deps: { obtener, resolver: async () => ['93.184.216.34'] } satisfies DependenciasBlog };
}

const limpiar = async () => {
  await prisma.wpArticulo.deleteMany();
  await prisma.wpCategoria.deleteMany();
  await prisma.auditoria.deleteMany({ where: { entidad: 'SitioBlog' } });
  await prisma.sitioBlog.deleteMany();
};

describe.skipIf((!hayS3 || !hayBase) && !process.env.CI)('sincronización del blog (HU-1511)', () => {
  beforeAll(() => prepararAlmacen(almacen, ['http://localhost:5173']));
  beforeEach(async () => {
    await limpiar();
    await prisma.sitioBlog.create({ data: { id: ID_BLOG, url: WP, frecuenciaMin: 15 } });
  });
  afterAll(limpiar);

  it('CP-154: guarda solo lo publicado sin clave, copia la imagen de hasta 800 px y registra la sincronización', async () => {
    const { deps, pedidos } = wordpress({
      categorias: [categoria(3, 'Guías', 'guias'), categoria(4, 'Casos &amp; ejemplos', 'casos')],
      posts: [
        post(10, 'Cómo preparar un manual', [3], conImagen),
        post(11, 'Un caso real', [4]),
        post(12, 'Borrador', [3], { status: 'draft' }),
        post(13, 'Con clave', [3], { content: { rendered: '', protected: true } }),
        post(14, 'Privado', [3], { status: 'private' }),
      ],
    });
    const r = await sincronizarBlog(prisma, almacen, {}, deps);
    expect(r).toEqual({ estado: 'listo', cambios: true, categorias: 2, articulos: 2, imagenes: 1 });
    expect(pedidos).toContain(`${WP}/img/768.png`);
    expect(pedidos.find((p) => p.includes('/wp/v2/posts'))).toContain('status=publish');
    expect(pedidos).not.toContain(`${WP}/img/1024.png`);

    const articulos = await prisma.wpArticulo.findMany({ orderBy: { id: 'asc' } });
    expect(articulos.map((a) => a.titulo)).toEqual(['Cómo preparar un manual', 'Un caso real']);
    expect(articulos[0]).toMatchObject({ extracto: 'Resumen de Cómo preparar un manual & más', autor: 'Lucía', imagenAncho: 768, imagenAlto: 384, imagenOrigen: `${WP}/img/768.png`, visible: true });
    expect(articulos[0]!.imagen).toMatch(/^[0-9a-f]{16}\.png$/);
    expect((await almacen.info(claveBlog(articulos[0]!.imagen!)))?.mime).toBe('image/png');
    expect((await prisma.wpCategoria.findMany({ orderBy: { orden: 'asc' } })).map((c) => [c.nombre, c.orden, c.visible])).toEqual([['Guías', 0, true], ['Casos & ejemplos', 1, true]]);
    const blog = await prisma.sitioBlog.findUniqueOrThrow({ where: { id: ID_BLOG } });
    expect(blog.error).toBeNull();
    expect(blog.sincronizadoEn).toBeInstanceOf(Date);
    const aud = await prisma.auditoria.findFirst({ where: { entidad: 'SitioBlog', accion: 'SITIO_BLOG_SINCRONIZADO' } });
    expect(aud?.datos).toMatchObject({ categorias: 2, articulos: 2, imagenes: 1, cambios: true });

    // Antes de la frecuencia no vuelve a leer; con «Sincronizar ahora» sí, y sin cambios no pide re-render ni baja la imagen otra vez.
    pedidos.length = 0;
    expect(await sincronizarBlog(prisma, almacen, {}, deps)).toEqual({ estado: 'omitido', cambios: false });
    expect(pedidos).toEqual([]);
    expect(await sincronizarBlog(prisma, almacen, { forzar: true }, deps)).toMatchObject({ estado: 'listo', cambios: false, imagenes: 0 });
    expect(pedidos.some((p) => p.includes('/img/'))).toBe(false);
  });

  it('lo oculto sigue oculto, una categoría nueva entra visible al final y lo que WordPress quitó se borra', async () => {
    const wp = { categorias: [categoria(3, 'Guías', 'guias'), categoria(4, 'Casos', 'casos')], posts: [post(10, 'Uno', [3]), post(11, 'Dos', [4])] };
    const { deps } = wordpress(wp);
    await sincronizarBlog(prisma, almacen, {}, deps);
    await prisma.wpCategoria.update({ where: { id: 3 }, data: { visible: false, orden: 5 } });
    await prisma.wpArticulo.update({ where: { id: 11 }, data: { visible: false } });

    wp.categorias.push(categoria(7, 'Noticias', 'noticias'));
    wp.posts = [post(11, 'Dos (editado)', [4]), post(15, 'Tres', [7])];
    expect(await sincronizarBlog(prisma, almacen, { forzar: true }, deps)).toMatchObject({ estado: 'listo', cambios: true });
    expect((await prisma.wpCategoria.findMany({ orderBy: { id: 'asc' } })).map((c) => [c.id, c.orden, c.visible])).toEqual([[3, 5, false], [4, 1, true], [7, 6, true]]);
    expect((await prisma.wpArticulo.findMany({ orderBy: { id: 'asc' } })).map((a) => [a.id, a.titulo, a.visible])).toEqual([[11, 'Dos (editado)', false], [15, 'Tres', true]]);
  });

  it('CP-156: si WordPress no responde, la copia queda, el error se guarda una vez y se limpia al volver', async () => {
    const wp = { categorias: [categoria(3, 'Guías', 'guias')], posts: [post(10, 'Uno', [3])], caido: false };
    const { deps } = wordpress(wp);
    await sincronizarBlog(prisma, almacen, {}, deps);
    wp.caido = true;
    expect(await sincronizarBlog(prisma, almacen, { forzar: true }, deps)).toEqual({ estado: 'error', cambios: false, error: 'No se pudo conectar con WordPress' });
    await sincronizarBlog(prisma, almacen, { forzar: true }, deps);
    expect(await prisma.wpArticulo.count()).toBe(1);
    const blog = await prisma.sitioBlog.findUniqueOrThrow({ where: { id: ID_BLOG } });
    expect(blog.error).toBe('No se pudo conectar con WordPress');
    expect(blog.intentoEn!.getTime()).toBeGreaterThan(blog.sincronizadoEn!.getTime() - 1);
    expect(await prisma.auditoria.count({ where: { entidad: 'SitioBlog', accion: 'SITIO_BLOG_ERROR' } })).toBe(1);

    // Una respuesta que no es de WordPress también es un error, con un mensaje que ayuda.
    const html: DependenciasBlog = { ...deps, obtener: async () => new Response('<html>hola</html>') };
    expect((await sincronizarBlog(prisma, almacen, { forzar: true }, html)).error).toBe(`${WP}/wp-json/wp/v2/categories no devolvió JSON: ¿es un WordPress con la API REST activa?`);

    wp.caido = false;
    expect(await sincronizarBlog(prisma, almacen, { forzar: true }, deps)).toMatchObject({ estado: 'listo' });
    expect((await prisma.sitioBlog.findUniqueOrThrow({ where: { id: ID_BLOG } })).error).toBeNull();
  });

  it('no lee un dominio que apunta a la red interna, ni nada si no hay WordPress conectado', async () => {
    const { deps, pedidos } = wordpress({ categorias: [], posts: [] });
    const r = await sincronizarBlog(prisma, almacen, { forzar: true }, { ...deps, resolver: async () => ['10.0.0.8'] });
    expect(r).toEqual({ estado: 'error', cambios: false, error: 'El dominio blog.ejemplo.pe apunta a una red interna' });
    expect(pedidos).toEqual([]);
    await prisma.sitioBlog.update({ where: { id: ID_BLOG }, data: { url: null } });
    expect(await sincronizarBlog(prisma, almacen, { forzar: true }, deps)).toEqual({ estado: 'omitido', cambios: false });
  });

  it('el pre-render toma el blog guardado: la sección y «Últimos artículos» con lo visible', async () => {
    const { deps } = wordpress({ categorias: [categoria(3, 'Guías', 'guias')], posts: [post(10, 'Cómo preparar un manual', [3]), post(11, 'Oculto', [3])] });
    await sincronizarBlog(prisma, almacen, {}, deps);
    await prisma.wpArticulo.update({ where: { id: 11 }, data: { visible: false } });
    const op = await opcionesPrerender(prisma, { SITIO_ENTORNO: 'produccion', SITIO_URL: 'https://aptioscorm.com', SITIO_BASE: '/s' });
    expect(op.blog?.articulos.map((a) => a.titulo)).toEqual(['Cómo preparar un manual']);
    const html = renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)!;
    expect(html).toContain('id="blog"');
    expect(html).toContain('<h2>Últimos artículos</h2>');
    expect(html).not.toContain('Oculto');

    await prisma.sitioBlog.update({ where: { id: ID_BLOG }, data: { url: null } });
    expect((await opcionesPrerender(prisma, {})).blog).toBeNull();
  });
});
