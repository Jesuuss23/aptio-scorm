/**
 * HU-1704 · Stripe (código `stripe`, dólares, RN-18-9). El visitante paga en Stripe Checkout (página alojada por Stripe,
 * alcance PCI SAQ A): `crearPago` abre una sesión de pago único con la solicitud en `client_reference_id` y devuelve su
 * URL. Stripe confirma con el evento `checkout.session.completed` (o `async_payment_succeeded`) firmado en la cabecera
 * `Stripe-Signature` (`t=<segundos>,v1=<HMAC-SHA256 hex de "t.cuerpo">`, con 5 minutos de tolerancia), según su
 * documentación pública. Sin llaves de sandbox, se prueba con eventos firmados de ejemplo (SUP-294).
 *
 * Variables (por modo, `PRUEBAS` o `PRODUCCION`): `STRIPE_LLAVE_SECRETA_<MODO>` y `STRIPE_SECRETO_WEBHOOK_<MODO>`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ModoPasarela } from '@aptio/schema/pasarelas';
import { centimos } from '@aptio/schema/suscripciones';
import {
  type Cabeceras, cabecera, type DatosPago, ErrorPasarela, type EventoLeido, type Fetch, ID_EVENTO, jsonDe, motivoDe, objeto, type Pasarela, type PagoCreado, type Reembolso, sufijoModo, UUID,
} from './contrato.js';

export const API_STRIPE = 'https://api.stripe.com/v1';
export const CABECERA_FIRMA_STRIPE = 'stripe-signature';
export const TOLERANCIA_STRIPE_S = 300;

/** Firma como Stripe: `t=<segundos>,v1=<hex>` (para las pruebas y para verificar). */
export function firmarStripe(secreto: string, cuerpo: Buffer | string, segundos: number): string {
  const v1 = createHmac('sha256', secreto).update(`${segundos}.`).update(cuerpo).digest('hex');
  return `t=${segundos},v1=${v1}`;
}

/** Verifica `Stripe-Signature`: alguna firma `v1` coincide en tiempo constante y la marca de tiempo está dentro de la tolerancia. */
export function firmaStripeValida(secreto: string, cuerpo: Buffer, recibida: string | undefined, ahora: Date, toleranciaS = TOLERANCIA_STRIPE_S): boolean {
  if (!recibida || !secreto) return false;
  const partes = recibida.split(',').map((p) => p.trim().split('='));
  const t = Number(partes.find(([k]) => k === 't')?.[1]);
  const firmas = partes.filter(([k, v]) => k === 'v1' && v).map(([, v]) => v!);
  if (!Number.isInteger(t) || !firmas.length || Math.abs(ahora.getTime() / 1000 - t) > toleranciaS) return false;
  const esperada = Buffer.from(createHmac('sha256', secreto).update(`${t}.`).update(cuerpo).digest('hex'));
  return firmas.some((f) => {
    const b = Buffer.from(f);
    return b.length === esperada.length && timingSafeEqual(b, esperada);
  });
}

const APROBADOS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const RECHAZOS: Record<string, string> = {
  'checkout.session.async_payment_failed': 'Stripe no pudo completar el pago',
  'checkout.session.expired': 'La sesión de pago de Stripe venció sin pagarse',
};

/** Lee un evento de Stripe. Los que no son del pago de una sesión se ignoran (Stripe manda muchos tipos). */
export function leerEventoStripe(cuerpo: Buffer): EventoLeido {
  const e = jsonDe(cuerpo);
  if (!e || typeof e.id !== 'string' || !ID_EVENTO.test(e.id) || typeof e.type !== 'string') return { tipo: 'invalido' };
  const aprobado = APROBADOS.has(e.type);
  if (!aprobado && !(e.type in RECHAZOS)) return { tipo: 'ignorado' };
  const s = objeto(objeto(e.data).object);
  const solicitudId = typeof s.client_reference_id === 'string' ? s.client_reference_id : objeto(s.metadata).solicitudId;
  if (typeof solicitudId !== 'string' || !UUID.test(solicitudId)) return { tipo: 'invalido' };
  // Una sesión completada con un medio asíncrono todavía no está pagada: llega después `async_payment_succeeded`.
  if (aprobado && s.payment_status !== 'paid') return { tipo: 'ignorado' };
  const monto = typeof s.amount_total === 'number' ? s.amount_total / 100 : null;
  const moneda = typeof s.currency === 'string' && s.currency.toUpperCase() === 'USD' ? 'USD' : typeof s.currency === 'string' && s.currency.toUpperCase() === 'PEN' ? 'PEN' : null;
  return {
    tipo: 'evento',
    evento: {
      eventoId: e.id, solicitudId: solicitudId.toLowerCase(), resultado: aprobado ? 'aprobado' : 'rechazado', ultimos4: null, motivo: aprobado ? null : RECHAZOS[e.type]!,
      referencia: typeof s.payment_intent === 'string' ? s.payment_intent : null, monto, moneda,
    },
  };
}

