// Recursos de prueba del caso LOTO para armar el paquete: el SVG real de la plantilla de Ana, los WebVTT del caso y
// archivos ficticios (pocos bytes) para audio, imagen y video. Lo usan Vitest y el flujo de Playwright (CP-091).
import { readFileSync } from 'node:fs';
import type { CursoReproductor } from '@aptio/player';
import type { RecursoPaquete } from '../src/scorm12.ts';

const raiz = new URL('../../../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz));

export const cursoLoto = (): CursoReproductor => JSON.parse(leer('packages/ai/casos/loto/curso-esperado-es.json').toString('utf8')) as CursoReproductor;

const SVG = (texto: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><title>${texto}</title><rect width="100" height="60" fill="#e8eef9"/></svg>`;

/** Recursos de LOTO por id. `sinAudio` deja fuera los audios (sin audio la narración no bloquea Siguiente, SUP-32). */
export function recursosLoto(opciones: { sinAudio?: boolean } = {}): RecursoPaquete[] {
  const ana = leer('docs/diseno/personaje/plantilla-ana.svg');
  const vtt = leer('packages/ai/casos/loto/salidas/08-subtitulos-p03-es.vtt').toString('utf8');
  type R = CursoReproductor['recursos'][number];
  return cursoLoto().recursos.flatMap((r: R): RecursoPaquete[] => {
    if (r.id === 'svg-ana') return [{ id: r.id, nombre: r.nombre, datos: new Uint8Array(ana) }];
    switch (r.tipo) {
      case 'svg': return [{ id: r.id, nombre: r.nombre, datos: SVG(r.id) }];
      case 'subtitulos': return [{ id: r.id, nombre: r.nombre, datos: vtt }];
      case 'audio': return opciones.sinAudio ? [] : [{ id: r.id, nombre: r.nombre, datos: new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]) }];
      case 'imagen': return [{ id: r.id, nombre: r.nombre, datos: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }];
      case 'video': return [{ id: r.id, nombre: r.nombre, datos: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) }];
      default: return [{ id: r.id, nombre: r.nombre, datos: 'material del cliente: no debe ir en el paquete' }];
    }
  });
}
