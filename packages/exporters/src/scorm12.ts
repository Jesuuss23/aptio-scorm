// HU-1202 · Paquete SCORM 1.2 de un solo SCO: imsmanifest.xml, index.html, el reproductor único empaquetado, los datos del
// curso y sus recursos en `recursos/`. Todas las rutas son relativas y nada se descarga de internet. El ZIP es
// determinista: con la misma entrada sale el mismo archivo, byte a byte (orden fijo, fecha fija, compresión fija).
// Exporta un solo idioma, el primero del curso salvo que se pida otro (SUP-49). HU-0804: con `modoIdioma: 'mismo-paquete'`
// lleva español e inglés, con los recursos de los dos idiomas, y abre en español.
import { cursoBilingue, IDIOMAS_BILINGUE, type ModoIdioma } from './bilingue.ts';
import type { Creditos, CursoReproductor, Idioma, KitReproductor } from '@aptio/player';
import JSZip from 'jszip';
import { escaparXml, manifiestoScorm12 } from './manifiesto.ts';

export interface RecursoPaquete {
  /** Id del recurso en el curso (`curso.recursos[].id`). */
  id: string;
  /** Nombre del archivo original; de aquí sale la extensión. */
  nombre: string;
  datos: Uint8Array | string;
}

export interface EntradaScorm12 {
  curso: CursoReproductor;
  /** Idioma del paquete; por defecto el primero del curso (SUP-49). */
  idioma?: Idioma;
  kit?: KitReproductor;
  /** Los archivos de los recursos del curso. Los que falten se informan y el reproductor dibuja su marco con el texto alternativo. */
  recursos: RecursoPaquete[];
  /** El reproductor empaquetado (`aptio-reproductor.js`), ver `codigoReproductor`. */
  reproductor: string;
  /** HU-1204 · Modo diagnóstico en el paquete (Ctrl+Alt+Shift+D o ?diagnostico=1). Por defecto, true. */
  incluirDiagnostico?: boolean;
  /** HU-1406 · Créditos de IA (`armarCreditos`); null o ausentes: el paquete no muestra «Créditos». */
  creditos?: Creditos | null;
  /** HU-0804 · 'mismo-paquete': español e inglés con el botón de idioma. Por defecto, 'unico'. */
  modoIdioma?: ModoIdioma;
}

export interface PaqueteScorm12 {
  zip: Uint8Array;
  /** Rutas de todos los archivos del ZIP, en orden. */
  archivos: string[];
  /** Ids de recursos del curso (del idioma exportado) que no vinieron en `recursos`. */
  faltantes: string[];
  idioma: Idioma;
  /** HU-0804 · Idiomas que lleva el paquete. */
  idiomas: Idioma[];
}

/** Fecha fija de todas las entradas del ZIP, para que el archivo sea determinista. */
export const FECHA_ZIP = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));

type RecursoCurso = CursoReproductor['recursos'][number] & { idioma?: string; mime?: string };

const extension = (nombre: string): string => /\.[A-Za-z0-9]{1,5}$/.exec(nombre)?.[0].toLowerCase() ?? '';
const seguro = (id: string): string => id.replace(/[^A-Za-z0-9._-]/g, '_');
const comoTexto = (datos: Uint8Array | string): string => (typeof datos === 'string' ? datos : new TextDecoder().decode(datos));
const esSvg = (r: RecursoCurso, nombre: string) => r.tipo === 'svg' || r.mime === 'image/svg+xml' || extension(nombre) === '.svg';
const esVtt = (r: RecursoCurso, nombre: string) => r.tipo === 'subtitulos' || r.mime === 'text/vtt' || extension(nombre) === '.vtt';

const textoDe = (t: Partial<Record<string, string>> | undefined, idioma: string): string => t?.[idioma] ?? Object.values(t ?? {}).find(Boolean) ?? '';

export function indexHtml(titulo: string, idioma: string): string {
  return `<!doctype html>
<html lang="${escaparXml(idioma)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparXml(titulo)}</title>
<style>html,body{margin:0;height:100%;background:#fff}#curso{height:100%;min-height:100vh}</style>
</head>
<body>
<div id="curso"></div>
<script src="aptio-reproductor.js"></script>
<script src="datos.js"></script>
<script src="iniciar.js"></script>
</body>
</html>
`;
}

