// HU-0602 · Retoques del editor (capa de presentación, RN-06-1): cada pantalla guarda en `ajustes` el tamaño, el color
// del kit, la alineación y la animación de entrada de sus elementos, aparte del contenido. Aquí se traducen a estilo.
// RN-06-2: tamaños relativos al ancho de la pantalla (cqw), nunca píxeles. RN-06-4: colores solo por rol del kit.
// HU-0603 · El desplazamiento del modo Libre va con la propiedad `translate` (en cqw), aparte de la escala y de las
// animaciones, y según el dispositivo: todos, escritorio (reproductor de 640 px o más) o celular (menos de 640 px).
// HU-0606 · Los extras usan los mismos ajustes: los de texto como un texto; la imagen, la insignia y el personaje, la
// escala; la forma, la escala y su relleno. `oculto` saca el elemento de la vista (en el editor se ve tenue).
import type { AjusteElemento, ElementoExtra, RolColor } from './tipos.ts';

export const ROLES_COLOR: readonly RolColor[] = ['primario', 'secundario', 'acento', 'texto', 'blanco', 'alerta', 'fondo'];
export const ANIMACIONES = ['aparecer', 'deslizar', 'zoom', 'rebotar'] as const;
const ALINEACION = { izquierda: 'left', centro: 'center', derecha: 'right' } as const;
/** Tope del desplazamiento: ±100 % del ancho, para que nada quede perdido fuera de la pantalla. */
export const DESPLAZAMIENTO_MAX = 100;
const CLASE_DISPOSITIVO = { todos: 'ap-desp', escritorio: 'ap-desp-escritorio', celular: 'ap-desp-celular' } as const;

const numero = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);

/**
 * Estilo en línea y clase de un elemento según su ajuste. Los textos usan tamaño, color y alineación; la imagen y el
 * personaje, la escala (propiedad `scale`, que no choca con el `transform` de las animaciones). «auto» y «ninguna» no
 * agregan animación (SUP-41). Lo que no es válido se ignora: el documento puede venir de cualquier versión.
 */
export function estiloAjuste(a: AjusteElemento | undefined, tipo: string): { estilo: string; clase: string } {
  if (!a) return { estilo: '', clase: '' };
  const reglas: string[] = [];
  tipo = TIPO_AJUSTE[tipo] ?? tipo;
  if (tipo === 'texto') {
    const tam = numero(a.tamanoCqw, 0.5, 20);
    if (tam !== null) reglas.push(`font-size:${tam}cqw`);
    if (a.color && ROLES_COLOR.includes(a.color)) reglas.push(`color:var(--ap-${a.color})`);
    if (a.alineacion && a.alineacion in ALINEACION) reglas.push(`text-align:${ALINEACION[a.alineacion]}`);
  } else if (tipo === 'imagen' || tipo === 'personaje' || tipo === 'forma') {
    const escala = numero(a.escala, 0.3, 3);
    if (escala !== null) reglas.push(`scale:${escala}`);
    const relleno = a.relleno ?? a.color;
    if (tipo === 'forma' && relleno && ROLES_COLOR.includes(relleno)) reglas.push(`background:var(--ap-${relleno})`);
  }
  const clases: string[] = [];
  if (a.oculto === true) clases.push('ap-oculto-el');
  if ((ANIMACIONES as readonly string[]).includes(a.animacion ?? '')) clases.push(`ap-anim-${a.animacion}`);
  const d = a.desplazamiento;
  if (d && (tipo === 'texto' || tipo === 'imagen' || tipo === 'personaje' || tipo === 'forma')) {
    const x = numero(d.x, -DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX);
    const y = numero(d.y, -DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX);
    const clase = CLASE_DISPOSITIVO[d.dispositivo ?? 'todos'];
    if (x !== null && y !== null && clase && (x || y)) {
      reglas.push(`--ap-dx:${x}cqw`, `--ap-dy:${y}cqw`);
      clases.push(clase);
    }
  }
  return { estilo: reglas.join(';'), clase: clases.join(' ') };
}

/** Cómo se retoca cada extra: los que llevan texto, como un texto; la insignia, como una imagen. */
const TIPO_AJUSTE: Record<string, string> = { titulo: 'texto', dato: 'texto', boton: 'texto', insignia: 'imagen' };

/** Posición del extra en % de la pantalla, dentro de sus límites (0–100; ancho 1–100). */
export function posicionExtra(e: Pick<ElementoExtra, 'x' | 'y' | 'ancho'>): string {
  const x = numero(e.x, 0, 100) ?? 0;
  const y = numero(e.y, 0, 100) ?? 0;
  const ancho = numero(e.ancho, 1, 100) ?? 20;
  return `left:${x}%;top:${y}%;width:${ancho}%`;
}

/** Lo que hace un botón agregado. Por ahora solo avanza («siguiente»); las demás acciones llegan con los disparadores (SUP-45). */
export const accionBoton = (alClic: ElementoExtra['alClic']): 'siguiente' | 'nada' => (alClic === 'siguiente' ? 'siguiente' : 'nada');

/** Aplica el ajuste al elemento ya dibujado, sin borrar el estilo que ya tenía (la posición de un extra). */
export function aplicarAjuste(el: HTMLElement, a: AjusteElemento | undefined, tipo: string): HTMLElement {
  const { estilo, clase } = estiloAjuste(a, tipo);
  if (estilo) el.setAttribute('style', [el.getAttribute('style'), estilo].filter(Boolean).join(';'));
  if (clase) el.classList.add(...clase.split(' '));
  return el;
}