/** Cuerpo `application/x-www-form-urlencoded` con la notación de corchetes de la API de Stripe. */
export const formulario = (campos: Record<string, string | number>) => new URLSearchParams(Object.entries(campos).map(([k, v]) => [k, String(v)])).toString();

export class PasarelaStripe implements Pasarela {
  readonly codigo = 'stripe' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly http: Fetch = fetch) {}

  private llaves(modo: ModoPasarela) {
    const s = sufijoModo(modo);
    return { secreta: this.env[`STRIPE_LLAVE_SECRETA_${s}`] ?? '', webhook: this.env[`STRIPE_SECRETO_WEBHOOK_${s}`] ?? '', nombres: [`STRIPE_LLAVE_SECRETA_${s}`, `STRIPE_SECRETO_WEBHOOK_${s}`] };
  }

  variablesFaltantes(modo: ModoPasarela): string[] {
    const k = this.llaves(modo);
    return k.nombres.filter((_, i) => !(i === 0 ? k.secreta : k.webhook));
  }

  private async llamar(modo: ModoPasarela, ruta: string, campos: Record<string, string | number>, idempotencia: string): Promise<Record<string, unknown>> {
    let r: Response;
    try {
      r = await this.http(`${API_STRIPE}${ruta}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.llaves(modo).secreta}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencia },
        body: formulario(campos),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new ErrorPasarela(`Stripe no respondió: ${e instanceof Error ? e.message : String(e)}`);
    }
    const d = objeto(await r.json().catch(() => ({})));
    if (!r.ok) throw new ErrorPasarela(`Stripe respondió ${r.status}`, motivoDe(objeto(d.error).message));
    return d;
  }

  async crearPago(modo: ModoPasarela, p: DatosPago): Promise<PagoCreado> {
    const d = await this.llamar(modo, '/checkout/sessions', {
      mode: 'payment', client_reference_id: p.solicitudId, customer_email: p.correo, success_url: p.urlExito, cancel_url: p.urlCancelado,
      'metadata[solicitudId]': p.solicitudId, 'payment_intent_data[metadata][solicitudId]': p.solicitudId,
      'line_items[0][quantity]': 1, 'line_items[0][price_data][currency]': p.moneda.toLowerCase(), 'line_items[0][price_data][unit_amount]': centimos(p.monto),
      'line_items[0][price_data][product_data][name]': p.descripcion,
    }, `checkout-${p.solicitudId}`);
    if (typeof d.url !== 'string' || !d.url.startsWith('https://') || typeof d.id !== 'string') throw new ErrorPasarela('Stripe no devolvió la página de pago');
    return { tipo: 'redireccion', url: d.url, referencia: d.id };
  }

  verificarFirmaWebhook(modo: ModoPasarela, cuerpo: Buffer, cabeceras: Cabeceras, ahora: Date): boolean {
    return firmaStripeValida(this.llaves(modo).webhook, cuerpo, cabecera(cabeceras, CABECERA_FIRMA_STRIPE), ahora);
  }

  leerEvento(cuerpo: Buffer): EventoLeido {
    return leerEventoStripe(cuerpo);
  }

  async reembolsar(modo: ModoPasarela, r: Reembolso): Promise<{ reembolsoId: string }> {
    const d = await this.llamar(modo, '/refunds', { payment_intent: r.referencia, amount: centimos(r.monto) }, `reembolso-${r.idempotencia}`);
    if (typeof d.id !== 'string' || d.status === 'failed' || d.status === 'canceled') throw new ErrorPasarela('Stripe no completó el reembolso', motivoDe(d.failure_reason));
    return { reembolsoId: d.id };
  }
}
