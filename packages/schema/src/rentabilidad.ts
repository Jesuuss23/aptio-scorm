// HU-1303 · Rentabilidad (M13, RN-13-1): costo por SCORM = horas × tarifa + IA por API × tipo de cambio + licencias del
// mes ÷ SCORM al mes, hoy frente a con el generador. Lo usan la API y la web (la vista recalcula al editar). Con la fuente
// «mediciones», las horas por etapa son el promedio de los proyectos medidos de cada escenario; un escenario sin
// mediciones usa los supuestos y lo marca en `respaldo`.

/** Días hábiles del mes para la capacidad del equipo (prototipo). */
export const DIAS_HABILES_MES = 22;

export const ESCENARIOS = ['hoy', 'generador'] as const;
export type Escenario = (typeof ESCENARIOS)[number];
export type FuenteRentabilidad = 'supuestos' | 'mediciones';

/** Las 8 etapas de `docs/11-medicion-y-piloto.md`, con las horas de ejemplo del prototipo (SCORM de 30 pantallas). */
export const ETAPAS_NEGOCIO = [
  { etapa: 'lectura-guion', nombre: 'Lectura del material y guion', horasHoy: 20, horasGenerador: 4 },
  { etapa: 'diseno-grafico', nombre: 'Diseño gráfico e ilustraciones', horasHoy: 40, horasGenerador: 8 },
  { etapa: 'animacion', nombre: 'Animación y armado', horasHoy: 36, horasGenerador: 4 },
  { etapa: 'audio', nombre: 'Audio con IA', horasHoy: 6, horasGenerador: 0.5 },
  { etapa: 'boca', nombre: 'Boca del personaje', horasHoy: 16, horasGenerador: 0 },
  { etapa: 'ingles', nombre: 'Versión en inglés', horasHoy: 0, horasGenerador: 2 },
  { etapa: 'correcciones', nombre: 'Correcciones del cliente', horasHoy: 24, horasGenerador: 6 },
  { etapa: 'empaquetado', nombre: 'Empaquetado y pruebas en LMS', horasHoy: 8, horasGenerador: 1 },
] as const;
export type EtapaNegocio = (typeof ETAPAS_NEGOCIO)[number]['etapa'];
export const CLAVES_ETAPA: readonly EtapaNegocio[] = ETAPAS_NEGOCIO.map((e) => e.etapa);
export const NOMBRE_ETAPA = Object.fromEntries(ETAPAS_NEGOCIO.map((e) => [e.etapa, e.nombre])) as Record<EtapaNegocio, string>;

export interface HorasEtapa { etapa: string; horasHoy: number; horasGenerador: number }

/** Datos del negocio (montos en soles salvo `iaPorScormUsd`). */
export interface ParametrosNegocio {
  precioHoy: number;
  precioCompetencia: number;
  precioNuevo: number;
  personas: number;
  horasProductivasDia: number;
  tarifaHora: number;
  tipoCambio: number;
  diasEsperaHoy: number;
  diasEsperaGenerador: number;
  licenciasMesHoy: number;
  licenciasMesGenerador: number;
  iaPorScormUsd: number;
  etapas: HorasEtapa[];
}

/** Valores de ejemplo del prototipo, mientras la organización no guarde los suyos. */
export const PARAMETROS_EJEMPLO: ParametrosNegocio = {
  precioHoy: 4500, precioCompetencia: 1500, precioNuevo: 1800, personas: 3, horasProductivasDia: 6, tarifaHora: 22,
  tipoCambio: 3.75, diasEsperaHoy: 6, diasEsperaGenerador: 2, licenciasMesHoy: 900, licenciasMesGenerador: 650, iaPorScormUsd: 7,
  etapas: ETAPAS_NEGOCIO.map(({ etapa, horasHoy, horasGenerador }) => ({ etapa, horasHoy, horasGenerador })),
};

const CAMPOS_NUMERO = ['precioHoy', 'precioCompetencia', 'precioNuevo', 'personas', 'horasProductivasDia', 'tarifaHora', 'tipoCambio',
  'diasEsperaHoy', 'diasEsperaGenerador', 'licenciasMesHoy', 'licenciasMesGenerador', 'iaPorScormUsd'] as const;
const numero = (v: unknown, defecto: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : defecto);

/** Completa lo guardado con el ejemplo: campos que faltan y las 8 etapas en su orden (las desconocidas se ignoran). */
export function normalizarParametros(datos: unknown): ParametrosNegocio {
  const d = (datos && typeof datos === 'object' ? datos : {}) as Record<string, unknown>;
  const p = { ...PARAMETROS_EJEMPLO } as ParametrosNegocio;
  for (const c of CAMPOS_NUMERO) p[c] = numero(d[c], PARAMETROS_EJEMPLO[c]);
  const guardadas = new Map((Array.isArray(d.etapas) ? d.etapas : []).filter((e): e is HorasEtapa => Boolean(e && typeof e === 'object')).map((e) => [e.etapa, e]));
  p.etapas = PARAMETROS_EJEMPLO.etapas.map((e) => {
    const g = guardadas.get(e.etapa);
    return { etapa: e.etapa, horasHoy: numero(g?.horasHoy, e.horasHoy), horasGenerador: numero(g?.horasGenerador, e.horasGenerador) };
  });
  return p;
}

