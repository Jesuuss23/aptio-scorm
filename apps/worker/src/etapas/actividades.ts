// HU-0407 · Datos de las actividades (IA-07 v2): la etapa 4 los pide para cada pantalla con actividad, después de
// componerla. El reto final es sumativo y lo demás formativo. CP-044: clasificar trae sus grupos, al menos 4 elementos
// con su grupo correcto y retroalimentación por elemento.
import type { InteraccionGenerada } from '@aptio/schema/generacion';

/** Fichas del catálogo cerrado (docs/05-interacciones.md): lo que la IA debe respetar en cada interacción. */
export const FICHAS_INTERACCION: Record<string, { nombre: string; ficha: string }> = {
  'INT-01': { nombre: 'Memoria', ficha: 'pares (3–8) con a y b en texto breve (máx. 6 palabras por carta); intentosMaximos opcional.' },
  'INT-02': { nombre: 'Clasificar', ficha: 'grupos (2–4) con id y etiqueta; elementos (4–12) con contenido, grupoCorrecto y retroalimentacion. Grupos equilibrados (diferencia máxima de 1) y al menos un elemento que exija discriminar.' },
  'INT-03': { nombre: 'Ordenar pasos', ficha: 'pasos (3–8) en el orden correcto, de máximo 12 palabras cada uno.' },
  'INT-04': { nombre: 'Tarjetas', ficha: 'tarjetas (2–8) con frente (concepto) y reverso (definición o ejemplo, máx. 30 palabras). Siempre formativa.' },
  'INT-05': { nombre: 'Quiz', ficha: 'preguntas (3–15) con enunciado, opciones (2–6, al menos una correcta) y retroalimentación correcta e incorrecta; objetivoId del objetivo que evalúa. segundosPorPregunta, vidas y preguntasPorIntento opcionales; preguntasPorIntento no pasa el número de preguntas del banco (lo ideal es al menos el doble).' },
  'INT-06': { nombre: 'Exploración', ficha: 'imagenId, alt de la imagen y puntos (1–10) con x e y en %, título, contenido y obligatorio. Siempre formativa; la posición la ajusta el diseñador.' },
  'INT-07': { nombre: 'Deslizar verdadero/falso', ficha: 'afirmaciones (4–12) con texto, verdadera y retroalimentación, equilibradas entre verdaderas y falsas.' },
  'INT-08': { nombre: 'Decisión', ficha: 'inicioId y nodos con situacion y opciones (2–3) con texto, consecuencia, puntaje (0–100) y siguienteId opcional. Profundidad máxima 3.' },
};

/** Interacciones que el esquema del curso solo admite formativas. */
const SOLO_FORMATIVA = ['INT-04', 'INT-06'];

/** El reto final (pantalla de evaluación) es sumativo; lo demás, formativo. */
export const modoDe = (tipoPantalla: string, tipo: string): 'formativa' | 'sumativa' =>
  tipoPantalla === 'evaluacion' && !SOLO_FORMATIVA.includes(tipo) ? 'sumativa' : 'formativa';

export type SalidaIa07 = InteraccionGenerada & { pantallaId?: string; tipo: string };
type Lista = Record<string, unknown>[];
const lista = (v: unknown): Lista => (Array.isArray(v) ? (v as Lista) : []);

/** Todos los `id` dentro de los datos de una interacción. */
function ids(nodo: unknown, salida: string[] = []): string[] {
  if (Array.isArray(nodo)) nodo.forEach((n) => ids(n, salida));
  else if (nodo && typeof nodo === 'object') {
    for (const [k, v] of Object.entries(nodo)) {
      if (k === 'id' && typeof v === 'string') salida.push(v);
      else ids(v, salida);
    }
  }
  return salida;
}

