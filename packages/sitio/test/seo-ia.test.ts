// HU-1513 · SEO para IA en el sitio pre-renderizado: los rastreadores bloqueados en robots.txt (CP-126) y `/llms.txt`,
// que solo existe en la versión cuando el superadmin publicó contenido.
import { describe, expect, it } from 'vitest';
import { armarInstantanea } from '@aptio/schema/sitio-versiones';
import { ARCHIVO_LLMS, renderizarSitio, robotsTxt } from '../src/render.js';
import { cabecerasSitio, resolverPedido } from '../src/servir.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
const sitio = (extra: Partial<Parameters<typeof armarInstantanea>[0]> = {}) => armarInstantanea({ paginas: [], elementos: [], enlaces: [], ...extra }, 'produccion');
const archivo = (inst: ReturnType<typeof sitio>, nombre: string) => renderizarSitio(inst, op).find((a) => a.archivo === nombre);

describe('rastreadores de IA en robots.txt', () => {
  it('CP-126 · un grupo con Disallow: / por cada bloqueado, después del grupo general y antes del sitemap', () => {
    expect(robotsTxt(op, 'Disallow: /panel', ['GPTBot', 'CCBot'])).toBe(
      'User-agent: *\nAllow: /\nDisallow: /panel\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nSitemap: https://aptioscorm.com/sitemap.xml\n',
    );
    expect(robotsTxt(op, null, [])).toBe('User-agent: *\nAllow: /\n\nSitemap: https://aptioscorm.com/sitemap.xml\n');
    // Uno que no es del catálogo no llega al archivo.
    expect(robotsTxt(op, null, ['Otro\nDisallow: /x'])).not.toContain('Otro');
    // En pruebas ya está todo bloqueado.
    expect(robotsTxt({ ...op, entorno: 'pruebas' }, null, ['GPTBot'])).toBe('User-agent: *\nDisallow: /\n');
  });

  it('el robots.txt de la versión lleva los bloqueados de la instantánea', () => {
    const robots = archivo(sitio({ rastreadoresBloqueados: ['GPTBot'] }), 'robots.txt')!;
    expect(robots.contenido).toContain('User-agent: GPTBot\nDisallow: /\n');
    expect(robots.contenido).not.toContain('ClaudeBot');
    expect(archivo(sitio(), 'robots.txt')!.contenido).not.toContain('GPTBot');
  });
});

describe('/llms.txt', () => {
  it('solo está en la versión si tiene contenido, como texto plano', () => {
    expect(archivo(sitio(), ARCHIVO_LLMS)).toBeUndefined();
    expect(archivo(sitio({ llmsTxt: '  \n' }), ARCHIVO_LLMS)).toBeUndefined();
    expect(archivo(sitio({ llmsTxt: '# Aptio SCORM\n\n> Cápsulas con IA.' }), ARCHIVO_LLMS)).toEqual({ archivo: 'llms.txt', contenido: '# Aptio SCORM\n\n> Cápsulas con IA.\n', mime: 'text/plain; charset=utf-8' });
  });

  it('se pide en /llms.txt y sale como text/plain, sin ejecutar nada', () => {
    expect(resolverPedido('/llms.txt')).toEqual({ tipo: 'llms', archivo: 'llms.txt' });
    expect(resolverPedido('/llms.txt?x=1')).toEqual({ tipo: 'llms', archivo: 'llms.txt' });
    const c = cabecerasSitio('llms', '# Aptio');
    expect(c['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(c['X-Content-Type-Options']).toBe('nosniff');
    expect(c['Cache-Control']).toBe('public, max-age=0, s-maxage=60, must-revalidate');
  });
});
