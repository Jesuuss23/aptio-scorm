import type { PantallaCompuesta } from '@aptio/schema/generacion';

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

/** Marca de tiempo de un video o audio: 150 → «2:30», 3725 → «1:02:05». */
export function tiempo(segundos: number): string {
  const s = Math.floor(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Lo que muestra cada zona de una pantalla compuesta (HU-0406) en su miniatura: el campo de IA-15 que la llena, el
 * personaje del kit o la actividad. null si la zona queda vacía (las imágenes llegan en la etapa 5).
 */
export function contenidoZona(p: Pick<PantallaCompuesta, 'campos' | 'actividad' | 'personaje'>, zona: string, personaje: string | null): string | null {
  const c = p.campos;
  const campo = (c as unknown as Record<string, unknown>)[zona];
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  switch (zona) {
    case 'dato': return texto(c.datoGrande) ?? texto(c.dato);
    case 'globo': return texto(c.burbuja);
    case 'lista': case 'tarjetas': case 'ideas': return c.items?.length ? c.items.map((i) => i.titulo).join(' · ') : null;
    case 'opciones': return c.opciones?.length ? c.opciones.join(' · ') : null;
    case 'retroalimentacion': return texto(c.retroOk);
    case 'personaje': return p.personaje && personaje ? personaje : null;
    case 'juego': case 'escena': case 'marcador': case 'puntos': {
      if (!p.actividad) return null;
      const nombre = NOMBRE_INTERACCION[p.actividad.tipo] ?? 'Actividad';
      if (!p.actividad.interaccion) return zona === 'juego' || zona === 'escena' ? `${nombre}: sin datos todavía` : null;
      return `${nombre}: ${resumenActividad(p.actividad.tipo, p.actividad.interaccion.datos)}`;
    }
    case 'boton': return 'Continuar';
    case 'botones': return 'Mito · Realidad';
    default: return texto(campo);
  }
}

/** Qué trae una actividad generada (HU-0407): «2 grupos · 8 elementos», «8 preguntas»… */
export function resumenActividad(tipo: string, datos: Record<string, unknown>): string {
  const n = (clave: string) => (Array.isArray(datos[clave]) ? (datos[clave] as unknown[]).length : 0);
  const cuenta = (clave: string, uno: string, varios: string) => `${n(clave)} ${n(clave) === 1 ? uno : varios}`;
  switch (tipo) {
    case 'INT-01': return cuenta('pares', 'par', 'pares');
    case 'INT-02': return `${cuenta('grupos', 'grupo', 'grupos')} · ${cuenta('elementos', 'elemento', 'elementos')}`;
    case 'INT-03': return cuenta('pasos', 'paso', 'pasos');
    case 'INT-04': return cuenta('tarjetas', 'tarjeta', 'tarjetas');
    case 'INT-05': return cuenta('preguntas', 'pregunta', 'preguntas');
    case 'INT-06': return cuenta('puntos', 'punto', 'puntos');
    case 'INT-07': return cuenta('afirmaciones', 'afirmación', 'afirmaciones');
    case 'INT-08': return cuenta('nodos', 'situación', 'situaciones');
    default: return 'con datos';
  }
}

/** HU-1302 · Nombre corto de cada tarea registrada en TrabajoIA (docs/06-ia.md); las demás se muestran con su código. */
export const NOMBRE_TAREA: Record<string, string> = {
  'IA-01': 'Mapa de temas', 'IA-02': 'Conservar u omitir', 'IA-03': 'Resumen por tema', 'IA-04': 'Estructura', 'IA-05': 'Storyboard',
  'IA-06': 'Sugerir interacción', 'IA-07': 'Datos de interacción', 'IA-08': 'Banco de preguntas', 'IA-09': 'Pausas de video',
  'IA-10': 'Traducción', 'IA-11': 'Prompt de imagen', 'IA-12': 'Revisión de calidad', 'IA-13': 'Acta de omitidos',
  'IA-14': 'Patrón de navegación', 'IA-15': 'Componer pantalla', 'IA-16': 'Propuesta de retoque', 'IA-17': 'Corrección de alineación',
  'IA-18': 'Extracción de kit', VOZ: 'Narración', MUESTRA_VOZ: 'Muestra de voz', TRANSCRIPCION: 'Transcripción',
};

/** HU-1303 · Montos en soles como en el prototipo: S/ 3,641 (o con decimales: S/ 26.25). */
export const soles = (n: number, decimales = 0) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

/** Número con 1 decimal como en el prototipo: 14.3. */
export const decimal = (n: number, decimales = 1) => n.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** Porcentaje entero: 0.5806 → «58 %». */
export const porcentaje = (n: number) => `${Math.round(n * 100)} %`;
