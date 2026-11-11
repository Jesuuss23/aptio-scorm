// HU-1204 · Lectura y resumen del informe del modo diagnóstico pegado en una ficha de compatibilidad LMS.

/** Lee el informe pegado: vacío es «sin informe»; si no es un objeto JSON, devuelve el error para mostrarlo. */
export function leerInforme(texto: string): { informe?: Record<string, unknown>; error?: string } {
  if (!texto.trim()) return {};
  try {
    const x: unknown = JSON.parse(texto);
    if (x && typeof x === 'object' && !Array.isArray(x)) return { informe: x as Record<string, unknown> };
  } catch {
    // cae al error de abajo
  }
  return { error: 'El informe no es un JSON válido: pega el texto completo que copia «Copiar informe» en el modo diagnóstico.' };
}

/** Resumen del informe para la tabla: si el paquete encontró la API y en qué navegador. */
export function resumenInforme(r: Record<string, unknown> | null): string {
  if (!r) return '—';
  const apiLms = r.api as { encontrada?: boolean; conectado?: boolean } | undefined;
  const nav = typeof r.navegador === 'string' ? ` · ${r.navegador}` : '';
  if (!apiLms) return `Informe pegado${nav}`;
  return `${apiLms.encontrada ? (apiLms.conectado ? 'API encontrada' : 'API encontrada, sin conexión') : 'Sin API SCORM'}${nav}`;
}
