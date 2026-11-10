// Seguimiento: avance, nota y estado que se reportaría al LMS. Es la misma cuenta en la vista previa (panel simulado)
// y en el paquete (S6, adaptador SCORM). La evaluación formativa enseña y no califica; la sumativa define la nota.
import type { PantallaPlana } from './navegacion.ts';
import type { EstadoLeccion, ResultadoActividad, Seguimiento } from './tipos.ts';

export interface EstadoSeguimiento {
  /** % de pantallas recorridas (con su actividad hecha, si tienen). */
  progreso: number;
  /** Nota 0–100 de las actividades sumativas, o null si aún no hay. */
  nota: number | null;
  /** Suma de los puntajes de todas las actividades hechas (formativas y sumativas). */
  puntos: number;
  leccion: EstadoLeccion;
}

export function seguimiento(pantallas: readonly PantallaPlana[], vistas: ReadonlySet<string>, resultados: ReadonlyMap<string, ResultadoActividad>, reglas: Seguimiento): EstadoSeguimiento {
  const hecha = (x: PantallaPlana) => vistas.has(x.pantalla.id) && (!x.conActividad || Boolean(resultados.get(x.pantalla.id)?.completada));
  const progreso = pantallas.length ? Math.round((pantallas.filter(hecha).length / pantallas.length) * 100) : 0;
  const puntos = [...resultados.values()].reduce((n, r) => n + (r.completada && r.puntaje !== null ? r.puntaje : 0), 0);

  const sumativas = pantallas.flatMap((x) =>
    x.pantalla.bloques.flatMap((b) => (b.tipo === 'interaccion' && b.interaccion.modo === 'sumativa' ? [{ id: x.pantalla.id, peso: b.interaccion.peso ?? 1 }] : [])),
  );
  const hechas = sumativas.filter((s) => resultados.get(s.id)?.completada);
  const pesoTotal = hechas.reduce((n, s) => n + s.peso, 0);
  const nota = hechas.length && pesoTotal > 0
    ? Math.round(hechas.reduce((n, s) => n + (resultados.get(s.id)?.puntaje ?? 0) * s.peso, 0) / pesoTotal)
    : null;

  const obligatoriasHechas = pantallas.filter((x) => x.pantalla.obligatoria).every(hecha);
  let leccion: EstadoLeccion = 'incomplete';
  if (reglas.criterioCompletado === 'sumativa' && sumativas.length) {
    if (hechas.length === sumativas.length && nota !== null) leccion = nota >= reglas.notaMinima ? 'passed' : 'failed';
  } else if (obligatoriasHechas) {
    leccion = 'completed';
  }
  return { progreso, nota, puntos, leccion };
}
