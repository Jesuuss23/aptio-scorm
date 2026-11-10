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
