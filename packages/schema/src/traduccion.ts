// HU-0802 · Traducción con glosario (M08, REQ-028). Lógica pura que comparten la API (sincronizar los textos del curso
// con sus filas de Traduccion, editar el inglés), el worker (qué se manda a IA-10 y cómo se guarda) y las pruebas.
// Cada texto del curso es un objeto por idioma `{ es, en }` (textoI18n del esquema) y se identifica por la ruta JSON
// Pointer de ese objeto. La traducción se guarda en su `.en`; el estado vive en la tabla Traduccion.
// HU-0803 · Desbordes (RN-08-3): cada texto en pantalla tiene un límite de caracteres según su componente; un inglés
// que lo pasa queda en Desborde, con una propuesta de versión corta.
import { contieneTermino, patronTermino, resolverPuntero, type TerminoGlosario } from './voz.js';

export type EstadoTraduccion = 'PENDIENTE' | 'TRADUCIDA_IA' | 'REVISADA' | 'DESBORDE';

export interface TextoCurso {
  /** JSON Pointer al objeto `{ es, en }`. */
  ruta: string;
  /** Pantalla que contiene el texto; null para los textos del curso (objetivos, recursos). */
  pantallaId: string | null;
  es: string;
  en: string | null;
  /** HU-0803 · Caracteres que caben en su componente; null si no ocupa espacio en pantalla (narración, alt, metadatos). */
  limite?: number | null;
}

/**
 * HU-0803 · Caracteres que caben en cada tipo de componente (referencia calibrada con el español de LOTO hasta que haya
 * medición por disposición y kit). null: el texto no ocupa espacio en la pantalla.
 */
export const LIMITE_CARACTERES = {
  titulo: 45,
  subtitulo: 70,
  destacado: 70,
  cuerpo: 160,
  instruccion: 90,
  opcion: 60,
  tarjetaMemoria: 24,
  etiquetaGrupo: 20,
  sinLimite: null,
} as const;
export type ComponenteTexto = keyof typeof LIMITE_CARACTERES;

