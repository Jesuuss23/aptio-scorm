// Capa de marca (decisión 4): datos del kit que comparten la API, la web y, más adelante, el reproductor.

export type RolColor = 'primario' | 'secundario' | 'acento' | 'fondo' | 'texto';
export type Paleta = Record<RolColor, string>;

export const ROLES_COLOR: readonly RolColor[] = ['primario', 'secundario', 'acento', 'fondo', 'texto'];
export const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Estilos base del kit (prototipo unificado). */
export const ESTILOS_KIT = ['Industrial', 'Corporativo', 'Institucional', 'Infantil aula', 'Salud'] as const;
export type EstiloKit = (typeof ESTILOS_KIT)[number];

/**
 * Tipografías permitidas en el kit: lista cerrada de fuentes con licencia SIL Open Font License 1.1,
 * que se sirven desde el propio paquete (sin Google Fonts en tiempo de ejecución). Las fuentes propias del
 * cliente llegan después, con su licencia (SUP-17).
 */
export const FUENTES_KIT = [
  { id: 'barlow-condensed', familia: 'Barlow Condensed', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'montserrat', familia: 'Montserrat', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'poppins', familia: 'Poppins', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'merriweather', familia: 'Merriweather', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'plus-jakarta-sans', familia: 'Plus Jakarta Sans', categoria: 'ambos', licencia: 'OFL-1.1' },
  { id: 'atkinson-hyperlegible', familia: 'Atkinson Hyperlegible', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'open-sans', familia: 'Open Sans', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'nunito', familia: 'Nunito', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'lato', familia: 'Lato', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'source-sans-3', familia: 'Source Sans 3', categoria: 'textos', licencia: 'OFL-1.1' },
] as const;
export type FuenteKit = (typeof FUENTES_KIT)[number];
export const FAMILIAS_KIT: readonly string[] = FUENTES_KIT.map((f) => f.familia);

/** Kit con el que arranca un cliente nuevo: el ejemplo industrial del prototipo, para que la vista previa no salga vacía. */
export const KIT_INICIAL = {
  estilo: 'Corporativo' as EstiloKit,
  paleta: { primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' } satisfies Paleta,
  tipografias: { titulos: 'Barlow Condensed', textos: 'Atkinson Hyperlegible' },
  voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 } },
};

