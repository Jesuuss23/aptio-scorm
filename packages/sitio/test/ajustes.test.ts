// HU-1509 · Ajustes en el HTML: nombre, logo, favicon y dominio de la versión; botón de WhatsApp sin JavaScript; la
// página de mantenimiento (CP-121) y las cabeceras del 503 y de la marca.
import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizarMantenimiento, renderizarPagina, renderizarSitio } from '../src/render.js';
import { cabecerasSitio, resolverPedido } from '../src/servir.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
const conSitio = () => ({
  ...instantaneaDeEjemplo(),
  sitio: {
    nombre: 'Aulas <Pro>', dominio: 'www.ejemplo-aptio.pe', logo: { archivo: 'logo-abcdef01.svg', mime: 'image/svg+xml' as const },
    favicon: { archivo: 'favicon-12345678.png', mime: 'image/png' as const }, whatsapp: { numero: '+51987654321', mensaje: 'Hola' },
  },
});

describe('ajustes del sitio en el HTML (HU-1509)', () => {
  it('usa el nombre, el logo, el favicon y el dominio guardados en la versión', () => {
    const html = renderizarPagina(conSitio(), '/', 'es', op)!;
    expect(html).toContain('<title>Aulas &lt;Pro&gt; · Inicio</title>');
    expect(html).toContain('<img class="logo-img" src="/s/_marca/logo-abcdef01.svg" alt="" width="32" height="32"/><span>Aulas &lt;Pro&gt;</span>');
    expect(html).toContain('<link rel="icon" href="/s/_marca/favicon-12345678.png" type="image/png"/>');
    expect(html).toContain('<link rel="canonical" href="https://www.ejemplo-aptio.pe/"/>');
    expect(html).toContain('© 2026 Aulas &lt;Pro&gt;.');
    const archivos = renderizarSitio(conSitio(), op);
    expect(archivos.find((a) => a.archivo === 'sitemap.xml')!.contenido).toContain('<loc>https://www.ejemplo-aptio.pe/</loc>');
    expect(archivos.find((a) => a.archivo === 'robots.txt')!.contenido).toContain('Sitemap: https://www.ejemplo-aptio.pe/sitemap.xml');
  });

  it('el botón de WhatsApp es un enlace wa.me en otra pestaña, sin JavaScript', () => {
    const html = renderizarPagina(conSitio(), '/', 'es', op)!;
    expect(html).toContain('<a class="whatsapp" href="https://wa.me/51987654321?text=Hola" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp (se abre en una pestaña nueva)">');
    expect(html).not.toMatch(/<script|\son[a-z]+=/i);
    expect(renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)).not.toContain('class="whatsapp"');
    expect(renderizarPagina(instantaneaDeEjemplo(), '/', 'es', op)).toContain('<span>Aptio <b>SCORM</b></span>');
  });

  it('CP-121: la página de mantenimiento tiene la marca, el aviso y el mensaje escapado, sin menú y noindex', () => {
    const html = renderizarMantenimiento(conSitio(), op, 'Volvemos a las <b>3</b>');
    expect(html).toMatch(/^<!doctype html><html lang="es">/);
    expect(html).toContain('<h1>Volvemos pronto</h1>');
    expect(html).toContain('<p>Volvemos a las &lt;b&gt;3&lt;/b&gt;</p>');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(html).not.toMatch(/<nav|<script|class="whatsapp"|rel="canonical"/);
    expect(renderizarMantenimiento(null, op, null)).toContain('<span>Aptio <b>SCORM</b></span>');
  });

  it('el 503 no se guarda en caché y avisa cuándo reintentar; la marca se guarda un año', () => {
    expect(cabecerasSitio('503', 'x')).toMatchObject({ 'Cache-Control': 'private, no-store', 'Retry-After': '600', 'Content-Type': 'text/html; charset=utf-8' });
    expect(cabecerasSitio('pagina', 'x', { privada: true })['Cache-Control']).toBe('private, no-store');
    expect(cabecerasSitio('marca', 'x', { archivo: 'logo-abcdef01.png' })).toMatchObject({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
    expect(cabecerasSitio('marca', 'x', { archivo: 'logo-abcdef01.svg' })).toMatchObject({ 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    expect(resolverPedido('/_marca/logo-abcdef01.svg')).toEqual({ tipo: 'marca', archivo: 'logo-abcdef01.svg' });
    expect(resolverPedido('/_marca/otro.svg')).toBeNull();
  });
});