/** Componente de cada ruta por su forma (los números de posición se cambian por #). El primero que coincide gana. */
const COMPONENTES: [RegExp, ComponenteTexto][] = [
  [/\/narracion\/texto$|\/alt$|^\/metadatos\/|^\/objetivos\//, 'sinLimite'],
  [/\/pares\/#\/[ab]\/texto$/, 'tarjetaMemoria'],
  [/\/grupos\/#\/etiqueta$/, 'etiquetaGrupo'],
  [/\/interaccion\/instruccion$/, 'instruccion'],
  [/\/opciones\/#\/(contenido\/)?texto$|\/pasos\/#\/contenido\/texto$|\/elementos\/#\/contenido\/texto$/, 'opcion'],
  [/\/titulo$|\/tarjetas\/#\/frente\/texto$/, 'titulo'],
  [/\/(situacion|consecuencia|retroalimentacion|correcta|incorrecta|enunciado|contenido)$|\/afirmaciones\/#\/texto$|\/tarjetas\/#\/reverso\/texto$/, 'cuerpo'],
];

/** Tipo de componente del texto en `ruta` (un bloque de texto se clasifica por su rol). */
export function componenteDe(doc: unknown, ruta: string): ComponenteTexto {
  const bloque = ruta.match(/^(.*\/bloques\/\d+)\/contenido$/);
  if (bloque) {
    const rol = (resolverPuntero(doc, bloque[1]!) as { rol?: string } | undefined)?.rol;
    if (rol === 'titulo' || rol === 'subtitulo' || rol === 'destacado') return rol;
    return 'cuerpo';
  }
  const forma = ruta.replace(/\/\d+(?=\/|$)/g, '/#');
  return COMPONENTES.find(([patron]) => patron.test(forma))?.[1] ?? 'sinLimite';
}

/** HU-0803 · Caracteres que caben en el componente del texto en `ruta`; null si no tiene límite. */
export function limiteDe(doc: unknown, ruta: string): number | null {
  return LIMITE_CARACTERES[componenteDe(doc, ruta)];
}

/** RN-08-3 · true si el texto no cabe en su límite (sin contar espacios al inicio o al final). */
export function desborda(texto: string | null | undefined, limite: number | null | undefined): boolean {
  return typeof limite === 'number' && typeof texto === 'string' && texto.trim().length > limite;
}

const escapar = (parte: string) => parte.replace(/~/g, '~0').replace(/\//g, '~1');

/** true si el valor es un texto por idioma con el español escrito. */
function esTexto(v: unknown): v is { es: string; en?: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const claves = Object.keys(v);
  return claves.length > 0 && claves.every((k) => k === 'es' || k === 'en') && typeof (v as { es?: unknown }).es === 'string'
    && (v as { es: string }).es.trim().length > 0;
}

/** Todos los textos del curso en el orden del documento, con su ruta y su pantalla. */
export function textosDe(doc: unknown): TextoCurso[] {
  const salida: TextoCurso[] = [];
  const visitar = (v: unknown, ruta: string, pantallaId: string | null, esPantalla: boolean) => {
    if (esTexto(v)) {
      salida.push({ ruta, pantallaId, es: v.es, en: typeof v.en === 'string' ? v.en : null, limite: limiteDe(doc, ruta) });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => visitar(x, `${ruta}/${i}`, pantallaId, esPantalla));
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const propia = esPantalla && typeof o.id === 'string' ? o.id : pantallaId;
    for (const [k, x] of Object.entries(o)) visitar(x, `${ruta}/${escapar(k)}`, propia, k === 'pantallas');
  };
  visitar(doc, '', null, false);
  return salida;
}

/**
 * Copia del curso con el inglés de cada ruta. Lanza un error si una ruta no es un texto del curso: nunca se escribe
 * fuera de un `{ es, en }`.
 */
export function aplicarTraducciones<T>(doc: T, cambios: Readonly<Record<string, string>>): T {
  const copia = structuredClone(doc);
  for (const [ruta, en] of Object.entries(cambios)) {
    const nodo = resolverPuntero(copia, ruta);
    if (!esTexto(nodo)) throw new Error(`La ruta ${ruta} no es un texto del curso`);
    if (!en.trim()) throw new Error(`La traducción de ${ruta} está vacía`);
    (nodo as { en?: string }).en = en;
  }
  return copia;
}

/** Huella del texto en español (FNV-1a de 53 bits): si cambia, lo traducido o revisado era para otro texto. */
export function huellaTexto(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Las formas en que aparece el término en el texto (como palabra completa, sin distinguir mayúsculas). */
const formasEn = (texto: string, termino: string) => [...new Set([...texto.matchAll(patronTermino(termino))].map((m) => m[0]))];

/** Contiene `forma` escrita igual (mayúsculas incluidas) y como palabra completa. */
const contieneExacto = (texto: string, forma: string) => [...texto.matchAll(patronTermino(forma))].some((m) => m[0] === forma);

/**
 * RN-08-1 · Lo que la traducción no respeta del glosario. Un término aparece en el origen como palabra completa, sin
 * distinguir mayúsculas. Si es «no traducir», el destino lo lleva idéntico a como está en el origen; si tiene
 * traducción, el destino usa esa traducción (como palabra completa; las mayúsculas pueden cambiar al inicio de frase).
 */
export function erroresGlosario(origen: string, destino: string, glosario: readonly TerminoGlosario[]): string[] {
  const errores: string[] = [];
  for (const t of glosario) {
    if (!t.termino.trim() || !contieneTermino(origen, t.termino)) continue;
    if (t.noTraducir) {
      for (const forma of formasEn(origen, t.termino)) {
        if (!contieneExacto(destino, forma)) errores.push(`«${forma}» no se traduce: debe quedar igual`);
      }
    } else if (t.traduccion?.trim() && !contieneTermino(destino, t.traduccion)) {
      errores.push(`«${t.termino}» se traduce «${t.traduccion.trim()}» (glosario del cliente)`);
    }
  }
  return errores;
}

/** Nombre de cada estado en la interfaz (PNT-11). */
export const NOMBRE_ESTADO: Record<EstadoTraduccion, string> = {
  PENDIENTE: 'Pendiente', TRADUCIDA_IA: 'Traducido por IA', REVISADA: 'Revisado', DESBORDE: 'Desborde',
};

/** HU-0802 · Tarea del worker que traduce los pendientes (cola `ia`). */
export const TAREA_TRADUCIR = 'IA-10';
/** Lote máximo de textos por llamada a IA-10. */
export const LOTE_TRADUCCION = 60;

/** Fila de Traduccion tal como la guarda la base (solo inglés en el S7). */
export interface FilaTraduccion {
  id: string;
  ruta: string;
  textoOrigenHash: string;
  estado: EstadoTraduccion;
}

/**
 * Lo que hay que hacer para que las filas reflejen los textos actuales del curso: crear las que faltan (Pendiente, o
 * Traducido por IA si el texto ya trae inglés), volver a Pendiente las que cambiaron en español (aunque estuvieran
 * revisadas: lo revisado era para otro texto; el inglés anterior queda como referencia) y borrar las de rutas que ya
 * no existen. HU-0803: un inglés de la IA que pasa su límite queda en Desborde (`desbordar`); lo revisado no se toca.
 */
export function sincronizarFilas(textos: readonly TextoCurso[], filas: readonly FilaTraduccion[]): {
  crear: { ruta: string; textoOrigenHash: string; estado: EstadoTraduccion }[];
  reiniciar: { id: string; textoOrigenHash: string }[];
  borrar: string[];
  desbordar: string[];
} {
  const porRuta = new Map(filas.map((f) => [f.ruta, f]));
  const vigentes = new Set(textos.map((t) => t.ruta));
  const crear: { ruta: string; textoOrigenHash: string; estado: EstadoTraduccion }[] = [];
  const reiniciar: { id: string; textoOrigenHash: string }[] = [];
  const desbordar: string[] = [];
  for (const t of textos) {
    const huella = huellaTexto(t.es);
    const fila = porRuta.get(t.ruta);
    const largo = desborda(t.en, t.limite);
    if (!fila) crear.push({ ruta: t.ruta, textoOrigenHash: huella, estado: t.en ? (largo ? 'DESBORDE' : 'TRADUCIDA_IA') : 'PENDIENTE' });
    else if (fila.textoOrigenHash !== huella) reiniciar.push({ id: fila.id, textoOrigenHash: huella });
    else if (fila.estado === 'TRADUCIDA_IA' && largo) desbordar.push(fila.id);
  }
  return { crear, reiniciar, borrar: filas.filter((f) => !vigentes.has(f.ruta)).map((f) => f.id), desbordar };
}

/** HU-0803 · En la pasada de versión corta, además de las reglas del lote, cada texto debe caber en su límite. */
export function erroresLimite(pedidos: readonly { ruta: string; limite?: number | null | undefined }[], salida: { traducciones: { ruta: string; texto: string }[] }): string[] {
  const limites = new Map(pedidos.map((p) => [p.ruta, p.limite]));
  return salida.traducciones.filter((t) => desborda(t.texto, limites.get(t.ruta)))
    .map((t) => `${t.ruta}: tiene ${t.texto.trim().length} caracteres y caben ${limites.get(t.ruta)}: acórtalo`);
}

/** Reglas propias de la salida de IA-10 sobre un lote: exactamente las rutas pedidas y el glosario en cada texto. */
export function erroresLote(pedidos: readonly { ruta: string; es: string }[], salida: { traducciones: { ruta: string; texto: string }[] }, glosario: readonly TerminoGlosario[]): string[] {
  const errores: string[] = [];
  const pedidas = new Map(pedidos.map((p) => [p.ruta, p.es]));
  const vistas = new Set<string>();
  for (const t of salida.traducciones) {
    const es = pedidas.get(t.ruta);
    if (es === undefined) errores.push(`${t.ruta}: no se pidió esta ruta`);
    else if (vistas.has(t.ruta)) errores.push(`${t.ruta}: la ruta está repetida`);
    else errores.push(...erroresGlosario(es, t.texto, glosario).map((e) => `${t.ruta}: ${e}`));
    vistas.add(t.ruta);
  }
  for (const ruta of pedidas.keys()) if (!vistas.has(ruta)) errores.push(`${ruta}: falta la traducción`);
  return errores;
}