export interface Medicion { proyectoRef: string; proyectoId?: string | null; escenario: string; etapa: string; horas: number }

/** Proyecto al que pertenece una medición: su id en la herramienta o su nombre sin mayúsculas ni espacios de más. */
export const claveProyecto = (m: Pick<Medicion, 'proyectoRef' | 'proyectoId'>) => m.proyectoId ?? m.proyectoRef.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Promedio de horas por etapa de cada escenario: cada proyecto suma sus horas por etapa y se divide entre los proyectos
 * medidos de ese escenario (una etapa que un proyecto no registró cuenta 0). null si el escenario no tiene mediciones.
 */
export function promediosMedidos(mediciones: Medicion[]): Record<Escenario, { proyectos: number; horas: Record<EtapaNegocio, number> } | null> {
  const r = {} as Record<Escenario, { proyectos: number; horas: Record<EtapaNegocio, number> } | null>;
  for (const esc of ESCENARIOS) {
    const de = mediciones.filter((m) => m.escenario === esc && (CLAVES_ETAPA as readonly string[]).includes(m.etapa));
    const proyectos = new Set(de.map(claveProyecto)).size;
    if (!proyectos) { r[esc] = null; continue; }
    const horas = Object.fromEntries(CLAVES_ETAPA.map((e) => [e, 0])) as Record<EtapaNegocio, number>;
    for (const m of de) horas[m.etapa as EtapaNegocio] += m.horas;
    for (const e of CLAVES_ETAPA) horas[e] = horas[e] / proyectos;
    r[esc] = { proyectos, horas };
  }
  return r;
}

export interface Rentabilidad {
  fuente: FuenteRentabilidad;
  etapas: (HorasEtapa & { nombre: string })[];
  horasHoy: number;
  horasGenerador: number;
  diasHoy: number;
  diasGenerador: number;
  scormMesHoy: number;
  scormMesGenerador: number;
  costoHoy: number;
  costoGenerador: number;
  margenCompetenciaHoy: number;
  margenCompetenciaGenerador: number;
  margenPrecioNuevo: number;
  /** Proyectos medidos de cada escenario (0 con supuestos). */
  proyectosMedidos: Record<Escenario, number>;
  /** De dónde salen las horas de cada escenario: con «mediciones», un escenario sin mediciones usa los supuestos. */
  respaldo: Record<Escenario, FuenteRentabilidad>;
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

/** RN-13-1, hoy frente a con el generador. Las divisiones entre cero dan 0 (sin horas no hay SCORM al mes que repartir). */
export function calcularRentabilidad(parametros: ParametrosNegocio, fuente: FuenteRentabilidad = 'supuestos', mediciones: Medicion[] = []): Rentabilidad {
  const p = normalizarParametros(parametros);
  const medidos = fuente === 'mediciones' ? promediosMedidos(mediciones) : { hoy: null, generador: null };
  const etapas = p.etapas.map((e) => ({
    etapa: e.etapa, nombre: NOMBRE_ETAPA[e.etapa as EtapaNegocio],
    horasHoy: medidos.hoy ? medidos.hoy.horas[e.etapa as EtapaNegocio] : e.horasHoy,
    horasGenerador: medidos.generador ? medidos.generador.horas[e.etapa as EtapaNegocio] : e.horasGenerador,
  }));
  const horasHoy = etapas.reduce((s, e) => s + e.horasHoy, 0);
  const horasGenerador = etapas.reduce((s, e) => s + e.horasGenerador, 0);
  const horasDiaEquipo = p.personas * p.horasProductivasDia;
  const capacidad = horasDiaEquipo * DIAS_HABILES_MES;
  const scormMesHoy = div(capacidad, horasHoy);
  const scormMesGenerador = div(capacidad, horasGenerador);
  // Sin SCORM al mes, las licencias del mes no se reparten (cuentan enteras).
  const reparto = (licencias: number, scormMes: number) => (scormMes > 0 ? licencias / scormMes : licencias);
  const costoHoy = horasHoy * p.tarifaHora + reparto(p.licenciasMesHoy, scormMesHoy);
  const costoGenerador = horasGenerador * p.tarifaHora + p.iaPorScormUsd * p.tipoCambio + reparto(p.licenciasMesGenerador, scormMesGenerador);
  const margen = (precio: number, costo: number) => div(precio - costo, precio);
  return {
    fuente, etapas, horasHoy, horasGenerador,
    diasHoy: div(horasHoy, horasDiaEquipo) + p.diasEsperaHoy,
    diasGenerador: div(horasGenerador, horasDiaEquipo) + p.diasEsperaGenerador,
    scormMesHoy, scormMesGenerador, costoHoy, costoGenerador,
    margenCompetenciaHoy: margen(p.precioCompetencia, costoHoy),
    margenCompetenciaGenerador: margen(p.precioCompetencia, costoGenerador),
    margenPrecioNuevo: margen(p.precioNuevo, costoGenerador),
    proyectosMedidos: { hoy: medidos.hoy?.proyectos ?? 0, generador: medidos.generador?.proyectos ?? 0 },
    respaldo: { hoy: medidos.hoy ? 'mediciones' : 'supuestos', generador: medidos.generador ? 'mediciones' : 'supuestos' },
  };
}
