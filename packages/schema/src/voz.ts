// HU-0205 · Glosario y diccionario de pronunciación del cliente (REQ-028, RN-02-4, RN-08-1).
// Lógica pura que comparten la API (muestra de voz, cambios en cascada) y, desde el S4, la narración.

export const IDIOMAS_VOZ = ['es', 'en'] as const;
export type IdiomaVoz = (typeof IDIOMAS_VOZ)[number];

export interface TerminoGlosario {
  termino: string;
  traduccion?: string | null;
  noTraducir?: boolean;
}

export interface TerminoPronunciacion {
  idioma: IdiomaVoz;
  escrito: string;
  pronunciado: string;
}

export const MAX_TERMINO = 80;
export const MAX_PRONUNCIADO = 120;

const clave = (t: string) => t.trim().toLocaleLowerCase('es');
const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Busca el término como palabra completa, sin distinguir mayúsculas («LOTO» no coincide dentro de «pilotos»). */
export function patronTermino(termino: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaparRegex(termino.trim())}(?![\\p{L}\\p{N}_])`, 'giu');
}

export function contieneTermino(texto: string, termino: string): boolean {
  return termino.trim().length > 0 && patronTermino(termino).test(texto);
}

export function erroresGlosario(terminos: TerminoGlosario[]): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const t of terminos) {
    const nombre = t.termino.trim();
    if (!nombre) {
      errores.push('Hay un término vacío');
      continue;
    }
    if (vistos.has(clave(nombre))) errores.push(`«${nombre}» está repetido`);
    vistos.add(clave(nombre));
    if (!t.noTraducir && !t.traduccion?.trim()) errores.push(`«${nombre}»: indica la traducción o marca «no traducir»`);
  }
  return errores;
}

export function erroresPronunciacion(terminos: TerminoPronunciacion[]): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const t of terminos) {
    const escrito = t.escrito.trim();
    if (!escrito || !t.pronunciado.trim()) {
      errores.push(escrito ? `«${escrito}»: falta cómo se pronuncia` : 'Hay un término vacío');
      continue;
    }
    const k = `${t.idioma}:${clave(escrito)}`;
    if (vistos.has(k)) errores.push(`«${escrito}» está repetido en ${t.idioma === 'es' ? 'español' : 'inglés'}`);
    vistos.add(k);
    // La pronunciación es texto llano: el SSML lo arma la app, así nadie inyecta etiquetas en la voz.
    if (/[<>]/.test(t.pronunciado)) errores.push(`«${escrito}»: la pronunciación no admite etiquetas`);
  }
  return errores;
}

/** Términos agregados, quitados o cambiados entre dos versiones de una lista (por su clave sin mayúsculas). */
export function terminosCambiados<T>(antes: T[], despues: T[], claveDe: (t: T) => string, valorDe: (t: T) => string): string[] {
  const mapa = (l: T[]) => new Map(l.map((t) => [clave(claveDe(t)), valorDe(t)]));
  const a = mapa(antes);
  const d = mapa(despues);
  const cambiados = new Set<string>();
  for (const [k, v] of d) if (a.get(k) !== v) cambiados.add(k);
  for (const k of a.keys()) if (!d.has(k)) cambiados.add(k);
  return [...cambiados];
}

const escaparXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export interface TextoPronunciado {
  /** SSML para el proveedor de voz: cada término del diccionario va en `<sub alias>`. */
  ssml: string;
  /** Lo que dirá la voz, en texto llano, para mostrarlo junto a la muestra. */
  dicho: string;
  aplicados: string[];
}

/** Aplica el diccionario del idioma al texto (CP-027: «LOTO» → «lo-to»). Gana el término más largo. */
export function aplicarPronunciacion(texto: string, diccionario: TerminoPronunciacion[], idioma: IdiomaVoz): TextoPronunciado {
  const terminos = diccionario
    .filter((t) => t.idioma === idioma && t.escrito.trim() && t.pronunciado.trim())
    .sort((a, b) => b.escrito.trim().length - a.escrito.trim().length);
  const aplicados = new Set<string>();
  if (!terminos.length) return { ssml: `<speak>${escaparXml(texto)}</speak>`, dicho: texto, aplicados: [] };

  const porClave = new Map(terminos.map((t) => [clave(t.escrito), t]));
  const patron = new RegExp(terminos.map((t) => patronTermino(t.escrito).source).join('|'), 'giu');
  let ssml = '';
  let dicho = '';
  let desde = 0;
  for (const m of texto.matchAll(patron)) {
    const t = porClave.get(clave(m[0]))!;
    const previo = texto.slice(desde, m.index);
    ssml += `${escaparXml(previo)}<sub alias="${escaparXml(t.pronunciado.trim())}">${escaparXml(m[0])}</sub>`;
    dicho += `${previo}${t.pronunciado.trim()}`;
    aplicados.add(t.escrito.trim());
    desde = m.index + m[0].length;
  }
  ssml += escaparXml(texto.slice(desde));
  dicho += texto.slice(desde);
  return { ssml: `<speak>${ssml}</speak>`, dicho, aplicados: [...aplicados] };
}

/** Texto de narración por pantalla (id → texto por idioma), recorriendo módulos, cápsulas y pantallas del curso. */
export function narracionesDe(documento: unknown): Map<string, Partial<Record<IdiomaVoz, string>>> {
  const salida = new Map<string, Partial<Record<IdiomaVoz, string>>>();
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visitar);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const n = o.narracion as { texto?: Partial<Record<IdiomaVoz, string>> } | undefined;
    if (typeof o.id === 'string' && n?.texto) salida.set(o.id, n.texto);
    Object.values(o).forEach(visitar);
  };
  visitar(documento);
  return salida;
}

/** Valor de un JSON Pointer (RFC 6901) dentro del documento, o undefined. */
export function resolverPuntero(documento: unknown, ruta: string): unknown {
  if (ruta === '') return documento;
  if (!ruta.startsWith('/')) return undefined;
  let actual: unknown = documento;
  for (const parte of ruta.slice(1).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (actual === null || typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/** Texto de origen en español de una ruta: la ruta puede apuntar al texto o a su objeto por idioma. */
export function textoOrigen(documento: unknown, ruta: string): string | null {
  const v = resolverPuntero(documento, ruta);
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { es?: unknown }).es === 'string') return (v as { es: string }).es;
  return null;
}
