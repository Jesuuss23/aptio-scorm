// HU-0206 · Proponer el kit desde un curso anterior o un manual de marca (CP-028, IA-18 v2). Lo que no necesita IA:
// leer colores y tipografías del material (sin ejecutar nada), llevar cada tipografía a la más parecida de la lista
// cerrada del kit y revisar el contraste WCAG de la propuesta. El worker y la web comparten estas reglas.
import { CONTRASTE_AA, contraste, ESTILOS_KIT, type EstiloKit, FAMILIAS_KIT, FUENTES_KIT, HEX, type Paleta } from './marca.js';

export const TAREA_KIT = 'IA-18';

const MB = 1024 * 1024;

/**
 * Límites para leer un ZIP del cliente (archivos trampa): si se pasa alguno, se deja de leer y se usa lo leído hasta
 * ahí. Solo se leen archivos de texto; imágenes, fuentes y lo demás se cuentan pero no se abren.
 */
export const LIMITES_ZIP = {
  /** Entradas del índice del ZIP: más que esto se rechaza el archivo. */
  entradas: 5000,
  /** Bytes descomprimidos que se leen de un archivo de texto. */
  bytesArchivo: 2 * MB,
  /** Bytes descomprimidos que se leen en total. */
  bytesTotal: 20 * MB,
  /** Archivos de texto que se leen como mucho. */
  archivos: 400,
  extensiones: ['.css', '.html', '.htm', '.js', '.json'] as readonly string[],
};

/** Colores y tipografías más frecuentes que se pasan a la IA. */
export const MAX_COLORES = 12;
export const MAX_FUENTES = 8;

/** Un nombre de entrada del ZIP que se puede leer: sin rutas absolutas, sin `..` y con extensión de texto. */
export function entradaLeible(nombre: string): boolean {
  const n = nombre.replace(/\\/g, '/');
  if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split('/').some((p) => p === '..') || n.includes('\0')) return false;
  if (n.endsWith('/') || n.split('/').some((p) => p === '__MACOSX')) return false;
  const punto = n.lastIndexOf('.');
  return punto > n.lastIndexOf('/') && LIMITES_ZIP.extensiones.includes(n.slice(punto).toLowerCase());
}

export type Conteo = Map<string, number>;

const contar = (c: Conteo, clave: string, veces = 1) => c.set(clave, (c.get(clave) ?? 0) + veces);

export function sumarConteos(destino: Conteo, origen: Conteo): Conteo {
  for (const [k, v] of origen) contar(destino, k, v);
  return destino;
}

const dosHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** `#abc`, `#AABBCC` y `rgb(r, g, b)` / `rgba(…)` → `#RRGGBB`. Las entidades HTML (`&#123;`) no son colores. */
export function coloresEnTexto(texto: string): Conteo {
  const c: Conteo = new Map();
  for (const m of texto.matchAll(/(?<![&\w#])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g)) {
    const h = m[1]!;
    contar(c, `#${(h.length === 3 ? [...h].map((x) => x + x).join('') : h).toUpperCase()}`);
  }
  for (const m of texto.matchAll(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)/gi)) {
    contar(c, `#${dosHex(+m[1]!)}${dosHex(+m[2]!)}${dosHex(+m[3]!)}`.toUpperCase());
  }
  return c;
}

/** Un color de relleno de PDF (componentes 0–1) → `#RRGGBB`. */
export function hexDeRgb(r: number, g: number, b: number): string {
  return `#${dosHex(r * 255)}${dosHex(g * 255)}${dosHex(b * 255)}`.toUpperCase();
}

const GENERICAS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace',
  'ui-rounded', 'emoji', 'math', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', '-apple-system', 'blinkmacsystemfont',
]);

