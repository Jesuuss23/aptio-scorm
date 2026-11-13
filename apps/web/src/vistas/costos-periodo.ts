// HU-1302 · Periodos del resumen de costos en días de Lima (UTC−05:00, sin horario de verano), como los interpreta la API.
export type Periodo = 'mes' | 'anterior' | 'todo';

export const PERIODOS: { valor: Periodo; nombre: string }[] = [
  { valor: 'mes', nombre: 'Este mes' },
  { valor: 'anterior', nombre: 'Mes anterior' },
  { valor: 'todo', nombre: 'Todo' },
];

const dos = (n: number) => String(n).padStart(2, '0');
const dia = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;

/** `desde` y `hasta` (incluidos) del periodo, según la fecha de Lima de `ahora`; «Todo» no filtra. */
export function rangoPeriodo(periodo: Periodo, ahora: Date): { desde?: string; hasta?: string } {
  if (periodo === 'todo') return {};
  const lima = new Date(ahora.getTime() - 5 * 3600_000);
  let a = lima.getUTCFullYear();
  let m = lima.getUTCMonth() + 1;
  if (periodo === 'anterior') {
    m -= 1;
    if (m === 0) { m = 12; a -= 1; }
  }
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: dia(a, m, 1), hasta: dia(a, m, ultimo) };
}
