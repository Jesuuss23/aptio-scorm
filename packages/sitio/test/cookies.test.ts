// HU-1606 · El consentimiento de cookies del sitio (REQ-079, RN-17-6, CP-137): `_cookies.js` solo va en las versiones
// con etiquetas, es del mismo origen y la CSP se abre solo a los orígenes de las etiquetas publicadas. Su
// comportamiento en el navegador (aviso, diálogo, cargas) lo recorre Playwright.
import { describe, expect, it } from 'vitest';
import { CLAVE_COOKIES, VIGENCIA_MESES } from '@aptio/schema/cookies';
import { ANCLA_COOKIES, ARCHIVO_COOKIES, ARCHIVO_COOKIES_JSON, atributosCookies, CSS_COOKIES, SCRIPT_COOKIES } from '../src/cookies.js';
import { ETIQUETAS_DE_EJEMPLO, instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizar404, renderizarGracias, renderizarPagina, renderizarSitio, sinScriptsOpcionales } from '../src/render.js';
import { cabecerasSitio, POLITICA_CONTENIDO, politicaContenido, resolverPedido } from '../src/servir.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('script de cookies', () => {
  it('sin etiquetas no hay script, ni aviso, ni enlace en el pie', () => {
    const inst = instantaneaDeEjemplo();
    expect(renderizarSitio(inst, op).some((a) => a.archivo === ARCHIVO_COOKIES || a.archivo === ARCHIVO_COOKIES_JSON)).toBe(false);
    const html = renderizarPagina(inst, '/', 'es', op)!;
    expect(html).not.toContain(ARCHIVO_COOKIES);
    expect(html).not.toContain(`href="${ANCLA_COOKIES}"`);
  });

  it('con etiquetas va en cada página con sus IDs y la política, y el pie ofrece «Configurar cookies»', () => {
    const inst = instantaneaDeEjemplo('produccion', { cookies: true });
    const archivos = renderizarSitio(inst, op);
    expect(archivos.find((a) => a.archivo === ARCHIVO_COOKIES)).toEqual({ archivo: '_cookies.js', contenido: SCRIPT_COOKIES, mime: 'text/javascript; charset=utf-8' });
    expect(JSON.parse(archivos.find((a) => a.archivo === ARCHIVO_COOKIES_JSON)!.contenido as string)).toEqual({ version: 1, etiquetas: ETIQUETAS_DE_EJEMPLO });
    const es = renderizarPagina(inst, '/', 'es', op)!;
    expect(es).toContain('<script src="/s/_cookies.js" defer="" data-version="1" data-ga4="G-AB12CD34EF" data-gtm="GTM-AB12CD3" data-pixel="123456789012345"');
    expect(es).toContain('<a href="#cookies">Configurar cookies</a>');
    expect(renderizarPagina(inst, '/', 'en', op)).toContain('<a href="#cookies">Cookie settings</a>');
    expect(renderizarGracias(inst, op)).toContain('/s/_cookies.js');
    expect(renderizar404(inst, op)).not.toContain('_cookies.js');
    expect(resolverPedido('/_cookies.js')).toEqual({ tipo: 'script', archivo: '_cookies.js' });
    // Lo publicado para la CSP no se sirve.
    expect(resolverPedido('/_cookies.json')).toBeNull();
    expect(sinScriptsOpcionales(es)).not.toContain('_cookies.js');
  });

  it('la ruta de la política de privacidad va en el script solo si está publicada', () => {
    const c = { version: 2, etiquetas: { ga4: 'G-AB12CD34EF' } };
    expect(atributosCookies(c, null)).toEqual({ 'data-version': '2', 'data-ga4': 'G-AB12CD34EF' });
    expect(atributosCookies(c, '/s/privacidad')['data-privacidad']).toBe('/s/privacidad');
  });

  it('es válido, del mismo origen, solo pide etiquetas tras aceptar y nunca crea cookies propias', () => {
    expect(() => new Function(SCRIPT_COOKIES)).not.toThrow();
    expect(SCRIPT_COOKIES).toContain(JSON.stringify(CLAVE_COOKIES));
    expect(SCRIPT_COOKIES).toContain(`MESES=${VIGENCIA_MESES}`);
    expect(SCRIPT_COOKIES).not.toMatch(/innerHTML|eval\(|fetch\(|XMLHttpRequest|sendBeacon/);
    // Los únicos orígenes de afuera son los de las etiquetas, y solo dentro de `cargar`.
    const urls = SCRIPT_COOKIES.match(/https:\/\/[a-z.]+/g) ?? [];
    expect([...new Set(urls)].sort()).toEqual(['https://connect.facebook.net', 'https://www.googletagmanager.com']);
    const cargar = SCRIPT_COOKIES.slice(SCRIPT_COOKIES.indexOf('function cargar('), SCRIPT_COOKIES.indexOf('function borrarCookies('));
    expect(cargar.match(/https:\/\//g)).toHaveLength(3);
    // `document.cookie` solo aparece para borrar (Max-Age=0) las de las etiquetas al retirar el consentimiento.
    expect(SCRIPT_COOKIES.match(/document\.cookie=n\+'=; Max-Age=0/g)).toHaveLength(2);
    expect(SCRIPT_COOKIES.match(/document\.cookie=/g)).toHaveLength(2);
  });

  it('el aviso y el diálogo son accesibles y no mueven la página', () => {
    for (const t of ["role:'dialog'", "'aria-modal':'true'", "role:'switch'", "'aria-disabled':fijo?'true':null", "e.key==='Escape'", "e.key!=='Tab'", "role:'status'", "'aria-label':T.aviso"]) expect(SCRIPT_COOKIES).toContain(t);
    expect(CSS_COOKIES).toMatch(/\.ck-aviso\{position:fixed/);
    expect(CSS_COOKIES).toContain('prefers-reduced-motion:no-preference');
  });
});

describe('CSP de las páginas', () => {
  it('sin etiquetas, la de siempre: solo scripts del mismo origen', () => {
    expect(politicaContenido(null)).toBe(POLITICA_CONTENIDO);
    expect(cabecerasSitio('pagina', 'x')['Content-Security-Policy']).toBe(POLITICA_CONTENIDO);
  });

  it('con GA4 y Tag Manager suma solo los orígenes de Google; con Meta Pixel, solo los de Meta', () => {
    const ga = politicaContenido({ version: 1, etiquetas: { ga4: 'G-AB12CD34EF', gtm: 'GTM-AB12CD3' } });
    expect(ga).toContain("script-src 'self' https://www.googletagmanager.com;");
    expect(ga).toContain('https://www.google-analytics.com');
    expect(ga).not.toContain('facebook');
    expect(ga).toContain("default-src 'none'");
    expect(ga).toContain("frame-ancestors 'none'");
    const meta = politicaContenido({ version: 1, etiquetas: { metaPixel: '123456789012345' } });
    expect(meta).toContain("script-src 'self' https://connect.facebook.net;");
    expect(meta).toContain("img-src 'self' data: https://www.facebook.com;");
    expect(meta).not.toContain('google');
  });

  it('solo las páginas abren la CSP: la 404, el script y la marca siguen cerradas', () => {
    const c = { version: 1, etiquetas: { ...ETIQUETAS_DE_EJEMPLO } };
    expect(cabecerasSitio('pagina', 'x', { cookies: c })['Content-Security-Policy']).toContain('googletagmanager');
    expect(cabecerasSitio('404', 'x', { cookies: c })['Content-Security-Policy']).toBe(POLITICA_CONTENIDO);
    expect(cabecerasSitio('script', 'x', { cookies: c })['Content-Security-Policy']).toBeUndefined();
  });
});