/** Limpia una familia: sin comillas, sin `!important`; vacía si es genérica o una variable. */
export function limpiarFamilia(f: string): string {
  const s = f.replace(/!important/i, '').trim().replace(/^['"]|['"]$/g, '').trim();
  if (!s || s.length > 60 || GENERICAS.has(s.toLowerCase()) || /^var\(|[{}<>()]/.test(s)) return '';
  return s;
}

/** Familias de `font-family` (también dentro de `@font-face`) y `fontFamily: "…"` de un CSS, HTML, JS o JSON. */
export function fuentesEnTexto(texto: string): Conteo {
  const c: Conteo = new Map();
  for (const m of texto.matchAll(/font-family\s*:\s*([^;{}<>\n]+)/gi)) {
    for (const f of m[1]!.split(',')) {
      const l = limpiarFamilia(f);
      if (l) contar(c, l);
    }
  }
  for (const m of texto.matchAll(/["']?fontFamily["']?\s*:\s*["']([^"'\n]{1,120})["']/g)) {
    for (const f of m[1]!.split(',')) {
      const l = limpiarFamilia(f);
      if (l) contar(c, l);
    }
  }
  return c;
}

/** El nombre de una fuente de PDF (`ABCDEF+SourceSans3-Bold`) → familia legible (`Source Sans 3`). */
export function familiaDePdf(nombre: string): string {
  let s = nombre.replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0]!.trim();
  s = s.replace(/(MT|PS|Std|Pro)$/, '');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/_/g, ' ').trim();
  return limpiarFamilia(s);
}

export interface Frecuencia { valor: string; veces: number }

/** Lo que se encontró en el material, para la IA y para mostrar al equipo. */
export interface EvidenciasKit {
  origen: 'zip' | 'pdf';
  /** Archivos de texto leídos del ZIP o páginas leídas del PDF. */
  leidos: number;
  colores: Frecuencia[];
  fuentes: Frecuencia[];
  /** Avisos de la lectura: límites alcanzados, entradas ignoradas. */
  avisos: string[];
}

export function masFrecuentes(c: Conteo, n: number): Frecuencia[] {
  return [...c].map(([valor, veces]) => ({ valor, veces })).sort((a, b) => b.veces - a.veces || a.valor.localeCompare(b.valor)).slice(0, n);
}

/** Las evidencias como texto para el prompt (va dentro de `<material_cliente>`). */
export function evidenciasComoTexto(e: EvidenciasKit): string {
  const desde = e.origen === 'zip' ? `${e.leidos} archivos de texto de un curso anterior (ZIP)` : `${e.leidos} páginas de un manual de marca (PDF)`;
  return [
    `Origen: ${desde}.`,
    `Colores (hex, veces): ${e.colores.map((c) => `${c.valor} ×${c.veces}`).join(', ') || 'ninguno'}`,
    `Tipografías (familia, veces): ${e.fuentes.map((f) => `${f.valor} ×${f.veces}`).join(', ') || 'ninguna'}`,
  ].join('\n');
}

// ---------- Tipografía más parecida de la lista del kit ----------

export type UsoFuente = 'titulos' | 'textos';
const compacto = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parecidos por familia tipográfica: la primera regla que coincide decide. */
const PARECIDAS: { patron: RegExp; titulos: string; textos: string }[] = [
  { patron: /condensed|narrow|compressed|oswald|bebas|impact|\bdin\b/, titulos: 'Barlow Condensed', textos: 'Source Sans 3' },
  { patron: /^(?!.*sans).*(serif|georgia|times|garamond|playfair|lora|cambria|palatino|baskerville|merriweather|roboto ?slab)/, titulos: 'Merriweather', textos: 'Merriweather' },
  { patron: /rounded|nunito|varela|quicksand|comic|arial ?rounded/, titulos: 'Nunito', textos: 'Nunito' },
  { patron: /futura|avenir|gotham|century ?gothic|montserrat|proxima|raleway|josefin|archivo/, titulos: 'Montserrat', textos: 'Lato' },
  { patron: /poppins|jakarta|manrope|dm ?sans|outfit|sora/, titulos: 'Poppins', textos: 'Plus Jakarta Sans' },
  { patron: /atkinson|verdana|tahoma|lexend/, titulos: 'Plus Jakarta Sans', textos: 'Atkinson Hyperlegible' },
  { patron: /source|segoe|frutiger|myriad|calibri|fira|noto|pt ?sans/, titulos: 'Plus Jakarta Sans', textos: 'Source Sans 3' },
  { patron: /open ?sans|helvetica|arial|roboto|inter|ibm ?plex|work ?sans|lato/, titulos: 'Plus Jakarta Sans', textos: 'Open Sans' },
];

/** La tipografía de la lista del kit más parecida a la de la marca; si ya está en la lista, la misma. */
export function fuenteParecida(familia: string, uso: UsoFuente): string {
  const exacta = FUENTES_KIT.find((f) => compacto(f.familia) === compacto(familia));
  if (exacta) return exacta.familia;
  const f = familia.toLowerCase();
  const regla = PARECIDAS.find((p) => p.patron.test(f));
  if (regla) return regla[uso];
  return uso === 'titulos' ? 'Plus Jakarta Sans' : 'Source Sans 3';
}

export const esFamiliaKit = (f: string) => FAMILIAS_KIT.includes(f);

// ---------- La propuesta (salida de IA-18 v2) ----------

export interface PropuestaKit {
  paleta: Paleta;
  tipografias: { titulos: string; texto: string; alternativasLibres?: string[] };
  /** Las tipografías que usa la marca, aunque no sean libres: el aviso «La marca usa X; se propone Y (libre)». */
  tipografiaMarca: { titulos: string; texto: string };
  estilo: { ilustracion: string; esquinas: string; tono: string; kit: EstiloKit };
  contrasteOk: boolean;
  evidencias: string[];
  confianza: number;
}

export const BLANCO = '#FFFFFF';
const relacion = (a: string, b: string) => Math.round(contraste(a, b) * 100) / 100;
const coma = (n: number) => n.toFixed(2).replace('.', ',');

/** Los pares que deben cumplir 4,5:1 (WCAG 2.2 AA): texto sobre fondo y blanco sobre primario. */
export function erroresContraste(p: Paleta): string[] {
  const errores: string[] = [];
  if (!HEX.test(p.texto) || !HEX.test(p.fondo) || !HEX.test(p.primario)) return ['La paleta debe tener colores #RRGGBB'];
  const tf = relacion(p.texto, p.fondo);
  if (tf < CONTRASTE_AA) errores.push(`/paleta: el texto (${p.texto}) sobre el fondo (${p.fondo}) tiene contraste ${coma(tf)}:1; debe ser al menos 4,5:1. Oscurece el texto o aclara el fondo.`);
  const bp = relacion(BLANCO, p.primario);
  if (bp < CONTRASTE_AA) errores.push(`/paleta/primario: el blanco sobre el primario (${p.primario}) tiene contraste ${coma(bp)}:1; debe ser al menos 4,5:1. Oscurece el primario y explícalo en evidencias.`);
  return errores;
}

/** Ajuste mecánico antes de validar: hex en mayúsculas y `contrasteOk` calculado aquí, no por la IA. */
export function prepararPropuestaKit(d: unknown): unknown {
  const p = d as Partial<PropuestaKit> | null;
  if (!p || typeof p !== 'object' || !p.paleta || typeof p.paleta !== 'object') return d;
  const paleta = Object.fromEntries(Object.entries(p.paleta).map(([k, v]) => [k, typeof v === 'string' ? v.toUpperCase() : v])) as Paleta;
  let ok = false;
  try {
    ok = erroresContraste(paleta).length === 0;
  } catch {
    ok = false;
  }
  return { ...p, paleta, contrasteOk: ok };
}

/** Reglas que el esquema no expresa: el contraste WCAG (se reintenta con estos errores). */
export function erroresPropuestaKit(d: PropuestaKit): string[] {
  try {
    return erroresContraste(d.paleta);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

/** «La marca usa X; se propone Y (libre)», para títulos y textos, si difieren. */
export function avisosTipografia(p: Pick<PropuestaKit, 'tipografias' | 'tipografiaMarca'>): string[] {
  const avisos: string[] = [];
  const par = [[p.tipografiaMarca.titulos, p.tipografias.titulos, 'títulos'], [p.tipografiaMarca.texto, p.tipografias.texto, 'textos']] as const;
  for (const [marca, propuesta, uso] of par) {
    if (marca && compacto(marca) !== compacto(propuesta)) avisos.push(`La marca usa ${marca} en ${uso}; se propone ${propuesta} (libre)`);
  }
  return avisos;
}

export const esEstiloKit = (e: unknown): e is EstiloKit => (ESTILOS_KIT as readonly unknown[]).includes(e);

/** Lo que se guarda en `TrabajoIA.resultado` (HU-0206). */
export interface ResultadoKit {
  tipo: 'kit';
  clienteId: string;
  recursoId: string;
  nombreArchivo: string;
  evidencias?: EvidenciasKit;
  propuesta?: PropuestaKit;
  /** Cuando se descarta, la propuesta deja de ofrecerse. */
  descartadaEn?: string;
}
