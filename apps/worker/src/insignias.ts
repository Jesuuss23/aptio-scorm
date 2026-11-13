// HU-1205 · SVG → PNG de las insignias del kit de gamificación con @resvg/resvg-js (sin navegador). Usa las fuentes del
// sistema: si la tipografía del kit no está instalada en el worker, la insignia sale con la de respaldo (SUP-163).
import { Resvg } from '@resvg/resvg-js';

export function pngDesdeSvg(svg: string, lado: number): Uint8Array {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: lado }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } });
  return new Uint8Array(r.render().asPng());
}
