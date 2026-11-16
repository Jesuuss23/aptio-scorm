// HU-1603 · El script de popups del sitio (REQ-076, RN-17-3): va en toda versión y en todas las páginas, es del mismo
// origen y no usa cookies, HTML ni sitios de afuera. Su comportamiento (CP-131, CP-132) lo recorre Playwright.
import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { ARCHIVO_POPUPS, CLAVE_POPUPS, CSS_POPUPS, RUTA_LEADS_API, SCRIPT_POPUPS } from '../src/popups.js';
import { renderizar404, renderizarPagina, renderizarSitio } from '../src/render.js';
import { resolverPedido } from '../src/servir.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('script de popups', () => {
  it('va en toda versión y en cada página (también en inglés), pero no en la 404', () => {
    const inst = instantaneaDeEjemplo();
    expect(renderizarSitio(inst, op).find((a) => a.archivo === ARCHIVO_POPUPS)).toEqual({ archivo: '_popups.js', contenido: SCRIPT_POPUPS, mime: 'text/javascript; charset=utf-8' });
    expect(renderizarPagina(inst, '/', 'en', op)).toContain('<script src="/s/_popups.js" defer="" data-base="/s"></script>');
    expect(renderizarPagina(inst, '/', 'es', { ...op, base: '' })).toContain('<script src="/_popups.js" defer="" data-base=""></script>');
    expect(renderizar404(inst, op)).not.toContain('_popups.js');
    expect(resolverPedido('/_popups.js')).toEqual({ tipo: 'script', archivo: '_popups.js' });
  });

  it('es JavaScript válido, sin cookies, sin HTML y sin llamadas a otros sitios', () => {
    expect(() => new Function(SCRIPT_POPUPS)).not.toThrow();
    expect(SCRIPT_POPUPS).not.toMatch(/document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|eval\(|https?:\/\//);
    expect(SCRIPT_POPUPS).toContain('textContent');
    expect(SCRIPT_POPUPS).toContain(JSON.stringify(CLAVE_POPUPS));
    expect(SCRIPT_POPUPS).toContain(JSON.stringify(RUTA_LEADS_API));
    // RN-17-3 · 7 días como mínimo y nunca en el pago; el modal es un diálogo que atrapa el foco.
    expect(SCRIPT_POPUPS).toContain('MIN=7');
    expect(SCRIPT_POPUPS).toContain('"/pago"');
    expect(SCRIPT_POPUPS).toContain("setAttribute('aria-modal','true')");
    expect(SCRIPT_POPUPS).toContain("matchMedia('(pointer: coarse)')");
    // Incluye los estilos y los textos en los dos idiomas; comprimido pesa unos 4 KB.
    expect(SCRIPT_POPUPS.length).toBeLessThan(12_000);
  });

  it('el deslizable y la barra son fijos (no mueven la página) y la animación respeta reducir movimiento', () => {
    expect(CSS_POPUPS).toMatch(/\.pp-slide\{position:fixed/);
    expect(CSS_POPUPS).toMatch(/\.pp-barra\{position:fixed/);
    expect(CSS_POPUPS).toContain('@media (prefers-reduced-motion:no-preference)');
  });
});
