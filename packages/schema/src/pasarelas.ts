/**
 * HU-1704 · Pasarelas de pago intercambiables (REQ-084, RN-18-3, RN-18-9). Reglas puras, las mismas en la API, la web y
 * las pruebas:
 * - el catálogo: `pruebas` (simulada, solo en el entorno de pruebas, soles y dólares), `culqi` (soles) y `stripe` (dólares);
 * - validar un cambio (nombre, mostrar/ocultar y modo) y el orden;
 * - elegir la pasarela que cobra una moneda: la primera visible y activa, en orden, que cobra en esa moneda;
 * - las monedas que se pueden ofrecer en el pago.
 *
 * La configuración no guarda llaves ni secretos: viven solo en variables de entorno, y «activa» = sus variables están.
 */
import { esTextoPlano, type ErrorCampo } from './sitio-contenido.js';

export type { ErrorCampo };
import type { Moneda } from './suscripciones.js';

export const CODIGOS_PASARELA = ['pruebas', 'culqi', 'stripe'] as const;
export type CodigoPasarela = (typeof CODIGOS_PASARELA)[number];
export const esCodigoPasarela = (v: unknown): v is CodigoPasarela => typeof v === 'string' && (CODIGOS_PASARELA as readonly string[]).includes(v);
export const MODOS_PASARELA = ['pruebas', 'produccion'] as const;
export type ModoPasarela = (typeof MODOS_PASARELA)[number];
export const LIMITE_NOMBRE_PASARELA = 40;

export interface FichaPasarela {
  /** Nombre por defecto. */
  nombre: string;
  monedas: readonly Moneda[];
  /** La simulada: no existe en el entorno de producción y no admite el modo producción. */
  simulada: boolean;
  /** Cómo cobra: con un formulario simulado, redirigiendo a la página alojada o con el formulario incrustado de la pasarela. */
  flujo: 'simulado' | 'redireccion' | 'formulario';
}

export const CATALOGO_PASARELAS: Readonly<Record<CodigoPasarela, FichaPasarela>> = {
  pruebas: { nombre: 'Pasarela de pruebas', monedas: ['PEN', 'USD'], simulada: true, flujo: 'simulado' },
  culqi: { nombre: 'Culqi', monedas: ['PEN'], simulada: false, flujo: 'formulario' },
  stripe: { nombre: 'Stripe', monedas: ['USD'], simulada: false, flujo: 'redireccion' },
};

export interface ConfigPasarela { codigo: CodigoPasarela; nombre: string; visible: boolean; orden: number; modo: ModoPasarela }

/** Al estrenar: la simulada visible; las reales ocultas y en modo pruebas hasta tener sus llaves. */
export const PASARELAS_POR_DEFECTO: readonly ConfigPasarela[] = [
  { codigo: 'pruebas', nombre: CATALOGO_PASARELAS.pruebas.nombre, visible: true, orden: 0, modo: 'pruebas' },
  { codigo: 'culqi', nombre: CATALOGO_PASARELAS.culqi.nombre, visible: false, orden: 1, modo: 'pruebas' },
  { codigo: 'stripe', nombre: CATALOGO_PASARELAS.stripe.nombre, visible: false, orden: 2, modo: 'pruebas' },
];

/** Valida un cambio parcial (PATCH): nombre de 1 a 40 caracteres en texto plano, visible verdadero o falso y el modo. */
export function validarCambioPasarela(codigo: CodigoPasarela, v: unknown): ErrorCampo[] {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const e: ErrorCampo[] = [];
  if (o.nombre !== undefined) {
    const t = typeof o.nombre === 'string' ? o.nombre.trim() : '';
    if (!t || t.length > LIMITE_NOMBRE_PASARELA) e.push({ campo: 'nombre', mensaje: `El nombre va de 1 a ${LIMITE_NOMBRE_PASARELA} caracteres` });
    else if (!esTextoPlano(t)) e.push({ campo: 'nombre', mensaje: 'El nombre solo admite texto, sin etiquetas HTML' });
  }
  if (o.visible !== undefined && typeof o.visible !== 'boolean') e.push({ campo: 'visible', mensaje: 'Debe ser verdadero o falso' });
  if (o.modo !== undefined) {
    if (!(MODOS_PASARELA as readonly unknown[]).includes(o.modo)) e.push({ campo: 'modo', mensaje: 'El modo es pruebas o produccion' });
    else if (o.modo === 'produccion' && CATALOGO_PASARELAS[codigo].simulada) e.push({ campo: 'modo', mensaje: 'La pasarela de pruebas no cobra de verdad: solo admite el modo pruebas' });
  }
  return e;
}

/** El orden nuevo lleva cada pasarela una vez. */
export function validarOrdenPasarelas(codigos: unknown): ErrorCampo[] {
  const ok = Array.isArray(codigos) && codigos.length === CODIGOS_PASARELA.length && new Set(codigos).size === codigos.length && codigos.every(esCodigoPasarela);
  return ok ? [] : [{ campo: 'codigos', mensaje: `El orden lleva todas las pasarelas una vez: ${CODIGOS_PASARELA.join(', ')}` }];
}

/** Por orden y, a igual orden, como en el catálogo. */
export const ordenarPasarelas = <T extends Pick<ConfigPasarela, 'codigo' | 'orden'>>(c: readonly T[]): T[] =>
  [...c].sort((a, b) => a.orden - b.orden || CODIGOS_PASARELA.indexOf(a.codigo) - CODIGOS_PASARELA.indexOf(b.codigo));

/** Completa la configuración guardada con la de por defecto para las pasarelas que todavía no tienen fila. */
export function completarPasarelas(guardadas: readonly ConfigPasarela[]): ConfigPasarela[] {
  const por = new Map(guardadas.filter((c) => esCodigoPasarela(c.codigo)).map((c) => [c.codigo, c]));
  return ordenarPasarelas(PASARELAS_POR_DEFECTO.map((d) => por.get(d.codigo) ?? d));
}

/**
 * La pasarela que cobra una moneda: la primera visible y activa (`activa(codigo)`: sus variables de entorno están y el
 * entorno la admite), en orden, que cobra en esa moneda. Null si no hay ninguna.
 */
export function elegirPasarela(moneda: Moneda, configs: readonly ConfigPasarela[], activa: (c: CodigoPasarela) => boolean): CodigoPasarela | null {
  return ordenarPasarelas(configs).find((c) => c.visible && activa(c.codigo) && CATALOGO_PASARELAS[c.codigo].monedas.includes(moneda))?.codigo ?? null;
}

/** Las monedas que alguna pasarela visible y activa puede cobrar, en el orden PEN, USD. */
export function monedasConPasarela(configs: readonly ConfigPasarela[], activa: (c: CodigoPasarela) => boolean): Moneda[] {
  return (['PEN', 'USD'] as const).filter((m) => elegirPasarela(m, configs, activa) !== null);
}