/** Contraste mínimo de texto normal (WCAG 2.2 AA). */
export const CONTRASTE_AA = 4.5;

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Relación de contraste WCAG entre dos colores hex (#RRGGBB), de 1 a 21. */
export function contraste(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) throw new Error(`Color no válido: ${HEX.test(a) ? b : a}`);
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

export interface Advertencia {
  codigo: 'CONTRASTE_BAJO';
  mensaje: string;
  colores: [RolColor, RolColor];
  relacion: number;
}

/**
 * Pares de la paleta que se usan como texto sobre fondo en las pantallas. Un contraste bajo advierte y no
 * bloquea (RN-02-2): la marca del cliente manda, pero el equipo debe saberlo.
 */
const PARES_TEXTO: [RolColor, RolColor][] = [['texto', 'fondo'], ['primario', 'fondo']];

const redondear = (n: number) => Math.round(n * 100) / 100;

export function revisarPaleta(p: Paleta): { textoFondo: number; cumpleAA: boolean; advertencias: Advertencia[] } {
  const advertencias: Advertencia[] = [];
  for (const [t, f] of PARES_TEXTO) {
    const relacion = redondear(contraste(p[t], p[f]));
    if (relacion < CONTRASTE_AA) {
      advertencias.push({
        codigo: 'CONTRASTE_BAJO',
        mensaje: `El ${t} sobre el ${f} tiene contraste ${relacion.toFixed(1).replace('.', ',')}:1, menor a 4,5:1`,
        colores: [t, f],
        relacion,
      });
    }
  }
  const textoFondo = redondear(contraste(p.texto, p.fondo));
  return { textoFondo, cumpleAA: textoFondo >= CONTRASTE_AA, advertencias };
}

// ---------- Personaje (HU-0203, docs/20-guia-diseno.md §1) ----------

export const BOCAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'] as const;
export type Boca = (typeof BOCAS)[number];

/** Capas sin las que el reproductor no puede animar al personaje. */
export const CAPAS_OBLIGATORIAS = [
  'personaje', 'cabeza', 'ojos_abiertos', 'ojos_cerrados', 'pose_neutral', 'pose_explicando',
  'boca_A', 'boca_B', 'boca_C', 'boca_D', 'boca_E', 'boca_F', 'boca_X',
] as const;
export const CAPAS_RECOMENDADAS = ['boca_G', 'boca_H', 'pose_celebrando', 'pose_advirtiendo', 'pose_pensando', 'cejas'] as const;

/** Si falta una boca recomendada, el reproductor usa la más parecida (RN-07-3). */
export const REEMPLAZO_BOCA: Partial<Record<Boca, Boca>> = { G: 'B', H: 'C' };

/** Peso máximo del personaje: más pesado se nota en el celular. */
export const MAX_BYTES_PERSONAJE = 200 * 1024;
const BYTES_IDEALES_PERSONAJE = 120 * 1024;

export interface RevisionPersonaje {
  bocasDisponibles: Boca[];
  bocasFaltantes: Boca[];
  /** Boca que la reemplaza mientras el diseñador la agrega: { G: 'B' }. */
  reemplazos: Partial<Record<Boca, Boca>>;
  poses: string[];
  /** Bloquean: el personaje no se puede usar. */
  errores: string[];
  /** No bloquean. */
  avisos: string[];
}

export function revisarPersonaje({ ids, viewBox, bytes }: { ids: readonly string[]; viewBox: string | null; bytes: number }): RevisionPersonaje {
  const hay = new Set(ids);
  const bocasDisponibles = BOCAS.filter((b) => hay.has(`boca_${b}`));
  const bocasFaltantes = BOCAS.filter((b) => !hay.has(`boca_${b}`));
  const reemplazos: Partial<Record<Boca, Boca>> = {};
  for (const b of bocasFaltantes) {
    const r = REEMPLAZO_BOCA[b];
    if (r && hay.has(`boca_${r}`)) reemplazos[b] = r;
  }
  const errores = CAPAS_OBLIGATORIAS.filter((c) => !hay.has(c)).map((c) => `Falta la capa obligatoria «${c}»`);
  if (bytes > MAX_BYTES_PERSONAJE) errores.push(`Pesa ${Math.round(bytes / 1024)} KB; el máximo es 200 KB`);
  const avisos = CAPAS_RECOMENDADAS.filter((c) => !hay.has(c)).map((c) => {
    const boca = c.startsWith('boca_') ? (c.slice(5) as Boca) : null;
    return boca && reemplazos[boca] ? `${boca} falta: se usa la ${reemplazos[boca]} hasta que se agregue` : `Falta la capa recomendada «${c}»`;
  });
  if (!viewBox) avisos.push('Falta viewBox: el personaje no se adaptará a la pantalla');
  else {
    const [, , ancho, alto] = viewBox.trim().split(/[\s,]+/).map(Number);
    if (ancho && alto && Math.abs(ancho / alto - 0.75) > 0.02) avisos.push(`Proporción ${ancho}:${alto}; se espera 3:4 (por ejemplo 300 × 400)`);
  }
  if (bytes > BYTES_IDEALES_PERSONAJE && bytes <= MAX_BYTES_PERSONAJE) avisos.push(`Pesa ${Math.round(bytes / 1024)} KB; lo ideal es menos de 120 KB`);
  return { bocasDisponibles, bocasFaltantes, reemplazos, poses: ids.filter((i) => i.startsWith('pose_')).map((i) => i.slice(5)), errores, avisos };
}
