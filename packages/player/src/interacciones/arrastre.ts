// SUP-31 · Arrastrar y soltar con Pointer Events: el mismo código sirve para el ratón, el dedo y el lápiz. Se arrastra
// desde un asa (⠿) con `touch-action: none`, para que el resto de la pantalla siga desplazándose con el dedo. Arrastrar
// es un atajo: los botones de cada actividad siguen siendo el camino con teclado y lector de pantalla (WCAG 2.5.7).
// Escape o un `pointercancel` cancelan; un toque sin moverse no arrastra.

/** Píxeles que hay que mover el puntero para que empiece el arrastre (por debajo, es un toque o un clic). */
export const UMBRAL_ARRASTRE = 6;

export interface OpcionesArrastre {
  /** Lo que se dibuja bajo el puntero mientras se arrastra (se clona). */
  fantasma: () => HTMLElement;
  /** Si hoy se puede arrastrar (por ejemplo, no después de comprobar). */
  activo?: () => boolean;
  alEmpezar?: () => void;
  alMover?: (x: number, y: number) => void;
  /** Se soltó en (x, y), en coordenadas de la ventana. */
  alSoltar: (x: number, y: number) => void;
  /** Siempre al final, se haya soltado o cancelado. */
  alTerminar?: () => void;
}

/**
 * El elemento en (x, y), sin contar el fantasma (que no recibe el puntero). El reproductor vive en un Shadow DOM: se
 * pregunta a la raíz de `dentroDe`, porque `document` solo devolvería el anfitrión.
 */
export function bajoPuntero(x: number, y: number, dentroDe: Node): Element | null {
  const raiz = dentroDe.getRootNode() as Document | ShadowRoot;
  const buscar = typeof raiz.elementFromPoint === 'function' ? raiz : document;
  return typeof buscar.elementFromPoint === 'function' ? buscar.elementFromPoint(x, y) : null;
}

/** Hace que `asa` arrastre. Devuelve una función que quita los escuchas. */
export function arrastrable(asa: HTMLElement, op: OpcionesArrastre): () => void {
  // `bx`/`by`: esquina del bloque que contiene al fantasma. `.ap-r` es un contenedor de consultas (contención de
  // diseño), así que un `position: fixed` dentro de él se mide desde su esquina y no desde la de la ventana.
  let estado: { id: number; x0: number; y0: number; dx: number; dy: number; bx: number; by: number; fantasma: HTMLElement | null } | null = null;

  const mover = (x: number, y: number) => {
    if (!estado?.fantasma) return;
    estado.fantasma.style.transform = `translate(${Math.round(x - estado.dx - estado.bx)}px, ${Math.round(y - estado.dy - estado.by)}px)`;
  };
  const limpiar = () => {
    if (!estado) return;
    const empezado = Boolean(estado.fantasma);
    estado.fantasma?.remove();
    try { asa.releasePointerCapture?.(estado.id); } catch { /* ya se había soltado */ }
    estado = null;
    asa.classList.remove('ap-arrastrando');
    document.removeEventListener('keydown', escape, true);
    if (empezado) op.alTerminar?.();
  };
  const escape = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    limpiar();
  };

  const abajo = (ev: PointerEvent) => {
    if (estado || (ev.pointerType === 'mouse' && ev.button !== 0) || op.activo?.() === false) return;
    const r = asa.getBoundingClientRect();
    estado = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, bx: 0, by: 0, fantasma: null };
    try { asa.setPointerCapture?.(ev.pointerId); } catch { /* sin captura, los eventos siguen llegando al asa */ }
    ev.preventDefault();
  };
  const movimiento = (ev: PointerEvent) => {
    if (!estado || ev.pointerId !== estado.id) return;
    if (!estado.fantasma) {
      if (Math.hypot(ev.clientX - estado.x0, ev.clientY - estado.y0) < UMBRAL_ARRASTRE) return;
      const base = op.fantasma();
      const r = base.getBoundingClientRect();
      const f = base.cloneNode(true) as HTMLElement;
      // El fantasma es solo un dibujo: sin ids ni datos que lo confundan con el original.
      for (const el of [f, ...f.querySelectorAll<HTMLElement>('*')]) {
        el.removeAttribute('id');
        for (const at of [...el.attributes]) if (at.name.startsWith('data-')) el.removeAttribute(at.name);
      }
      f.classList.add('ap-fantasma');
      f.setAttribute('aria-hidden', 'true');
      f.style.width = `${Math.round(r.width)}px`;
      estado.dx = ev.clientX - r.left;
      estado.dy = ev.clientY - r.top;
      // Dentro del reproductor, para que herede la paleta y las tipografías del kit.
      const destino = asa.closest<HTMLElement>('.ap-r') ?? document.body;
      destino.append(f);
      if (destino !== document.body) {
        const b = destino.getBoundingClientRect();
        estado.bx = b.left;
        estado.by = b.top;
      }
      estado.fantasma = f;
      asa.classList.add('ap-arrastrando');
      document.addEventListener('keydown', escape, true);
      op.alEmpezar?.();
    }
    mover(ev.clientX, ev.clientY);
    op.alMover?.(ev.clientX, ev.clientY);
  };
  const arriba = (ev: PointerEvent) => {
    if (!estado || ev.pointerId !== estado.id) return;
    const empezado = Boolean(estado.fantasma);
    limpiar();
    if (empezado) op.alSoltar(ev.clientX, ev.clientY);
  };
  const cancelar = (ev: PointerEvent) => { if (estado && ev.pointerId === estado.id) limpiar(); };

  asa.addEventListener('pointerdown', abajo);
  asa.addEventListener('pointermove', movimiento);
  asa.addEventListener('pointerup', arriba);
  asa.addEventListener('pointercancel', cancelar);
  return () => {
    limpiar();
    asa.removeEventListener('pointerdown', abajo);
    asa.removeEventListener('pointermove', movimiento);
    asa.removeEventListener('pointerup', arriba);
    asa.removeEventListener('pointercancel', cancelar);
  };
}
