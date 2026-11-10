import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanearSvg, SvgNoValido } from '../src/index.js';

const plantilla = readFileSync(new URL('../../../docs/diseno/personaje/plantilla-ana.svg', import.meta.url), 'utf8');

describe('saneado de SVG (CP-024)', () => {
  it('quita <script> y los atributos on*', () => {
    const r = sanearSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40" onload="alert(1)"><script>alert(2)</script>' +
        '<g id="boca_X" onclick="robar()"><path d="M0 0h1" fill="#000"/></g></svg>',
    );
    expect(r.svg).not.toMatch(/script|alert|onload|onclick|robar/);
    expect(r.svg).toContain('id="boca_X"');
    expect(r.eliminados).toEqual(expect.arrayContaining(['script', 'atributos on*']));
    expect(r.ids).toEqual(['boca_X']);
    expect(r.viewBox).toBe('0 0 30 40');
  });

  it('quita enlaces javascript:, recursos externos, foreignObject e imágenes', () => {
    const r = sanearSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <a href="javascript:alert(1)"><rect width="1" height="1"/></a>
      <use xlink:href="https://malo.test/x.svg#a"/><use href="#bien"/>
      <image href="data:image/png;base64,AAAA"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <style>@import url(https://malo.test/a.css);</style>
      <rect id="bien" style="fill:url(https://malo.test/p)" fill="url(#grad)"/>
      <animate attributeName="href" to="javascript:alert(1)"/>
    </svg>`);
    expect(r.svg).not.toMatch(/javascript|malo\.test|foreignObject|<image|<a[\s>]|animate|@import/);
    expect(r.svg).toContain('href="#bien"');
    expect(r.svg).toContain('fill="url(#grad)"');
    expect(r.eliminados).toEqual(expect.arrayContaining(['a', 'image', 'foreignObject', 'animate', 'estilo con recursos externos', 'atributo style']));
  });

  it('no expande entidades declaradas en un DOCTYPE', () => {
    const r = sanearSvg('<!DOCTYPE svg [<!ENTITY x "XXXXXXXX">]><svg xmlns="http://www.w3.org/2000/svg"><title>&amp;</title></svg>');
    expect(r.eliminados).toContain('declaración DOCTYPE');
    expect(r.svg).not.toContain('XXXXXXXX');
  });

  it('rechaza lo que no es SVG', () => {
    expect(() => sanearSvg('<html><body/></html>')).toThrow(SvgNoValido);
    expect(() => sanearSvg('no es xml')).toThrow(SvgNoValido);
  });

  it('deja intacta la plantilla de Ana: capas, bocas y colores del kit', () => {
    const r = sanearSvg(plantilla);
    expect(r.eliminados).toEqual([]);
    expect(r.ids).toEqual(expect.arrayContaining(['personaje', 'cabeza', 'bocas', 'boca_A', 'boca_G', 'boca_X', 'pose_neutral']));
    expect(r.svg).toContain('#0000FE');
    expect(r.svg).toContain('display="none"');
  });
});
