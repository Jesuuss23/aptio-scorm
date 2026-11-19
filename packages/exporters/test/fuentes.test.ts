// Tipografías del kit dentro del paquete: los WOFF2 de títulos y textos, su @font-face con rutas relativas y la
// licencia OFL de cada familia; sin kit van las del kit inicial y una familia fuera del catálogo no se empaqueta.
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { codigoReproductor, construirHtml, construirScorm12, fuentesDelKit, pesoFuentes, validarScorm12 } from '../src/index.ts';
import { cursoLoto, recursosLoto } from './loto.ts';

const WOFF2 = [0x77, 0x4f, 0x46, 0x32]; // «wOF2»
const KIT = { paleta: { primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' }, tipografias: { titulos: 'Montserrat', textos: 'Open Sans' }, personaje: null };

let reproductor: string;
beforeAll(async () => { reproductor = await codigoReproductor(); }, 60_000);

describe('tipografías del kit en el paquete', () => {
  it('el SCORM lleva las dos familias del kit en 400 y 700, su hoja de estilos enlazada y la licencia OFL', async () => {
    const paquete = await construirScorm12({ curso: cursoLoto(), recursos: recursosLoto(), reproductor, kit: KIT });
    const zip = await JSZip.loadAsync(paquete.zip);
    const fuentes = paquete.archivos.filter((r) => r.startsWith('fuentes/'));
    expect(fuentes.sort()).toEqual([
      'fuentes/fuentes.css', 'fuentes/montserrat-400.woff2', 'fuentes/montserrat-700.woff2', 'fuentes/montserrat-LICENCIA.txt',
      'fuentes/open-sans-400.woff2', 'fuentes/open-sans-700.woff2', 'fuentes/open-sans-LICENCIA.txt',
    ]);
    const woff = await zip.file('fuentes/montserrat-700.woff2')!.async('uint8array');
    expect([...woff.slice(0, 4)]).toEqual(WOFF2);
    const css = await zip.file('fuentes/fuentes.css')!.async('string');
    expect(css).toContain('font-family:"Montserrat";font-style:normal;font-weight:700;font-display:swap;src:url(montserrat-700.woff2) format("woff2")');
    expect(css).toContain('font-family:"Open Sans"');
    expect(css).not.toMatch(/https?:|\/\//);
    expect(await zip.file('fuentes/open-sans-LICENCIA.txt')!.async('string')).toMatch(/SIL OPEN FONT LICENSE/i);
    const index = await zip.file('index.html')!.async('string');
    expect(index).toContain('<link rel="stylesheet" href="fuentes/fuentes.css">');
    // El manifiesto lista también las fuentes.
    const manifiesto = await zip.file('imsmanifest.xml')!.async('string');
    for (const f of fuentes) expect(manifiesto).toContain(`href="${f}"`);
  });

  it('sin kit lleva las del kit inicial y el HTML autocontenido también las lleva', async () => {
    const paquete = await construirHtml({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
    expect(paquete.archivos.filter((r) => r.endsWith('.woff2')).sort()).toEqual([
      'fuentes/atkinson-hyperlegible-400.woff2', 'fuentes/atkinson-hyperlegible-700.woff2', 'fuentes/barlow-condensed-400.woff2', 'fuentes/barlow-condensed-700.woff2',
    ]);
  });

  it('una familia repetida va una vez y una fuera del catálogo no se empaqueta', () => {
    const misma = fuentesDelKit({ tipografias: { titulos: 'Plus Jakarta Sans', textos: 'Plus Jakarta Sans' } });
    expect(misma.familias).toEqual(['Plus Jakarta Sans']);
    expect([...misma.archivos.keys()].filter((r) => r.endsWith('.woff2'))).toHaveLength(2);
    const propia = fuentesDelKit({ tipografias: { titulos: 'Fuente Propia del Cliente', textos: 'Lato' } });
    expect(propia).toMatchObject({ familias: ['Lato'], sinArchivo: ['Fuente Propia del Cliente'] });
    const ninguna = fuentesDelKit({ tipografias: { titulos: 'Otra', textos: 'Otra' } });
    expect(ninguna.archivos.size).toBe(0);
  });

  it('el peso estimado suma las fuentes', () => {
    const sin = validarScorm12(cursoLoto(), [], 0, 100, { kit: { tipografias: { titulos: 'Otra', textos: 'Otra' } } });
    const con = validarScorm12(cursoLoto(), [], 0, 100, { kit: KIT });
    expect(pesoFuentes(KIT)).toBeGreaterThan(50_000);
    expect(con.pesoEstimadoBytes - sin.pesoEstimadoBytes).toBe(pesoFuentes(KIT) - pesoFuentes({ tipografias: { titulos: 'Otra', textos: 'Otra' } }));
  });
});
