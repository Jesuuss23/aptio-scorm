// HU-1703 · La página /pago (REQ-083, CP-143, RN-17-3): estática y sin indexar, con el checkout diferido y sin popups ni
// chat; sin JavaScript lleva a agendar una demo. Solo existe si la versión publica un plan con precio. El recorrido con
// teclado y axe lo hace Playwright.
import { describe, expect, it } from 'vitest';
import { PLANES_DE_EJEMPLO } from '@aptio/schema/planes';
import { armarPlanes } from '@aptio/schema/sitio-versiones';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { ARCHIVO_CHECKOUT, CSS_PAGO, SCRIPT_CHECKOUT, SCRIPT_CULQI, TEXTOS_PAGO } from '../src/pago.js';
import { renderizarPago, renderizarSitio, tienePago } from '../src/render.js';
import { cabecerasSitio, CSP_CULQI, esArchivoPago, POLITICA_CONTENIDO, politicaContenido, resolverPedido } from '../src/servir.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('página /pago', () => {
  it('va en la versión con un plan con precio: pago/index.html y _checkout.js', () => {
    const inst = instantaneaDeEjemplo('produccion', { planes: true });
    expect(tienePago(inst)).toBe(true);
    const archivos = renderizarSitio(inst, op).map((a) => a.archivo);
    expect(archivos).toEqual(expect.arrayContaining(['pago/index.html', ARCHIVO_CHECKOUT]));
    expect(resolverPedido(`/${ARCHIVO_CHECKOUT}`)).toEqual({ tipo: 'script', archivo: ARCHIVO_CHECKOUT });
    expect(resolverPedido('/pago')).toEqual({ tipo: 'pagina', archivo: 'pago/index.html', ruta: '/pago' });
  });

  it('sin planes con precio (o sin planes) no hay /pago', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const soloMedida = { ...base, planes: armarPlanes(PLANES_DE_EJEMPLO.filter((p) => p.precioMes === null).map((p, i) => ({ ...p, id: `p${i}`, ficticio: false })) as never, null, 'produccion') };
    expect(tienePago(soloMedida)).toBe(false);
    expect(renderizarSitio(soloMedida, op).map((a) => a.archivo)).not.toContain('pago/index.html');
    expect(tienePago(instantaneaDeEjemplo('produccion'))).toBe(false);
  });

  it('sin indexar, con el checkout y sin popups ni chat; el contenedor reserva su alto y sin JavaScript lleva a agendar', () => {
    const html = renderizarPago(instantaneaDeEjemplo('produccion', { planes: true }), op, 'es');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(html).toContain(`<script src="/s/${ARCHIVO_CHECKOUT}" defer=""></script>`);
    expect(html).not.toMatch(/_popups\.js|_chat\.js|_visita\.js/);
    expect(html).toContain(`<h1 id="pago-titulo">${TEXTOS_PAGO.es.titulo}</h1>`);
    expect(html).toContain('data-checkout="" data-base="/s"');
    expect(html).toContain(CSS_PAGO);
    expect(html).toMatch(/<noscript><p>Para pagar en línea necesitas JavaScript[^<]*<\/p><p><a class="btn primary" href="\/s\/agendar-demo">Agendar una demo<\/a><\/p><\/noscript>/);
    expect(renderizarPago(instantaneaDeEjemplo('produccion', { planes: true }), op, 'en')).toContain('<html lang="en">');
  });

  it('el script no usa innerHTML ni eval y habla solo con la API del mismo origen (y, si se elige Culqi, carga su Checkout)', () => {
    expect(SCRIPT_CHECKOUT).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
    expect(SCRIPT_CHECKOUT).toContain('"/api/v1/publico/checkout"');
    expect(SCRIPT_CHECKOUT).toContain("credentials:'omit'");
    expect(SCRIPT_CHECKOUT.match(/https:\/\/[^"'\s)]+/g)).toEqual([SCRIPT_CULQI]);
    expect(() => new Function(SCRIPT_CHECKOUT)).not.toThrow();
  });

  it('HU-1704 · moneda, página alojada y regreso: los textos existen en los dos idiomas y el script los usa', () => {
    expect(Object.keys(TEXTOS_PAGO.en).sort()).toEqual(Object.keys(TEXTOS_PAGO.es).sort());
    for (const t of ['moneda:S.moneda', "q.get('checkout')", "q.get('cancelado')", "pg.tipo==='redireccion'", "pg.tipo==='formulario'", "/token'", 'precioMesUsd']) expect(SCRIPT_CHECKOUT).toContain(t);
    expect(TEXTOS_PAGO.es.redireccion).toContain('Tu tarjeta no pasa por Aptio SCORM');
  });

  it('HU-1712 · el DNI de la boleta: textos en los dos idiomas, el umbral de S/ 700 (US$ 200) y se envía solo sin RUC', () => {
    for (const l of ['es', 'en'] as const) for (const k of ['dni', 'dniAyuda', 'eDni', 'eDniFalta'] as const) expect(TEXTOS_PAGO[l][k]).toBeTruthy();
    expect(SCRIPT_CHECKOUT).toContain('UMBRAL_DNI={"PEN":700,"USD":200}');
    for (const t of ["campo('dni'", "'dni'", 'dni:rr?undefined:(nn||undefined)', "e.dni=T.eDni", 'S.err={dni:T.eDniFalta}']) expect(SCRIPT_CHECKOUT).toContain(t);
  });

  it('HU-1704 · la CSP de /pago suma solo los orígenes de Culqi Checkout; las demás páginas siguen igual', () => {
    expect(esArchivoPago('pago/index.html')).toBe(true);
    expect(esArchivoPago('en/pago/index.html')).toBe(true);
    expect(esArchivoPago('precios/index.html')).toBe(false);
    const csp = cabecerasSitio('pagina', 'x', { archivo: 'pago/index.html' })['Content-Security-Policy']!;
    expect(csp).toContain(`script-src 'self' ${CSP_CULQI.script.join(' ')};`);
    expect(csp).toContain(`frame-src ${CSP_CULQI.frame.join(' ')};`);
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(cabecerasSitio('pagina', 'x', { archivo: 'precios/index.html' })['Content-Security-Policy']).toBe(POLITICA_CONTENIDO);
    expect(politicaContenido({ version: 1, etiquetas: { ga4: 'G-AB12CD34EF' } }, { pago: true })).toMatch(/script-src 'self' [^;]*googletagmanager[^;]*checkout\.culqi\.com/);
  });
});
