/** Montos en dólares como en el prototipo: US$ 58.20. */
export const usd = (n: number) => `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Origen en el documento: «p. 7», «pp. 7–9» (seguidas) o «pp. 17, 18, 25». */
export function paginas(l: number[]): string {
  if (l.length === 1) return `p. ${l[0]}`;
  const seguidas = l.every((p, i) => i === 0 || p === l[i - 1]! + 1);
  return seguidas ? `pp. ${l[0]}–${l.at(-1)}` : `pp. ${l.join(', ')}`;
}

/** Nombre de cada tipo de pantalla de la estructura (IA-04). */
export const NOMBRE_TIPO_PANTALLA: Record<string, string> = {
  portada: 'Portada', objetivos: 'Objetivos', contenido: 'Contenido', actividad: 'Actividad', evaluacion: 'Reto final',
  seccion: 'Sección', resumen: 'Resumen', resultados: 'Resultados', cierre: 'Cierre',
};

/** Catálogo cerrado de interacciones (docs/05-interacciones.md). */
export const NOMBRE_INTERACCION: Record<string, string> = {
  'INT-01': 'Memoria', 'INT-02': 'Clasificar', 'INT-03': 'Ordenar pasos', 'INT-04': 'Tarjetas', 'INT-05': 'Quiz',
  'INT-06': 'Exploración', 'INT-07': 'Deslizar', 'INT-08': 'Decisión',
};
