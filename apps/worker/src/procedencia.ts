// HU-1406 · REQ-062: todo recurso con origen GENERADO registra proveedor, modelo y licencia (ADR-010). Lo de IA guarda el
// proveedor y el modelo que respondieron (la voz, las ilustraciones); lo que arma la propia plataforma sin IA (subtítulos
// por letras, el paquete) se registra con el proveedor `aptio` y no sale en los créditos de la cápsula (SUP-64).
import { PROVEEDOR_APTIO } from '@aptio/exporters';

export interface Procedencia {
  proveedor: string;
  modelo: string;
  licencia: string;
}

/** Subtítulos WebVTT con tiempos repartidos por letras sobre la duración del audio (HU-0801, SUP-37). */
export const PROCEDENCIA_SUBTITULOS: Procedencia = { proveedor: PROVEEDOR_APTIO, modelo: 'subtitulos-por-letras v1', licencia: 'Generado por Aptio SCORM desde el guion' };

/** El paquete que arma @aptio/exporters (HU-1202, HU-1203). */
export const procedenciaPaquete = (formato: string): Procedencia => ({
  proveedor: PROVEEDOR_APTIO, modelo: formato === 'HTML' ? 'exportador-html v1' : 'exportador-scorm12 v1', licencia: 'Paquete generado por Aptio SCORM',
});

type DatosRecurso = { origen: string; nombre: string; proveedor?: string | null; modelo?: string | null; licencia?: string | null };

/** Un recurso GENERADO sin proveedor, modelo o licencia no se guarda: es un error del código que lo crea. */
export function conProcedencia<T extends DatosRecurso>(datos: T): T {
  if (datos.origen !== 'GENERADO') return datos;
  const faltan = (['proveedor', 'modelo', 'licencia'] as const).filter((k) => !datos[k]?.trim());
  if (faltan.length) throw new Error(`El recurso generado «${datos.nombre}» no tiene ${faltan.join(', ')} (REQ-062)`);
  return datos;
}
