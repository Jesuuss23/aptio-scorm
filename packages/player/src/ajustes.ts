// HU-0602 · Retoques del editor (capa de presentación, RN-06-1): cada pantalla guarda en `ajustes` el tamaño, el color
// del kit, la alineación y la animación de entrada de sus elementos, aparte del contenido. Aquí se traducen a estilo.
// RN-06-2: tamaños relativos al ancho de la pantalla (cqw), nunca píxeles. RN-06-4: colores solo por rol del kit.
import type { AjusteElemento, RolColor } from './tipos.ts';

export const ROLES_COLOR: readonly RolColor[] = ['primario', 'secundario', 'acento', 'texto', 'blanco', 'alerta', 'fondo'];
export const ANIMACIONES = ['aparecer', 'deslizar', 'zoom', 'rebotar'] as const;
const ALINEACION = { izquierda: 'left', centro: 'center', derecha: 'right' } as const;

const numero = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);

/**
 * Estilo en línea y clase de un elemento según su ajuste. Los textos usan tamaño, color y alineación; la imagen y el
 * personaje, la escala (propiedad `scale`, que no choca con el `transform` de las animaciones). «auto» y «ninguna» no
 * agregan animación (SUP-41). Lo que no es válido se ignora: el documento puede venir de cualquier versión.
 */
export function estiloAjuste(a: AjusteElemento | undefined, tipo: string): { estilo: string; clase: string } {
  if (!a) return { estilo: '', clase: '' };
  const reglas: string[] = [];
  if (tipo === 'texto') {
    const tam = numero(a.tamanoCqw, 0.5, 20);
    if (tam !== null) reglas.push(`font-size:${tam}cqw`);
    if (a.color && ROLES_COLOR.includes(a.color)) reglas.push(`color:var(--ap-${a.color})`);
    if (a.alineacion && a.alineacion in ALINEACION) reglas.push(`text-align:${ALINEACION[a.alineacion]}`);
  } else if (tipo === 'imagen' || tipo === 'personaje') {
    const escala = numero(a.escala, 0.3, 3);
    if (escala !== null) reglas.push(`scale:${escala}`);
  }
  const anim = (ANIMACIONES as readonly string[]).includes(a.animacion ?? '') ? `ap-anim-${a.animacion}` : '';
  return { estilo: reglas.join(';'), clase: anim };
}

/** Aplica el ajuste al elemento ya dibujado. */
export function aplicarAjuste(el: HTMLElement, a: AjusteElemento | undefined, tipo: string): HTMLElement {
  const { estilo, clase } = estiloAjuste(a, tipo);
  if (estilo) el.setAttribute('style', estilo);
  if (clase) el.classList.add(clase);
  return el;
}
