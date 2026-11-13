// HU-0206 · Evidencias para proponer el kit (CP-028), sin IA y sin ejecutar nada del cliente.
// ZIP de un curso anterior: se leen solo los archivos de texto (.css, .html, .js, .json) con topes de entradas, de bytes
// descomprimidos por archivo y en total, y se ignoran las rutas con `..` o absolutas (path traversal). PDF de un manual
// de marca: los nombres de las tipografías (operador setFont) y los colores de relleno más usados.
import {
  type Conteo, coloresEnTexto, entradaLeible, type EvidenciasKit, familiaDePdf, fuentesEnTexto, hexDeRgb, LIMITES_ZIP,
  MAX_COLORES, MAX_FUENTES, masFrecuentes, sumarConteos,
} from '@aptio/schema/extraccion-kit';
import type { Readable } from 'node:stream';
import JSZip from 'jszip';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** El material no sirve para proponer un kit (formato, archivo trampa o sin colores): la API lo muestra tal cual. */
export class MaterialKitNoValido extends Error {
  constructor(public readonly codigo: 'FORMATO_NO_VALIDO' | 'ZIP_NO_VALIDO' | 'SIN_COLORES', mensaje: string) {
    super(mensaje);
  }
}

type Limites = typeof LIMITES_ZIP;

/** JSZip guarda el tamaño declarado en el índice; se usa para saltar antes de descomprimir. No es confiable: se mide al leer. */
/** JSZip limpia `../` del nombre al leer; el nombre original dice si la entrada intentaba salir de la carpeta. */
const leible = (f: JSZip.JSZipObject) => !f.dir && entradaLeible(f.name) && entradaLeible((f as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? f.name);

const tamanoDeclarado = (f: JSZip.JSZipObject) => (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;

/** Lee como mucho `tope` bytes descomprimidos de la entrada; corta el flujo si se pasa (ZIP bomb). */
function leerConTope(f: JSZip.JSZipObject, tope: number): Promise<{ texto: string; cortado: boolean }> {
  return new Promise((resolver, rechazar) => {
    const partes: Buffer[] = [];
    let total = 0;
    let listo = false;
    const flujo = f.nodeStream('nodebuffer') as Readable;
    const terminar = (cortado: boolean) => {
      if (listo) return;
      listo = true;
      resolver({ texto: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(partes)), cortado });
    };
    flujo.on('data', (trozo: Buffer) => {
      if (listo) return;
      const cabe = tope - total;
      if (trozo.length > cabe) {
        partes.push(trozo.subarray(0, Math.max(cabe, 0)));
        total = tope;
        // Se deja de descomprimir: el resto del archivo nunca se expande en memoria.
        flujo.pause();
        flujo.destroy();
        terminar(true);
        return;
      }
      partes.push(trozo);
      total += trozo.length;
    });
    flujo.on('error', (e: Error) => (listo ? undefined : rechazar(e)));
    flujo.on('end', () => terminar(false));
  });
}

export async function evidenciasDeZip(bytes: Uint8Array, limites: Limites = LIMITES_ZIP): Promise<EvidenciasKit> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch {
    throw new MaterialKitNoValido('ZIP_NO_VALIDO', 'El archivo no es un ZIP que se pueda leer');
  }
  const entradas = Object.values(zip.files);
  if (entradas.length > limites.entradas) {
    throw new MaterialKitNoValido('ZIP_NO_VALIDO', `El ZIP tiene ${entradas.length} entradas; se leen como mucho ${limites.entradas}`);
  }
  const colores: Conteo = new Map();
  const fuentes: Conteo = new Map();
  const avisos: string[] = [];
  let leidos = 0;
  let total = 0;
  // CSS primero: es donde está la marca; luego HTML, JS y JSON.
  const orden = (n: string) => (n.toLowerCase().endsWith('.css') ? 0 : n.toLowerCase().endsWith('.json') ? 2 : 1);
  const leibles = entradas.filter(leible).sort((a, b) => orden(a.name) - orden(b.name) || a.name.localeCompare(b.name));
  const ignoradas = entradas.filter((e) => !e.dir && !leible(e)).length;
  for (const e of leibles) {
    if (leidos >= limites.archivos) {
      avisos.push(`Se leyeron ${limites.archivos} archivos de texto; el resto se ignoró`);
      break;
    }
    const resta = limites.bytesTotal - total;
    if (resta <= 0) {
      avisos.push(`Se alcanzó el tope de ${limites.bytesTotal / 1024 / 1024} MB descomprimidos; el resto se ignoró`);
      break;
    }
    const tope = Math.min(limites.bytesArchivo, resta);
    if (tamanoDeclarado(e) > limites.bytesArchivo) {
      avisos.push(`${e.name} supera ${limites.bytesArchivo / 1024 / 1024} MB y se leyó solo el comienzo`);
    }
    let leido;
    try {
      leido = await leerConTope(e, tope);
    } catch {
      avisos.push(`${e.name} no se pudo descomprimir`);
      continue;
    }
    if (leido.cortado && tamanoDeclarado(e) <= limites.bytesArchivo) avisos.push(`${e.name} es más grande de lo que declara el ZIP y se leyó solo el comienzo`);
    total += Buffer.byteLength(leido.texto);
    leidos += 1;
    sumarConteos(colores, coloresEnTexto(leido.texto));
    sumarConteos(fuentes, fuentesEnTexto(leido.texto));
  }
  if (ignoradas) avisos.push(`${ignoradas} archivos que no son de texto (imágenes, fuentes, rutas no seguras) no se abrieron`);
  return { origen: 'zip', leidos, colores: masFrecuentes(colores, MAX_COLORES), fuentes: masFrecuentes(fuentes, MAX_FUENTES), avisos };
}

