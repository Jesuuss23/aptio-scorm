// HU-1514 · Landings por sector en el HTML: portada propia, meta título, testimonios del sector (CP-157), preguntas de
// la landing y del inicio, y el bloque «Sectores» y la columna del pie solo con las publicadas (CP-158).
import { describe, expect, it } from 'vitest';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { landingsDe, renderizarPagina, renderizarSitio } from '../src/render.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
const testimonios = (html: string) => [...html.matchAll(/<figcaption><b>([^<]+)/g)].map((m) => m[1]);

describe('landings por sector (HU-1514)', () => {
  it('la landing usa su portada, su meta título y el sector como etiqueta', () => {
    const html = renderizarPagina(instantaneaDeEjemplo(), '/sectores/mineria-y-energia', 'es', op)!;
    expect(html).toContain('<title>Capacitación en minería y energía con cápsulas SCORM</title>');
    expect(html).toContain('<h1>Cápsulas de seguridad para operaciones mineras y de energía</h1>');
    expect(html).toContain('<span class="tagp">Minería y energía</span>');
    expect(html).toContain('<meta name="description" content="Bloqueo y etiquetado, trabajos en altura');
    expect(html).toContain('<link rel="canonical" href="https://aptioscorm.com/sectores/mineria-y-energia"/>');
  });

  it('CP-157: muestra solo los testimonios de su sector; sin testimonios del sector, todos los visibles', () => {
    const mineria = renderizarPagina(instantaneaDeEjemplo(), '/sectores/mineria-y-energia', 'es', op)!;
    expect(testimonios(mineria)).toEqual(['Mariana Paredes', 'Jorge Huamán']);
    const retail = renderizarPagina(instantaneaDeEjemplo(), '/sectores/retail-y-consumo', 'es', op)!;
    expect(testimonios(retail)).toEqual(['Mariana Paredes', 'Jorge Huamán', 'Carlos Alarcón']);
  });

  it('las preguntas de la landing suman las suyas a las generales y del inicio; otra landing no las ve', () => {
    const mineria = renderizarPagina(instantaneaDeEjemplo(), '/sectores/mineria-y-energia', 'es', op)!;
    expect(mineria).toContain('¿Funciona con mi LMS?');
    expect(mineria).toContain('¿Sirve para procedimientos de seguridad?');
    expect(renderizarPagina(instantaneaDeEjemplo(), '/sectores/banca-y-seguros', 'es', op)).not.toContain('¿Sirve para procedimientos de seguridad?');
  });

  it('CP-158: el bloque Sectores y la columna del pie listan solo las publicadas; el borrador da 404', () => {
    const inst = instantaneaDeEjemplo();
    expect(landingsDe(inst, 'es').map((l) => l.nombre)).toEqual(['Banca y seguros', 'Educación superior', 'Minería y energía', 'Retail y consumo']);
    const inicio = renderizarPagina(inst, '/', 'es', op)!;
    expect(inicio).toContain('<h2 id="b-7">Pensado para cómo capacita tu sector</h2>');
    expect(inicio).toContain('<a class="fcard sector" href="/s/sectores/banca-y-seguros"><h3>Banca y seguros</h3><p>Cumplimiento normativo en cápsulas que sí se terminan</p>');
    expect(inicio).toContain('<h2>Sectores</h2><ul><li><a href="/s/sectores/banca-y-seguros">Banca y seguros</a>');
    expect(inicio).not.toContain('Sector público');
    expect(renderizarPagina(inst, '/sectores/sector-publico', 'es', op)).toBeNull();
    expect(renderizarSitio(inst, op).some((a) => a.archivo.startsWith('sectores/sector-publico'))).toBe(false);
  });

  it('sin landings publicadas no salen el bloque ni la columna', () => {
    const inst = instantaneaDeEjemplo();
    const sinLandings = { ...inst, paginas: inst.paginas.filter((p) => !p.sector) };
    const inicio = renderizarPagina(sinLandings, '/', 'es', op)!;
    expect(inicio).not.toContain('Pensado para cómo capacita tu sector');
    expect(inicio).not.toContain('<h2>Sectores</h2>');
  });
});
