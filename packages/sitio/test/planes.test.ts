// HU-1702 · Bloques «Planes (resumen)» y «Planes y precios» (REQ-082, CP-141, CP-142): HTML estático desde la versión
// publicada, sin scripts; precio al mes o «A medida», la línea anual con el ahorro, «Más elegido», la cápsula adicional
// y el botón a agendar con el plan. En producción nunca sale un plan ficticio. El recorrido con teclado lo hace Playwright.
import { describe, expect, it } from 'vitest';
import { AJUSTES_PLANES_POR_DEFECTO, PLANES_DE_EJEMPLO } from '@aptio/schema/planes';
import { armarPlanes, type Instantanea } from '@aptio/schema/sitio-versiones';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { CSS_PLANES } from '../src/planes.js';
import { renderizarPagina } from '../src/render.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };
const filas = (cambios: Record<string, Record<string, unknown>> = {}) =>
  PLANES_DE_EJEMPLO.map((p, i) => ({ ...p, id: `plan-${i}`, ficticio: false, ...cambios[p.slug] }));
const conPlanes = (inst: Instantanea, planes = filas(), ajustes = AJUSTES_PLANES_POR_DEFECTO, entorno: 'produccion' | 'pruebas' = 'produccion'): Instantanea =>
  ({ ...inst, planes: armarPlanes(planes as never, ajustes, entorno) });
const tarjetas = (html: string) => [...html.matchAll(/<article class="plan[^"]*"[\s\S]*?<\/article>/g)].map((m) => m[0]);

describe('bloque «Planes y precios»', () => {
  it('pinta los tres planes en orden, con precio al mes, la línea anual con ahorro, «Más elegido» y el botón a agendar', () => {
    const html = renderizarPagina(instantaneaDeEjemplo('produccion', { planes: true }), '/precios', 'es', op)!;
    expect(html).toContain('<section id="precios" class="bg-ice"');
    const [inicial, productora, empresa] = tarjetas(html);
    expect(tarjetas(html)).toHaveLength(3);
    expect(inicial).toContain('S/ 490');
    expect(inicial).toContain('al mes + IGV');
    expect(inicial).toContain('o S/ 4,704 al año (ahorras S/ 1,176)');
    expect(inicial).toContain('Cápsula adicional: S/ 89');
    expect(inicial).toContain('href="/s/agendar-demo?plan=inicial"');
    expect(productora).toMatch(/^<article class="plan star"/);
    expect(productora).toContain('<span class="badge5">Más elegido</span>');
    expect(productora).toContain('class="btn primary" href="/s/agendar-demo?plan=productora"');
    expect(empresa).toContain('<p class="price">A medida</p>');
    expect(empresa).not.toContain('al año');
    expect(empresa).not.toContain('Cápsula adicional');
    expect(empresa).toContain('>Hablar con ventas</a>');
    expect(html.indexOf('plan=inicial')).toBeLessThan(html.indexOf('plan=productora'));
    expect(html).toContain(CSS_PLANES);
    expect(html).not.toContain('<script src="/s/_planes');
  });

  it('el precio con IGV y sin la línea anual cuando los ajustes lo piden; las características ocultas no salen', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const inicial = PLANES_DE_EJEMPLO[0]!;
    const inst = conPlanes(base, filas({ inicial: { caracteristicas: inicial.caracteristicas.map((c, i) => ({ ...c, visible: i !== 1 })) } }), { mostrarAnual: false, descuentoAnual: 20, conIgv: true });
    const [t] = tarjetas(renderizarPagina(inst, '/precios', 'es', op)!);
    expect(t).toContain('S/ 578.20');
    expect(t).toContain('al mes con IGV');
    expect(t).not.toContain('al año');
    expect(t).toContain('<li>5 cápsulas al mes</li>');
    expect(t).not.toContain('<li>Español</li>');
  });

  it('un plan oculto no sale, y sin planes visibles no queda la sección (CP-142)', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const sinInicial = renderizarPagina(conPlanes(base, filas({ inicial: { visible: false } })), '/precios', 'es', op)!;
    expect(tarjetas(sinInicial)).toHaveLength(2);
    expect(sinInicial).not.toContain('plan=inicial');
    const ninguno = renderizarPagina(conPlanes(base, filas({ inicial: { visible: false }, productora: { visible: false }, empresa: { visible: false } })), '/precios', 'es', op)!;
    expect(ninguno).not.toContain('id="precios"');
  });

  it('en producción un plan ficticio no sale; en pruebas sale marcado', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const ficticia = filas({ empresa: { ficticio: true } });
    const prod = renderizarPagina(conPlanes(base, ficticia), '/precios', 'es', op)!;
    expect(prod).not.toContain('plan=empresa');
    // Segunda defensa: aunque la versión lo traiga marcado, el render de producción lo omite.
    const marcada = conPlanes(base, ficticia, AJUSTES_PLANES_POR_DEFECTO, 'pruebas');
    expect(renderizarPagina(marcada, '/precios', 'es', op)).not.toContain('plan=empresa');
    const pruebas = renderizarPagina(marcada, '/precios', 'es', { ...op, entorno: 'pruebas' })!;
    expect(pruebas).toMatch(/Empresa<span class="fic">ficticio<\/span>/);
  });

  it('«Planes (resumen)» enlaza a /precios y no muestra la cápsula adicional; la comparativa no sale', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const inicio = base.paginas.find((p) => p.ruta === '/' && p.idioma === 'es')!;
    const conBloques = { ...inicio, bloques: [...inicio.bloques, { ...inicio.bloques[0]!, tipo: 'planes' }, { ...inicio.bloques[0]!, tipo: 'comparativa' }] };
    const inst = { ...base, paginas: base.paginas.map((p) => (p === inicio ? conBloques : p)) } as Instantanea;
    const html = renderizarPagina(inst, '/', 'es', op)!;
    expect(html).toContain('<section id="planes"');
    expect(html).toContain('Planes para equipos de capacitación y productoras');
    expect(html).toContain('<a class="more" href="/s/precios">Ver los planes en detalle</a>');
    expect(html).not.toContain('Cápsula adicional');
    expect(html).not.toMatch(/comparativa|<table/);
  });

  it('en inglés usa sus textos y el mismo enlace por plan', () => {
    const base = instantaneaDeEjemplo('produccion', { planes: true });
    const es = base.paginas.find((p) => p.ruta === '/precios')!;
    const inst = { ...base, paginas: [...base.paginas, { ...es, idioma: 'en' }] } as Instantanea;
    const html = renderizarPagina(inst, '/precios', 'en', op)!;
    expect(html).toContain('Most popular');
    expect(html).toContain('per month + VAT');
    expect(html).toContain('>Custom</p>');
  });
});
