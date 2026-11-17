/**
 * HU-1704 · Culqi (código `culqi`, soles). La tarjeta se escribe en Culqi Checkout, el formulario incrustado de Culqi
 * (su script y su ventana, fuera de nuestra página), que devuelve un token de un solo uso; con ese token la API crea el
 * cargo (`POST /v2/charges`, en céntimos y con la solicitud en `metadata`). El pago se confirma solo por el webhook.
 *
 * SUP-294 · El formato de firma del webhook de Culqi está por confirmar en su sandbox antes de producción. Supuesto:
 * HMAC-SHA256 en hexadecimal del cuerpo tal como llega, en la cabecera `X-Culqi-Signature`, con el secreto del webhook.
 * Si Culqi firma de otra forma, solo cambian `firmarCulqi` y `firmaCulqiValida`. Los eventos esperados son
 * `charge.creation.succeeded` y `charge.creation.failed`, con el cargo en `data` (objeto o JSON en texto).
 *
 * Variables (por modo): `CULQI_LLAVE_PUBLICA_<MODO>`, `CULQI_LLAVE_SECRETA_<MODO>` y `CULQI_SECRETO_WEBHOOK_<MODO>`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ModoPasarela } from '@aptio/schema/pasarelas';
import { centimos } from '@aptio/schema/suscripciones';
import {
  type Cabeceras, cabecera, type DatosPago, ErrorPasarela, type EventoLeido, type Fetch, ID_EVENTO, jsonDe, motivoDe, objeto, type Pasarela, type PagoCreado, type Reembolso, sufijoModo, UUID,
} from './contrato.js';

export const API_CULQI = 'https://api.culqi.com/v2';
export const CABECERA_FIRMA_CULQI = 'x-culqi-signature';
/** Un token de Culqi Checkout (`tkn_test_…` o `tkn_live_…`). */
export const TOKEN_CULQI = /^tkn_(test|live)_[A-Za-z0-9]{8,64}$/;

export const firmarCulqi = (secreto: string, cuerpo: Buffer | string) => createHmac('sha256', secreto).update(cuerpo).digest('hex');

export function firmaCulqiValida(secreto: string, cuerpo: Buffer, recibida: string | undefined): boolean {
  if (!recibida || !secreto) return false;
  const a = Buffer.from(firmarCulqi(secreto, cuerpo));
  const b = Buffer.from(recibida.trim().replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Los 4 últimos dígitos de la tarjeta enmascarada que devuelve Culqi (`411111******1111`); nunca el número completo. */
export function ultimos4Culqi(fuente: Record<string, unknown>): string | null {
  for (const v of [fuente.last_four, fuente.card_number]) if (typeof v === 'string' && /\d{4}$/.test(v)) return v.slice(-4);
  return null;
}

export function leerEventoCulqi(cuerpo: Buffer): EventoLeido {
  const e = jsonDe(cuerpo);
  if (!e || typeof e.id !== 'string' || !ID_EVENTO.test(e.id) || typeof e.type !== 'string') return { tipo: 'invalido' };
  if (e.type !== 'charge.creation.succeeded' && e.type !== 'charge.creation.failed') return { tipo: 'ignorado' };
  let datos: unknown = e.data;
  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch {
      return { tipo: 'invalido' };
    }
  }
  const c = objeto(datos);
  const solicitudId = objeto(c.metadata).solicitudId;
  if (typeof solicitudId !== 'string' || !UUID.test(solicitudId)) return { tipo: 'invalido' };
  const aprobado = e.type === 'charge.creation.succeeded';
  return {
    tipo: 'evento',
    evento: {
      eventoId: e.id, solicitudId: solicitudId.toLowerCase(), resultado: aprobado ? 'aprobado' : 'rechazado', ultimos4: ultimos4Culqi(objeto(c.source)),
      motivo: aprobado ? null : (motivoDe(objeto(c.outcome).user_message) ?? 'Culqi rechazó el pago'),
      referencia: typeof c.id === 'string' ? c.id : null, monto: typeof c.amount === 'number' ? c.amount / 100 : null, moneda: c.currency_code === 'PEN' ? 'PEN' : c.currency_code === 'USD' ? 'USD' : null,
    },
  };
}

export class PasarelaCulqi implements Pasarela {
  readonly codigo = 'culqi' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly http: Fetch = fetch) {}

  private llaves(modo: ModoPasarela) {
    const s = sufijoModo(modo);
    const nombres = [`CULQI_LLAVE_PUBLICA_${s}`, `CULQI_LLAVE_SECRETA_${s}`, `CULQI_SECRETO_WEBHOOK_${s}`] as const;
    return { publica: this.env[nombres[0]] ?? '', secreta: this.env[nombres[1]] ?? '', webhook: this.env[nombres[2]] ?? '', nombres };
  }

  variablesFaltantes(modo: ModoPasarela): string[] {
    const k = this.llaves(modo);
    return k.nombres.filter((n) => !this.env[n]);
  }

  private async llamar(modo: ModoPasarela, ruta: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    let r: Response;
    try {
      r = await this.http(`${API_CULQI}${ruta}`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.llaves(modo).secreta}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new ErrorPasarela(`Culqi no respondió: ${e instanceof Error ? e.message : String(e)}`);
    }
    const d = objeto(await r.json().catch(() => ({})));
    if (!r.ok) throw new ErrorPasarela(`Culqi respondió ${r.status}`, motivoDe(d.user_message));
    return d;
  }

  async crearPago(modo: ModoPasarela, p: DatosPago): Promise<PagoCreado> {
    if (!p.token) return { tipo: 'formulario', llavePublica: this.llaves(modo).publica, montoCentimos: centimos(p.monto), moneda: p.moneda, descripcion: p.descripcion };
    if (!TOKEN_CULQI.test(p.token)) throw new ErrorPasarela('El token de Culqi no tiene la forma esperada', 'El pago no se pudo iniciar: vuelve a intentarlo');
    const d = await this.llamar(modo, '/charges', {
      amount: centimos(p.monto), currency_code: p.moneda, email: p.correo, source_id: p.token, description: p.descripcion.slice(0, 80), metadata: { solicitudId: p.solicitudId },
    });
    if (typeof d.id !== 'string') throw new ErrorPasarela('Culqi no devolvió el cargo');
    return { tipo: 'enviado', referencia: d.id };
  }

  verificarFirmaWebhook(modo: ModoPasarela, cuerpo: Buffer, cabeceras: Cabeceras): boolean {
    return firmaCulqiValida(this.llaves(modo).webhook, cuerpo, cabecera(cabeceras, CABECERA_FIRMA_CULQI));
  }

  leerEvento(cuerpo: Buffer): EventoLeido {
    return leerEventoCulqi(cuerpo);
  }

  async reembolsar(modo: ModoPasarela, r: Reembolso): Promise<{ reembolsoId: string }> {
    const d = await this.llamar(modo, '/refunds', { amount: centimos(r.monto), charge_id: r.referencia, reason: 'solicitud_comprador' });
    if (typeof d.id !== 'string') throw new ErrorPasarela('Culqi no devolvió el reembolso');
    return { reembolsoId: d.id };
  }
}
