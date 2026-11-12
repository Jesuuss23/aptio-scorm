// HU-1401 · Contraste legible con cualquier kit (WCAG 2.2, criterios 1.4.3 y 1.4.11). El color del kit no se toca
// (SUP-63): cuando el reproductor lo usa como texto o como indicador de foco, toma una variante que oscurece el tono
// (o lo aclara, si el fondo es oscuro) hasta alcanzar la razón mínima frente a los fondos donde se dibuja.

type Rgb = readonly [number, number, number];

/** `#rgb` o `#rrggbb` a sus tres canales (0–255). Cualquier otra cosa no es un color que se pueda medir. */
export function rgb(color: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const x = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) as unknown as Rgb;
}

const hex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Luminancia relativa de WCAG 2.2: 0 (negro) a 1 (blanco). */
export function luminancia(color: string | Rgb): number {
  const c = typeof color === 'string' ? rgb(color) : color;
  if (!c) return NaN;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste de WCAG 2.2, de 1 a 21. */
export function contraste(a: string | Rgb, b: string | Rgb): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Pasos de mezcla hacia el negro (o el blanco): de 2 en 2 %, el cambio de tono es mínimo. */
const PASO = 0.02;

/**
 * El color más parecido al original que llega a `minimo` frente a todos los `fondos`: 4,5 para texto y 3 para el
 * foco y los íconos. Si ya cumple, vuelve tal cual. Con fondos claros se oscurece; con fondos oscuros, se aclara.
 * Un color o un fondo que no es hexadecimal no se puede medir y se deja como está.
 */
export function colorLegible(color: string, fondos: readonly string[], minimo = 4.5): string {
  const base = rgb(color);
  const medibles = fondos.map(rgb).filter((f): f is Rgb => f !== null);
  if (!base || !medibles.length) return color;
  const cumple = (c: Rgb) => medibles.every((f) => contraste(c, f) >= minimo);
  if (cumple(base)) return color;
  const claro = Math.min(...medibles.map((f) => luminancia(f))) > 0.18;
  const meta = claro ? 0 : 255;
  for (let t = PASO; t <= 1 + 1e-9; t += PASO) {
    const c = base.map((v) => Math.round(v + (meta - v) * t)) as unknown as Rgb;
    if (cumple(c)) return hex(c);
  }
  return hex([meta, meta, meta]);
}
