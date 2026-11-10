// HU-0504 · JSON Patch (RFC 6902) puro y sin dependencias: lo usan el worker (para comprobar una propuesta de la IA
// antes de guardarla) y la API (para aplicarla). Nunca modifica el objeto recibido.

export type OperacionPatch =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; path: string; from: string };

export class ErrorPatch extends Error {
  readonly indice: number;
  constructor(mensaje: string, indice: number) {
    super(`Operación ${indice + 1}: ${mensaje}`);
    this.name = 'ErrorPatch';
    this.indice = indice;
  }
}

type Contenedor = Record<string, unknown> | unknown[];

/** Separa un JSON Pointer (RFC 6901) en sus claves. */
export function claves(puntero: string): string[] {
  if (puntero === '') return [];
  if (!puntero.startsWith('/')) throw new Error(`«${puntero}» no es un JSON Pointer`);
  return puntero.slice(1).split('/').map((c) => c.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Las rutas internas van bajo `/v` (para poder reemplazar la raíz); los mensajes muestran la del patch. */
const mostrar = (ruta: string) => ruta.slice(2) || '/';

const esContenedor = (v: unknown): v is Contenedor => typeof v === 'object' && v !== null;

function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!esContenedor(a) || !esContenedor(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function indiceArreglo(lista: unknown[], clave: string, alAgregar: boolean): number {
  if (alAgregar && clave === '-') return lista.length;
  if (!/^(0|[1-9]\d*)$/.test(clave)) throw new Error(`«${clave}» no es un índice de lista`);
  const i = Number(clave);
  if (i > lista.length || (!alAgregar && i === lista.length)) throw new Error(`el índice ${i} no existe`);
  return i;
}

/** El contenedor padre de la ruta y la última clave. */
function padre(raiz: unknown, ruta: string): { cont: Contenedor; clave: string } {
  const ks = claves(ruta);
  if (!ks.length) throw new Error('no se puede operar sobre la raíz');
  let actual: unknown = raiz;
  for (const k of ks.slice(0, -1)) {
    if (!esContenedor(actual)) throw new Error(`la ruta ${mostrar(ruta)} no existe`);
    actual = Array.isArray(actual) ? actual[indiceArreglo(actual, k, false)] : Object.hasOwn(actual, k) ? actual[k] : undefined;
    if (actual === undefined) throw new Error(`la ruta ${mostrar(ruta)} no existe`);
  }
  if (!esContenedor(actual)) throw new Error(`la ruta ${mostrar(ruta)} no existe`);
  return { cont: actual, clave: ks.at(-1)! };
}

function leer(raiz: unknown, ruta: string): unknown {
  if (ruta === '') return raiz;
  const { cont, clave } = padre(raiz, ruta);
  if (Array.isArray(cont)) return cont[indiceArreglo(cont, clave, false)];
  if (!Object.hasOwn(cont, clave)) throw new Error(`la ruta ${mostrar(ruta)} no existe`);
  return cont[clave];
}

function agregar(raiz: unknown, ruta: string, valor: unknown): void {
  const { cont, clave } = padre(raiz, ruta);
  if (Array.isArray(cont)) cont.splice(indiceArreglo(cont, clave, true), 0, valor);
  else cont[clave] = valor;
}

function quitar(raiz: unknown, ruta: string): unknown {
  const { cont, clave } = padre(raiz, ruta);
  if (Array.isArray(cont)) return cont.splice(indiceArreglo(cont, clave, false), 1)[0];
  if (!Object.hasOwn(cont, clave)) throw new Error(`la ruta ${mostrar(ruta)} no existe`);
  const v = cont[clave];
  delete cont[clave];
  return v;
}

/** Aplica las operaciones en orden sobre una copia; si una falla, lanza ErrorPatch y no devuelve nada a medias. */
export function aplicarPatch<T>(documento: T, operaciones: readonly OperacionPatch[]): T {
  const raiz = { v: structuredClone(documento) as unknown };
  const conRaiz = (ruta: string) => `/v${ruta}`;
  operaciones.forEach((o, i) => {
    try {
      switch (o.op) {
        case 'add':
          agregar(raiz, conRaiz(o.path), structuredClone(o.value));
          break;
        case 'remove':
          quitar(raiz, conRaiz(o.path));
          break;
        case 'replace':
          leer(raiz, conRaiz(o.path));
          quitar(raiz, conRaiz(o.path));
          agregar(raiz, conRaiz(o.path), structuredClone(o.value));
          break;
        case 'move': {
          if (o.path.startsWith(`${o.from}/`)) throw new Error('no se puede mover un valor dentro de sí mismo');
          agregar(raiz, conRaiz(o.path), quitar(raiz, conRaiz(o.from)));
          break;
        }
        case 'copy':
          agregar(raiz, conRaiz(o.path), structuredClone(leer(raiz, conRaiz(o.from))));
          break;
        case 'test':
          if (!iguales(leer(raiz, conRaiz(o.path)), o.value)) throw new Error(`el valor de ${o.path} no coincide`);
          break;
        default:
          throw new Error(`operación desconocida «${(o as { op: string }).op}»`);
      }
    } catch (e) {
      throw e instanceof ErrorPatch ? e : new ErrorPatch(e instanceof Error ? e.message : String(e), i);
    }
  });
  return raiz.v as T;
}