/** Arranque separado del HTML (sin script en línea) por si el LMS aplica una política de contenido estricta. */
export const INICIAR_JS = `window.AptioPaquete = window.AptioReproductor.iniciarPaquete(document.getElementById('curso'), window.APTIO_DATOS);\n`;

/** Lo que comparten SCORM 1.2 y HTML (HU-1203): los mismos archivos, con las mismas reglas de qué recursos entran. */
export interface ContenidoPaquete {
  contenido: Map<string, Uint8Array | string>;
  /** Las rutas de `contenido`, con index.html primero y el resto en orden. */
  lista: string[];
  faltantes: string[];
  idioma: Idioma;
  idiomas: Idioma[];
  titulo: string;
}

/** Arma index.html, el reproductor, datos.js, iniciar.js y `recursos/`. `extra` se agrega a `datos.js`. */
export function armarContenido(entrada: EntradaScorm12, extra: Record<string, unknown> = {}): ContenidoPaquete {
  const bilingue = entrada.modoIdioma === 'mismo-paquete';
  const curso = bilingue ? cursoBilingue(entrada.curso) : entrada.curso;
  const idioma: Idioma = bilingue ? 'es' : entrada.idioma ?? curso.idiomas[0] ?? 'es';
  const idiomas: Idioma[] = bilingue ? [...IDIOMAS_BILINGUE] : [idioma];
  const titulo = textoDe(curso.metadatos.titulo, idioma) || curso.id;
  const archivos = new Map(entrada.recursos.map((r) => [r.id, r]));

  const rutas: Record<string, string> = {};
  const svgs: Record<string, string> = {};
  const subtitulos: Record<string, string> = {};
  const contenido = new Map<string, Uint8Array | string>();
  const faltantes: string[] = [];

  for (const r of curso.recursos as RecursoCurso[]) {
    // El material del cliente (documentos fuente de la trazabilidad) nunca va dentro del paquete (SUP-52).
    if (r.tipo === 'documento') continue;
    if (r.idioma && !(idiomas as string[]).includes(r.idioma)) continue;
    const archivo = archivos.get(r.id);
    if (!archivo) { faltantes.push(r.id); continue; }
    const ruta = `recursos/${seguro(r.id)}${extension(archivo.nombre) || extension(r.nombre)}`;
    rutas[r.id] = ruta;
    contenido.set(ruta, archivo.datos);
    if (esSvg(r, archivo.nombre)) svgs[r.id] = comoTexto(archivo.datos);
    if (esVtt(r, archivo.nombre)) subtitulos[r.id] = comoTexto(archivo.datos);
  }

  const datos = { curso, idioma, ...(entrada.kit ? { kit: entrada.kit } : {}), rutas, svgs, subtitulos, ...(entrada.incluirDiagnostico === false ? { diagnostico: false } : {}), ...(entrada.creditos ? { creditos: entrada.creditos } : {}), ...extra };
  contenido.set('index.html', indexHtml(titulo, idioma));
  contenido.set('aptio-reproductor.js', entrada.reproductor);
  contenido.set('datos.js', `window.APTIO_DATOS = ${JSON.stringify(datos)};\n`);
  contenido.set('iniciar.js', INICIAR_JS);

  const lista = [...contenido.keys()].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return { contenido, lista, faltantes, idioma, idiomas, titulo };
}

/** ZIP determinista: orden dado, fecha fija y compresión fija. */
export async function comprimir(archivos: [string, Uint8Array | string][]): Promise<Uint8Array> {
  const zip = new JSZip();
  const opciones = { date: FECHA_ZIP, createFolders: false } as const;
  for (const [ruta, datos] of archivos) zip.file(ruta, datos, opciones);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
}

export async function construirScorm12(entrada: EntradaScorm12): Promise<PaqueteScorm12> {
  const { curso } = entrada;
  const { contenido, lista, faltantes, idioma, idiomas, titulo } = armarContenido(entrada);
  const sumativa = curso.seguimiento.criterioCompletado === 'sumativa';
  const manifiesto = manifiestoScorm12({ cursoId: curso.id, titulo, masteryscore: sumativa ? curso.seguimiento.notaMinima : null, archivos: lista });
  const zip = await comprimir([['imsmanifest.xml', manifiesto], ...lista.map((r) => [r, contenido.get(r)!] as [string, Uint8Array | string])]);
  return { zip, archivos: ['imsmanifest.xml', ...lista], faltantes, idioma, idiomas };
}