/** Páginas de un manual que se revisan como mucho: la marca está en las primeras. */
export const MAX_PAGINAS_PDF = 40;

const hexDeArgs = (a: unknown[]): string | null => {
  if (typeof a[0] === 'string' && /^#[0-9a-f]{6}$/i.test(a[0])) return a[0].toUpperCase();
  if (a.length >= 3 && a.slice(0, 3).every((n) => typeof n === 'number')) {
    const [r, g, b] = a as number[];
    return r! > 1 || g! > 1 || b! > 1 ? hexDeRgb(r! / 255, g! / 255, b! / 255) : hexDeRgb(r!, g!, b!);
  }
  return null;
};

export async function evidenciasDePdf(bytes: Uint8Array): Promise<EvidenciasKit> {
  let doc;
  try {
    doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch {
    throw new MaterialKitNoValido('FORMATO_NO_VALIDO', 'El PDF no se puede leer');
  }
  const colores: Conteo = new Map();
  const fuentes: Conteo = new Map();
  const avisos: string[] = [];
  try {
    const paginas = Math.min(doc.numPages, MAX_PAGINAS_PDF);
    if (doc.numPages > paginas) avisos.push(`Se revisaron las primeras ${paginas} páginas de ${doc.numPages}`);
    for (let n = 1; n <= paginas; n++) {
      const pagina = await doc.getPage(n);
      const ops = await pagina.getOperatorList();
      const vistas = new Map<string, string>();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = (ops.argsArray[i] ?? []) as unknown[];
        if (fn === OPS.setFillRGBColor) {
          const hex = hexDeArgs(args);
          if (hex) colores.set(hex, (colores.get(hex) ?? 0) + 1);
        } else if (fn === OPS.setFont && typeof args[0] === 'string') {
          const ref = args[0];
          if (!vistas.has(ref)) {
            let nombre = '';
            try {
              const f = pagina.commonObjs.get(ref) as { name?: string } | null;
              nombre = familiaDePdf(f?.name ?? '');
            } catch {
              nombre = '';
            }
            vistas.set(ref, nombre);
          }
          const familia = vistas.get(ref);
          if (familia) fuentes.set(familia, (fuentes.get(familia) ?? 0) + 1);
        }
      }
      pagina.cleanup();
    }
    return { origen: 'pdf', leidos: paginas, colores: masFrecuentes(colores, MAX_COLORES), fuentes: masFrecuentes(fuentes, MAX_FUENTES), avisos };
  } finally {
    await doc.destroy();
  }
}

/** Evidencias según el tipo real del recurso. Sin colores no hay paleta que proponer. */
export async function evidenciasDeMaterial(bytes: Uint8Array, mime: string): Promise<EvidenciasKit> {
  const e = mime === 'application/zip' ? await evidenciasDeZip(bytes) : mime === 'application/pdf' ? await evidenciasDePdf(bytes) : null;
  if (!e) throw new MaterialKitNoValido('FORMATO_NO_VALIDO', 'El kit se extrae de un ZIP de un curso anterior o de un PDF del manual de marca');
  if (!e.colores.length) {
    throw new MaterialKitNoValido('SIN_COLORES', e.origen === 'zip'
      ? 'No se encontraron colores en los estilos del curso: sube el ZIP completo del paquete o el manual de marca en PDF'
      : 'No se encontraron colores en el PDF: puede ser un documento escaneado; sube el manual de marca original o un ZIP de un curso anterior');
  }
  return e;
}
