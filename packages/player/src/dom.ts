// Creación de elementos sin dependencias: el reproductor debe pesar poco dentro de cada paquete.

type Valor = string | number | boolean | null | undefined | ((e: Event) => void);
type Hijo = Node | string | null | undefined | false;

/** Crea un elemento. `on*` agrega un evento; `true` pone el atributo vacío; `false`, null o undefined lo omiten. */
export function h<K extends keyof HTMLElementTagNameMap>(etiqueta: K, atributos: Record<string, Valor> = {}, ...hijos: (Hijo | Hijo[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const x of hijos.flat()) if (x !== null && x !== undefined && x !== false) el.append(x);
  return el;
}

/** Reemplaza el contenido de un elemento. */
export function vaciar(el: Element | ShadowRoot, ...hijos: Hijo[]): void {
  el.replaceChildren(...hijos.filter((x): x is Node | string => x !== null && x !== undefined && x !== false));
}

/** Número pseudoaleatorio repetible a partir de un texto: la vista previa y el paquete barajan igual. */
export function semilla(texto: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < texto.length; i++) s = Math.imul(s ^ texto.charCodeAt(i), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

/** Copia barajada (Fisher–Yates) con una semilla repetible. */
export function barajar<T>(lista: readonly T[], clave: string): T[] {
  const azar = semilla(clave);
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}
