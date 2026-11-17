// HU-1703 · La página /pago (REQ-083, CP-143, RN-17-3): estática y sin indexar, con el checkout diferido y sin popups ni
// chat; sin JavaScript lleva a agendar una demo. Solo existe si la versión publica un plan con precio. El recorrido con
// teclado y axe lo hace Playwright.
import { describe, expect, it } from 'vitest';
import { PLANES_DE_EJEMPLO } from '@aptio/schema/planes';
import { armarPlanes } from '@aptio/schema/sitio-versiones';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { ARCHIVO_CHECKOUT, CSS_PAGO, SCRIPT_CHECKOUT, TEXTOS_PAGO } from '../src/pago.js';
import { renderizarPago, renderizarSitio, tienePago } from '../src/render.js';
import { resolverPedido } from '../src/servir.js';

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

  it('el script no usa innerHTML ni eval y habla solo con la API del mismo origen', () => {
    expect(SCRIPT_CHECKOUT).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
    expect(SCRIPT_CHECKOUT).toContain('"/api/v1/publico/checkout"');
    expect(SCRIPT_CHECKOUT).toContain("credentials:'omit'");
    expect(() => new Function(SCRIPT_CHECKOUT)).not.toThrow();
  });
});