/** Reglas propias además del esquema (solo con proveedor real: el simulado responde siempre el caso LOTO). */
export function revisarActividad(p: { pantallaId: string; tipo: string; modo: 'formativa' | 'sumativa'; objetivoIds: readonly string[] }) {
  return (datos: unknown): string[] => {
    const s = datos as SalidaIa07;
    const errores: string[] = [];
    if (s.pantallaId !== undefined && s.pantallaId !== p.pantallaId) errores.push(`pantallaId debe ser "${p.pantallaId}"`);
    if (s.tipo !== p.tipo) errores.push(`tipo debe ser ${p.tipo}, la actividad del guion`);
    if (s.modo !== p.modo) errores.push(`modo debe ser ${p.modo}`);
    const todos = ids(s.datos);
    const repetidos = [...new Set(todos.filter((id, i) => todos.indexOf(id) !== i))];
    if (repetidos.length) errores.push(`Ids repetidos en la actividad: ${repetidos.join(', ')}`);
    const d = s.datos;
    if (s.tipo === 'INT-02') {
      const grupos = lista(d.grupos).map((g) => g.id as string);
      const elementos = lista(d.elementos);
      const fuera = elementos.filter((e) => !grupos.includes(e.grupoCorrecto as string)).map((e) => e.id);
      if (fuera.length) errores.push(`Elementos con un grupo que no existe: ${fuera.join(', ')}`);
      const sinRetro = elementos.filter((e) => !e.retroalimentacion).map((e) => e.id);
      if (sinRetro.length) errores.push(`Cada elemento lleva su retroalimentación; faltan en ${sinRetro.join(', ')}`);
      const cuentas = grupos.map((g) => elementos.filter((e) => e.grupoCorrecto === g).length);
      if (cuentas.length && Math.max(...cuentas) - Math.min(...cuentas) > 1) errores.push(`Los grupos deben estar equilibrados (diferencia máxima de 1): ${cuentas.join(' y ')}`);
    }
    if (s.tipo === 'INT-05') {
      const preguntas = lista(d.preguntas);
      const ajenos = preguntas.filter((q) => q.objetivoId !== undefined && !p.objetivoIds.includes(q.objetivoId as string)).map((q) => q.id);
      if (ajenos.length) errores.push(`Preguntas con un objetivo que no existe: ${ajenos.join(', ')}`);
      if (typeof d.preguntasPorIntento === 'number' && d.preguntasPorIntento > preguntas.length) {
        errores.push(`preguntasPorIntento (${d.preguntasPorIntento}) no puede pasar las ${preguntas.length} preguntas del banco`);
      }
    }
    if (s.tipo === 'INT-07') {
      const valores = new Set(lista(d.afirmaciones).map((a) => a.verdadera));
      if (valores.size < 2) errores.push('Las afirmaciones deben mezclar verdaderas y falsas');
    }
    if (s.tipo === 'INT-08') {
      const nodos = lista(d.nodos).map((n) => n.id as string);
      if (!nodos.includes(d.inicioId as string)) errores.push(`inicioId "${String(d.inicioId)}" no es un nodo`);
      const rotos = lista(d.nodos).flatMap((n) => lista(n.opciones)).filter((o) => o.siguienteId !== undefined && !nodos.includes(o.siguienteId as string)).map((o) => o.id);
      if (rotos.length) errores.push(`Opciones que llevan a un nodo que no existe: ${rotos.join(', ')}`);
    }
    return errores;
  };
}

/** Claves que apuntan a otro id de la misma actividad. */
const REFERENCIAS = new Set(['grupoCorrecto', 'inicioId', 'siguienteId']);

/** Antepone el id de la pantalla a cada id (y a sus referencias) que no lo tenga: así no chocan entre pantallas. */
function prefijar(nodo: unknown, prefijo: string): unknown {
  const con = (v: string) => (v.startsWith(prefijo) ? v : `${prefijo}${v}`);
  if (Array.isArray(nodo)) return nodo.map((n) => prefijar(n, prefijo));
  if (!nodo || typeof nodo !== 'object') return nodo;
  return Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, (k === 'id' || REFERENCIAS.has(k)) && typeof v === 'string' ? con(v) : prefijar(v, prefijo)]));
}

/**
 * La salida de IA-07 lista para el curso: sin `pantallaId`, con los ids prefijados por la pantalla y, en exploración,
 * con la imagen de escena de la pantalla (`<pantalla>-escena`), que dibuja la etapa de ilustraciones.
 */
export function interaccionDe(pantallaId: string, s: SalidaIa07): InteraccionGenerada {
  const { pantallaId: _p, tipo: _t, ...resto } = s;
  const datos = prefijar(resto.datos, `${pantallaId}-`) as Record<string, unknown>;
  return { ...resto, datos: s.tipo === 'INT-06' ? { ...datos, imagenId: `${pantallaId}-escena` } : datos };
}
