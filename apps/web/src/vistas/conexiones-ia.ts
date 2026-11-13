// HU-1304 · Lógica de Empresa › Conexiones IA y del medidor «Costo de IA del mes», sin React para probarla con Vitest.

/** El límite escrito en la fila: vacío quita el límite; un número negativo o con más de 2 decimales no vale. */
export function leerLimite(texto: string): { valor: number | null } | { error: string } {
  const t = texto.trim().replace(',', '.');
  if (!t) return { valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: 'Escribe un monto en US$ mayor o igual a 0, con hasta 2 decimales' };
  return { valor: Number(t) };
}

/** Lo que muestra el medidor de la barra lateral: total del mes frente a la suma de los límites, en rojo al tope. */
export function medidorMes(gastoUsd: number, limiteTotalUsd: number | null): { porcentaje: number | null; alTope: boolean } {
  if (limiteTotalUsd === null) return { porcentaje: null, alTope: false };
  if (limiteTotalUsd <= 0) return { porcentaje: 100, alTope: true };
  const p = Math.min(100, Math.round((gastoUsd / limiteTotalUsd) * 100));
  return { porcentaje: p, alTope: gastoUsd >= limiteTotalUsd };
}

/** El mensaje de un trabajo detenido por el límite, sin el código del comienzo. */
export const sinCodigoLimite = (texto: string) => texto.replace(/^LIMITE_GASTO:\s*/, '');
