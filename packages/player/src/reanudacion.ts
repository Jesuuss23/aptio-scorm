// HU-1105 · Reanudación (CP-089, CP-092): qué guardó el LMS y si hay que preguntar «¿Continuar donde lo dejaste?».
// Solo se pregunta si el suspend_data es válido y de este curso, y la pantalla guardada existe y no es la primera.
// Sin DOM: lo usan `paquete.ts` (para decidir) y `reproductor.ts` (para restaurar).
import type { PantallaPlana } from './navegacion.ts';
import { leerSuspend } from './suspend.ts';
import type { ResultadoActividad } from './tipos.ts';

/** El avance con el que se vuelve a montar el curso. */
export interface Reanudacion {
  pantallaId: string;
  vistas: string[];
  resultados: Record<string, ResultadoActividad>;
}

/** Lo que el LMS tenía al entrar (lo lee `conectarScorm12`). */
export interface GuardadoLms {
  entrada: string;
  ubicacion: string;
  suspendData: string;
}

/**
 * Decide si hay avance para reanudar. `ab-initio` es un intento nuevo (el LMS lo dice explícitamente); `resume` o vacío
 * (hay LMS que no informan `cmi.core.entry`) se aceptan si lo guardado es válido.
 */
export function decidirReanudacion(guardado: GuardadoLms, orden: readonly string[], huella: string): Reanudacion | null {
  if (guardado.entrada === 'ab-initio') return null;
  const pantallaId = guardado.ubicacion;
  const posicion = orden.indexOf(pantallaId);
  if (posicion <= 0) return null;
  const datos = leerSuspend(orden, guardado.suspendData, huella);
  if (!datos) return null;
  return { pantallaId, vistas: datos.vistas, resultados: datos.resultados };
}

/** El estado interno del reproductor al restaurar: pantalla actual, la más lejana alcanzada, vistas y resultados. */
export function estadoReanudado(pantallas: readonly PantallaPlana[], r: Reanudacion) {
  const indice = new Map(pantallas.map((x) => [x.pantalla.id, x.indice]));
  const actual = Math.max(0, indice.get(r.pantallaId) ?? 0);
  const vistas = new Set(r.vistas.filter((id) => indice.has(id)));
  vistas.add(pantallas[actual]!.pantalla.id);
  const resultados = new Map(Object.entries(r.resultados).filter(([id]) => indice.has(id)));
  const maxima = Math.max(actual, ...[...vistas].map((id) => indice.get(id)!));
  return { actual, maxima, vistas, resultados };
}
