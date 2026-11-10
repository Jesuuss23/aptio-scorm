/** Montos en dólares como en el prototipo: US$ 58.20. */
export const usd = (n: number) => `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Origen en el documento: «p. 7», «pp. 7–9» (seguidas) o «pp. 17, 18, 25». */
export function paginas(l: number[]): string {
  if (l.length === 1) return `p. ${l[0]}`;
  const seguidas = l.every((p, i) => i === 0 || p === l[i - 1]! + 1);
  return seguidas ? `pp. ${l[0]}–${l.at(-1)}` : `pp. ${l.join(', ')}`;
}
