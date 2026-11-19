// Tipografías del kit dentro del paquete: el SCORM y el HTML llevan los archivos WOFF2 de las dos familias del kit
// (títulos y textos, pesos 400 y 700, subconjunto latino que cubre el español y el inglés), su @font-face y la licencia
// SIL OFL 1.1 de cada familia. Nada se descarga de internet: sin el kit, van las del kit inicial. Una familia fuera
// del catálogo cerrado (`FUENTES_KIT`) no se empaqueta y el reproductor usa la del sistema (SUP-17).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { FUENTES_KIT, KIT_INICIAL } from '@aptio/schema/marca';
import type { KitReproductor } from '@aptio/player';

const requerir = createRequire(import.meta.url);
const PESOS = [400, 700] as const;

/** Carpeta de las fuentes dentro del paquete y la hoja de estilos que las declara. */
export const CARPETA_FUENTES = 'fuentes';
export const HOJA_FUENTES = `${CARPETA_FUENTES}/fuentes.css`;

export interface FuentesPaquete {
  /** Ruta dentro del paquete → bytes o texto. Vacío si ninguna familia del kit está en el catálogo. */
  archivos: Map<string, Uint8Array | string>;
  /** Familias empaquetadas, en orden (títulos y luego textos, sin repetir). */
  familias: string[];
  /** Familias del kit que no están en el catálogo: el reproductor usa la del sistema. */
  sinArchivo: string[];
}

const leer = (paquete: string, archivo: string) => readFileSync(requerir.resolve(`@fontsource/${paquete}/${archivo}`));

/** Los archivos de las tipografías del kit (o del kit inicial), listos para sumar al paquete. */
export function fuentesDelKit(kit?: Pick<KitReproductor, 'tipografias'> | null): FuentesPaquete {
  const pedidas = [kit?.tipografias?.titulos ?? KIT_INICIAL.tipografias.titulos, kit?.tipografias?.textos ?? KIT_INICIAL.tipografias.textos];
  const archivos = new Map<string, Uint8Array | string>();
  const familias: string[] = [];
  const sinArchivo: string[] = [];
  const reglas: string[] = [];
  for (const familia of pedidas) {
    if (familias.includes(familia) || sinArchivo.includes(familia)) continue;
    const f = FUENTES_KIT.find((x) => x.familia === familia);
    if (!f) { sinArchivo.push(familia); continue; }
    familias.push(familia);
    for (const peso of PESOS) {
      const ruta = `${CARPETA_FUENTES}/${f.id}-${peso}.woff2`;
      archivos.set(ruta, new Uint8Array(leer(f.id, `files/${f.id}-latin-${peso}-normal.woff2`)));
      reglas.push(`@font-face{font-family:${JSON.stringify(familia)};font-style:normal;font-weight:${peso};font-display:swap;src:url(${f.id}-${peso}.woff2) format("woff2")}`);
    }
    archivos.set(`${CARPETA_FUENTES}/${f.id}-LICENCIA.txt`, leer(f.id, 'LICENSE').toString('utf8'));
  }
  if (familias.length) archivos.set(HOJA_FUENTES, `/* Tipografías del kit (SIL Open Font License 1.1, ver los archivos *-LICENCIA.txt). */\n${reglas.join('\n')}\n`);
  return { archivos, familias, sinArchivo };
}

/** Bytes que suman las fuentes al paquete (para la estimación de peso). */
export function pesoFuentes(kit?: Pick<KitReproductor, 'tipografias'> | null): number {
  let total = 0;
  for (const d of fuentesDelKit(kit).archivos.values()) total += typeof d === 'string' ? Buffer.byteLength(d) : d.byteLength;
  return total;
}
