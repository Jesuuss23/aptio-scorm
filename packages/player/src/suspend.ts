// HU-1202 · HU-1105 · `cmi.suspend_data` compacto del paquete (SCORM 1.2 admite 4096 caracteres).
// Las pantallas van por su posición en el curso (el paquete queda ligado a una versión del curso, RN-12-4). Vistas como
// rangos «0-12,15»; resultados como «posición:completada:puntaje[:intentos]», con «-» si la actividad no califica.
//   v1 (HU-1202): `1|<idioma>|<vistas>|<resultados>`, p. ej. `1|es|0-27|6:1:-,27:1:80`.
//   v2 (HU-1105): `2|<huella>|<idioma>|<vistas>|<resultados>`, con la huella del curso y los intentos usados.
// La lectura nunca lanza: un texto truncado, corrupto o de otro curso (otra huella o posiciones que no existen) se
// descarta y el curso empieza de cero. v1 se sigue leyendo para los paquetes que ya se entregaron.
import type { ResultadoActividad } from './tipos.ts';

export interface DatosSuspend {
  idioma: string;
  vistas: string[];
  resultados: Record<string, ResultadoActividad>;
}

/**
 * Huella corta (FNV-1a de 32 bits en base 36) del id del curso y el orden de sus pantallas. Si el LMS devuelve el
 * suspend_data de otro curso, o de otra versión con otras pantallas, la huella no coincide y se descarta.
 */
export function huellaCurso(cursoId: string, orden: readonly string[]): string {
  let x = 0x811c9dc5;
  for (const c of `${cursoId}\u0000${orden.join('\u0001')}`) {
    x ^= c.codePointAt(0)!;
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(36);
}

function rangos(posiciones: number[]): string {
  const orden = [...new Set(posiciones)].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < orden.length; ) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j]! + 1) j++;
    partes.push(j === i ? String(orden[i]) : `${orden[i]}-${orden[j]}`);
    i = j + 1;
  }
  return partes.join(',');
}

/** Codifica avance, resultados e intentos en formato v2. `orden` son los ids de pantalla en el orden del curso. */
export function codificarSuspend(orden: readonly string[], datos: DatosSuspend, huella: string = huellaCurso('', orden)): string {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  const vistas = datos.vistas.map((id) => posicion.get(id)).filter((n): n is number => n !== undefined);
  const resultados = Object.entries(datos.resultados)
    .map(([id, r]) => [posicion.get(id), r] as const)
    .filter((x): x is readonly [number, ResultadoActividad] => x[0] !== undefined)
    .sort((a, b) => a[0] - b[0])
    .map(([n, r]) => `${n}:${r.completada ? 1 : 0}:${r.puntaje === null ? '-' : Math.round(r.puntaje)}${r.intentos ? `:${r.intentos}` : ''}`);
  return `2|${huella}|${datos.idioma}|${rangos(vistas)}|${resultados.join(',')}`;
}

const ENTERO = /^\d{1,6}$/;
const IDIOMA = /^[a-z]{2}(-[A-Za-z]{2})?$/;

/** Lee las partes comunes a v1 y v2; null ante cualquier dato fuera de lugar. */
function leerPartes(orden: readonly string[], idioma: string, textoVistas: string, textoResultados: string): DatosSuspend | null {
  if (!IDIOMA.test(idioma)) return null;
  const vistas: string[] = [];
  for (const parte of textoVistas ? textoVistas.split(',') : []) {
    const extremos = parte.split('-');
    if (extremos.length > 2 || !extremos.every((x) => ENTERO.test(x))) return null;
    const a = Number(extremos[0]);
    const b = Number(extremos[1] ?? extremos[0]);
    if (a > b || b >= orden.length) return null;
    for (let n = a; n <= b; n++) vistas.push(orden[n]!);
  }
  const resultados: Record<string, ResultadoActividad> = {};
  for (const parte of textoResultados ? textoResultados.split(',') : []) {
    const [n = '', c, p = '', i, ...resto] = parte.split(':');
    if (resto.length || !ENTERO.test(n) || Number(n) >= orden.length || (c !== '0' && c !== '1')) return null;
    if (p !== '-' && (!ENTERO.test(p) || Number(p) > 100)) return null;
    if (i !== undefined && !ENTERO.test(i)) return null;
    const r: ResultadoActividad = { completada: c === '1', puntaje: p === '-' ? null : Number(p) };
    if (i !== undefined && Number(i) > 0) r.intentos = Number(i);
    resultados[orden[Number(n)]!] = r;
  }
  return { idioma, vistas: [...new Set(vistas)], resultados };
}

/**
 * Lee lo que dejó `codificarSuspend` (v2) o la versión anterior (v1). Con `huella`, un v2 de otro curso se descarta.
 * Devuelve null si el texto está vacío, truncado, corrupto o no es de este curso. Nunca lanza.
 */
export function leerSuspend(orden: readonly string[], texto: string, huella?: string): DatosSuspend | null {
  try {
    if (typeof texto !== 'string' || !texto) return null;
    const partes = texto.split('|');
    if (partes[0] === '1' && partes.length === 4) return leerPartes(orden, partes[1]!, partes[2]!, partes[3]!);
    if (partes[0] === '2' && partes.length === 5) {
      if (!partes[1] || (huella !== undefined && partes[1] !== huella)) return null;
      return leerPartes(orden, partes[2]!, partes[3]!, partes[4]!);
    }
    return null;
  } catch {
    return null;
  }
}
