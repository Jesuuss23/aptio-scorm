import { describe, expect, it } from 'vitest';
import {
  avisosTipografia, coloresEnTexto, entradaLeible, erroresContraste, familiaDePdf, fuenteParecida, fuentesEnTexto,
  masFrecuentes, prepararPropuestaKit, type PropuestaKit,
} from '../src/extraccion-kit.js';
import { FAMILIAS_KIT } from '../src/marca.js';

describe('extracción del kit (HU-0206)', () => {
  it('lee colores hex de 3 y 6 cifras y rgb(), y no confunde una entidad HTML con un color', () => {
    const c = coloresEnTexto('h1{color:#0f2a44} .b{background:#0F2A44;border:1px solid #fff} p{color:rgb(31, 122, 92)} <p>&#123;</p> .x{color:rgba(16,32,51,.5)}');
    expect(Object.fromEntries(c)).toEqual({ '#0F2A44': 2, '#FFFFFF': 1, '#1F7A5C': 1, '#102033': 1 });
    expect(masFrecuentes(c, 2).map((f) => f.valor)).toEqual(['#0F2A44', '#102033']);
  });

  it('lee font-family, @font-face y fontFamily, sin genéricas ni variables', () => {
    const css = `@font-face{font-family:"Archivo";src:url(a.woff2)} h1{font-family:'Archivo', Arial, sans-serif !important}
      body{font-family: var(--fuente), "Source Sans 3", serif} const t = { "fontFamily": "Inter, system-ui" }`;
    expect(Object.fromEntries(fuentesEnTexto(css))).toEqual({ Archivo: 2, Arial: 1, 'Source Sans 3': 1, Inter: 1 });
  });

  it('limpia el nombre de una fuente de PDF', () => {
    expect(familiaDePdf('ABCDEF+SourceSans3-Bold')).toBe('Source Sans 3');
    expect(familiaDePdf('Archivo-Black')).toBe('Archivo');
    expect(familiaDePdf('ArialMT')).toBe('Arial');
    expect(familiaDePdf('BCDEEE+OpenSans,Italic')).toBe('Open Sans');
  });

  it('solo deja leer entradas de texto con ruta segura (sin path traversal)', () => {
    expect(entradaLeible('scormcontent/estilos/marca.css')).toBe(true);
    expect(entradaLeible('index.HTML')).toBe(true);
    for (const n of ['../../etc/passwd.css', '/abs/a.css', 'C:/a.css', 'a\\..\\..\\b.js', 'img/logo.png', 'fuentes/a.woff2', 'carpeta/', '__MACOSX/a.css', 'sin-extension']) {
      expect({ n, leible: entradaLeible(n) }).toEqual({ n, leible: false });
    }
  });

  it('lleva cada tipografía a la más parecida de la lista cerrada del kit', () => {
    expect(fuenteParecida('Source Sans 3', 'textos')).toBe('Source Sans 3');
    expect(fuenteParecida('source sans3', 'titulos')).toBe('Source Sans 3');
    expect(fuenteParecida('Archivo', 'titulos')).toBe('Montserrat');
    expect(fuenteParecida('Helvetica Neue', 'textos')).toBe('Open Sans');
    expect(fuenteParecida('Georgia', 'titulos')).toBe('Merriweather');
    expect(fuenteParecida('DIN Condensed', 'titulos')).toBe('Barlow Condensed');
    expect(fuenteParecida('Fuente Rara Corporativa', 'textos')).toBe('Source Sans 3');
    for (const f of ['Archivo', 'Futura', 'Calibri', 'Times New Roman', 'Gotham Rounded', 'Avenir Book', 'Desconocida']) {
      for (const uso of ['titulos', 'textos'] as const) expect(FAMILIAS_KIT).toContain(fuenteParecida(f, uso));
    }
  });

  it('revisa el contraste WCAG de texto/fondo y blanco/primario', () => {
    expect(erroresContraste({ primario: '#0F2A44', secundario: '#1F7A5C', acento: '#F2A900', texto: '#102033', fondo: '#F5F7FA' })).toEqual([]);
    const e = erroresContraste({ primario: '#F2A900', secundario: '#1F7A5C', acento: '#F2A900', texto: '#999999', fondo: '#FFFFFF' });
    expect(e).toHaveLength(2);
    expect(e[0]).toMatch(/texto \(#999999\) sobre el fondo \(#FFFFFF\) tiene contraste 2,85:1/);
    expect(e[1]).toMatch(/blanco sobre el primario \(#F2A900\)/);
  });

  it('calcula contrasteOk en el backend y avisa cuando la tipografía de marca no es libre', () => {
    const p = prepararPropuestaKit({ paleta: { primario: '#0f2a44', secundario: '#1f7a5c', acento: '#f2a900', texto: '#102033', fondo: '#f5f7fa' }, contrasteOk: false }) as PropuestaKit;
    expect(p.contrasteOk).toBe(true);
    expect(p.paleta.primario).toBe('#0F2A44');
    expect(avisosTipografia({ tipografiaMarca: { titulos: 'Archivo', texto: 'Source Sans 3' }, tipografias: { titulos: 'Montserrat', texto: 'Source Sans 3' } }))
      .toEqual(['La marca usa Archivo en títulos; se propone Montserrat (libre)']);
  });
});
