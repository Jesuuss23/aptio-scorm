/**
 * HU-1704 · El contrato común de las pasarelas de pago (REQ-084, REQ-110, RN-18-3). Cada pasarela sabe cuatro cosas:
 * - `crearPago`: preparar el cobro de una solicitud. La tarjeta nunca pasa por Aptio SCORM: se paga en la página alojada
 *   de la pasarela (Stripe Checkout) o en su formulario incrustado (Culqi Checkout), que devuelve un token de un solo uso;
 * - `verificarFirmaWebhook`: comprobar la firma del evento sobre el cuerpo tal como llegó;
 * - `leerEvento`: traducir el evento al formato común (aprobado o rechazado), o ignorarlo si no es de pago;
 * - `reembolsar`: devolver un cobro.
 *
 * Las llaves viven solo en variables de entorno, con un juego por modo (`*_PRUEBAS` y `*_PRODUCCION`).
 */
import type { CodigoPasarela, ModoPasarela } from '@aptio/schema/pasarelas';
import type { EventoPago, Moneda } from '@aptio/schema/suscripciones';

export type Cabeceras = Record<string, string | string[] | undefined>;
export type Fetch = typeof fetch;

export interface DatosPago {
  solicitudId: string;
  /** Con IGV, en la moneda del cobro. */
  monto: number;
  moneda: Moneda;
  descripcion: string;
  correo: string;
  /** Adónde vuelve el visitante después de pagar o de cancelar en la página alojada. */
  urlExito: string;
  urlCancelado: string;
  /** El token de un solo uso del formulario incrustado (Culqi). */
  token?: string;
}

export type PagoCreado =
  /** La pasarela de pruebas: el formulario simulado de `/pago`. */
  | { tipo: 'simulado' }
  /** La página alojada de la pasarela (Stripe Checkout). */
  | { tipo: 'redireccion'; url: string; referencia: string }
  /** El formulario incrustado de la pasarela (Culqi Checkout): con la llave pública, nunca la secreta. */
  | { tipo: 'formulario'; llavePublica: string; montoCentimos: number; moneda: Moneda; descripcion: string }
  /** El cargo con el token ya se envió: la confirmación llega por el webhook. */
  | { tipo: 'enviado'; referencia: string };

export type EventoLeido = { tipo: 'evento'; evento: EventoPago } | { tipo: 'ignorado' } | { tipo: 'invalido' };

export interface Reembolso { referencia: string; monto: number; moneda: Moneda; /** Clave de idempotencia (el id del cobro). */ idempotencia: string }

export interface Pasarela {
  readonly codigo: CodigoPasarela;
  /** Las variables de entorno que faltan para operar en ese modo (los nombres, nunca los valores). */
  variablesFaltantes(modo: ModoPasarela): string[];
  crearPago(modo: ModoPasarela, datos: DatosPago): Promise<PagoCreado>;
  verificarFirmaWebhook(modo: ModoPasarela, cuerpo: Buffer, cabeceras: Cabeceras, ahora: Date): boolean;
  leerEvento(cuerpo: Buffer): EventoLeido;
  reembolsar(modo: ModoPasarela, r: Reembolso): Promise<{ reembolsoId: string }>;
}

/** La pasarela no respondió o rechazó la operación. `motivo` se puede mostrar al visitante. */
export class ErrorPasarela extends Error {
  constructor(mensaje: string, readonly motivo: string | null = null) {
    super(mensaje);
  }
}

/** El sufijo de las variables de cada modo. */
export const sufijoModo = (modo: ModoPasarela) => (modo === 'produccion' ? 'PRODUCCION' : 'PRUEBAS');

export const cabecera = (c: Cabeceras, nombre: string): string | undefined => {
  const v = c[nombre.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/** El JSON del cuerpo, o null si no es un objeto. */
export function jsonDe(cuerpo: Buffer): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(cuerpo.toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ID_EVENTO = /^[\w.:-]{1,120}$/;

/** Texto plano corto que la pasarela manda como motivo (nunca se interpreta como HTML). */
export const motivoDe = (v: unknown): string | null => (typeof v === 'string' && v.trim() && !/[<>]/.test(v) ? v.trim().slice(0, 200) : null);
