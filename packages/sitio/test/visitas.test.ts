// HU-1607 · El contador de visitas anónimas del sitio (REQ-080, PNT-24): `_visita.js` va en toda versión y en todas sus
// páginas publicadas (no en la 404 ni en la de gracias), del mismo origen, sin cookies, y manda una vez por página.
import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizar404, renderizarGracias, renderizarPagina, renderizarSitio, sinScriptsOpcionales } from '../src/render.js';
import { POLITICA_CONTENIDO, resolverPedido } from '../src/servir.js';
import { ARCHIVO_VISITA, CLAVE_VISITA, SCRIPT_VISITA } from '../src/visitas.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('script de visitas', () => {
  it('va en toda versión y en cada página publicada, en español e inglés', () => {
    const inst = instantaneaDeEjemplo();
    expect(renderizarSitio(inst, op).find((a) => a.archivo === ARCHIVO_VISITA)).toEqual({ archivo: '_visita.js', contenido: SCRIPT_VISITA, mime: 'text/javascript; charset=utf-8' });
    const etiqueta = '<script src="/s/_visita.js" defer="" data-base="/s"></script>';
    expect(renderizarPagina(inst, '/', 'es', op)).toContain(etiqueta);
    expect(renderizarPagina(inst, '/', 'en', op)).toContain(etiqueta);
    expect(renderizar404(inst, op)).not.toContain(ARCHIVO_VISITA);
    expect(renderizarGracias(instantaneaDeEjemplo('produccion', { agenda: true }), op)).not.toContain(ARCHIVO_VISITA);
    expect(sinScriptsOpcionales(renderizarPagina(inst, '/', 'es', op)!)).not.toContain(ARCHIVO_VISITA);
    expect(resolverPedido('/_visita.js')).toEqual({ tipo: 'script', archivo: '_visita.js' });
  });

  it('es válido, del mismo origen, sin cookies ni HTML, y manda una sola vez', () => {
    expect(() => new Function(SCRIPT_VISITA)).not.toThrow();
    expect(SCRIPT_VISITA).not.toMatch(/https?:\/\/|document\.cookie|innerHTML|eval\(|setInterval|addEventListener/);
    expect(SCRIPT_VISITA).toContain(JSON.stringify(CLAVE_VISITA));
    expect(SCRIPT_VISITA).toContain("'/_visita'");
    expect(SCRIPT_VISITA.match(/sendBeacon\(/g)).toHaveLength(1);
    expect(SCRIPT_VISITA.match(/fetch\(/g)).toHaveLength(1);
    expect(SCRIPT_VISITA).toContain('keepalive:true');
    // El fetch es el respaldo: solo corre si sendBeacon no existe o no aceptó el envío.
    expect(SCRIPT_VISITA.indexOf('return;')).toBeLessThan(SCRIPT_VISITA.indexOf('fetch('));
    expect(POLITICA_CONTENIDO).toContain("connect-src 'self'");
  });

  it('manda la ruta sin la base, el idioma, si es la primera página y el utm_source de la sesión', () => {
    const enviados: unknown[] = [];
    const sesion = new Map<string, string>([['aptio.captacion', JSON.stringify({ paginaEntrada: '/', utm_source: 'linkedin' })]]);
    const correr = (pathname: string, lang: string) => {
      const entorno = {
        document: { currentScript: { getAttribute: () => '/s' }, documentElement: { lang } },
        location: { pathname, search: '' },
        window: { sessionStorage: { getItem: (k: string) => sesion.get(k) ?? null, setItem: (k: string, v: string) => sesion.set(k, v) } },
        navigator: { sendBeacon: (_u: string, b: { partes: string[] }) => { enviados.push({ url: _u, ...JSON.parse(b.partes[0]!) }); return true; } },
        Blob: class { partes: string[]; constructor(p: string[]) { this.partes = p; } },
        URLSearchParams,
        fetch: () => { throw new Error('no debe usar fetch'); },
      };
      new Function(...Object.keys(entorno), SCRIPT_VISITA)(...Object.values(entorno));
    };
    correr('/s/', 'es');
    correr('/s/en/precios', 'en');
    expect(enviados).toEqual([
      { url: '/s/_visita', ruta: '/', idioma: 'es', primeraPagina: true, origen: 'linkedin' },
      { url: '/s/_visita', ruta: '/en/precios', idioma: 'en', primeraPagina: false, origen: 'linkedin' },
    ]);
  });
});
