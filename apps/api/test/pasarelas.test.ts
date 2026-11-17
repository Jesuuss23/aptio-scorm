// HU-1704 · Firma y lectura de eventos de cada pasarela con ejemplos firmados (REQ-084, REQ-110, CP-145), y las llamadas
// a Stripe y Culqi con un `fetch` simulado (no sale a internet). Los formatos de Stripe siguen su documentación pública;
// el de la firma de Culqi es un supuesto a confirmar en su sandbox (SUP-294).
import { describe, expect, it } from 'vitest';
import { PasarelaCulqi, firmaCulqiValida, firmarCulqi, leerEventoCulqi, ultimos4Culqi } from '../src/ventas/pasarelas/culqi.js';
import { ErrorPasarela, type Fetch } from '../src/ventas/pasarelas/contrato.js';
import { firmar, firmaValida, PasarelaPruebas } from '../src/ventas/pasarelas/pruebas.js';
import { firmaStripeValida, firmarStripe, leerEventoStripe, PasarelaStripe } from '../src/ventas/pasarelas/stripe.js';

const SOL = '0f8fad5b-d9cb-469f-a165-70867728950e';
const json = (o: unknown) => Buffer.from(JSON.stringify(o));
const AHORA = new Date('2026-11-17T15:00:00.000Z');
const T = Math.floor(AHORA.getTime() / 1000);

/** Un `fetch` que guarda las llamadas y responde lo que se le diga. */
function falso(respuesta: { status?: number; cuerpo: unknown } | Error) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    if (respuesta instanceof Error) throw respuesta;
    return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as Fetch;
  return { http, llamadas };
}

describe('pruebas', () => {
  const p = new PasarelaPruebas({ PAGO_PRUEBA_SECRETO: 's3creto' });
  const cuerpo = json({ id: 'evt_1', tipo: 'pago.aprobado', solicitudId: SOL, ultimos4: '1111', monto: 1522.2, moneda: 'PEN' });
  it('verifica `X-Aptio-Firma` sobre los bytes tal como llegan', () => {
    expect(p.verificarFirmaWebhook('pruebas', cuerpo, { 'x-aptio-firma': firmar('s3creto', cuerpo) })).toBe(true);
    expect(p.verificarFirmaWebhook('pruebas', cuerpo, { 'x-aptio-firma': firmar('otro', cuerpo) })).toBe(false);
    expect(p.verificarFirmaWebhook('pruebas', cuerpo, {})).toBe(false);
    expect(firmaValida('s3creto', Buffer.from(`${cuerpo.toString()} `), firmar('s3creto', cuerpo))).toBe(false);
  });
  it('lee el evento común con monto, moneda y referencia; no necesita variables', async () => {
    expect(p.leerEvento(cuerpo)).toEqual({ tipo: 'evento', evento: { eventoId: 'evt_1', solicitudId: SOL, resultado: 'aprobado', ultimos4: '1111', motivo: null, referencia: 'evt_1', monto: 1522.2, moneda: 'PEN' } });
    expect(p.leerEvento(Buffer.from('no es json')).tipo).toBe('invalido');
    expect(p.variablesFaltantes('produccion')).toEqual([]);
    expect(await p.crearPago()).toEqual({ tipo: 'simulado' });
    expect(await p.reembolsar('pruebas', { referencia: 'evt_1', monto: 1, moneda: 'PEN', idempotencia: 'c1' })).toEqual({ reembolsoId: 'prueba_reembolso_c1' });
  });
});

describe('stripe', () => {
  const SECRETO = 'whsec_ejemplo_de_pruebas';
  const sesion = (tipo: string, extra: Record<string, unknown> = {}) => json({
    id: 'evt_1Q2w3E4r', type: tipo,
    data: { object: { id: 'cs_test_a1', object: 'checkout.session', client_reference_id: SOL, payment_status: 'paid', payment_intent: 'pi_3Q2w3E', amount_total: 41182, currency: 'usd', metadata: { solicitudId: SOL }, ...extra } },
  });

  it('acepta `Stripe-Signature` con t y v1 válidos dentro de 5 minutos', () => {
    const c = sesion('checkout.session.completed');
    expect(firmaStripeValida(SECRETO, c, firmarStripe(SECRETO, c, T), AHORA)).toBe(true);
    // Varias v1 (rotación del secreto): basta una.
    expect(firmaStripeValida(SECRETO, c, `t=${T},v1=${'0'.repeat(64)},v1=${firmarStripe(SECRETO, c, T).split('v1=')[1]}`, AHORA)).toBe(true);
  });
  it('CP-145 · rechaza otro secreto, otro cuerpo, una marca vieja o una cabecera incompleta', () => {
    const c = sesion('checkout.session.completed');
    expect(firmaStripeValida(SECRETO, c, firmarStripe('whsec_otro', c, T), AHORA)).toBe(false);
    expect(firmaStripeValida(SECRETO, sesion('checkout.session.completed', { amount_total: 1 }), firmarStripe(SECRETO, c, T), AHORA)).toBe(false);
    expect(firmaStripeValida(SECRETO, c, firmarStripe(SECRETO, c, T - 301), AHORA)).toBe(false);
    expect(firmaStripeValida(SECRETO, c, `t=${T}`, AHORA)).toBe(false);
    expect(firmaStripeValida(SECRETO, c, undefined, AHORA)).toBe(false);
    expect(firmaStripeValida('', c, firmarStripe('', c, T), AHORA)).toBe(false);
  });
  it('lee el pago aprobado sin datos de tarjeta, con el payment intent como referencia y el monto en dólares', () => {
    expect(leerEventoStripe(sesion('checkout.session.completed'))).toEqual({
      tipo: 'evento', evento: { eventoId: 'evt_1Q2w3E4r', solicitudId: SOL, resultado: 'aprobado', ultimos4: null, motivo: null, referencia: 'pi_3Q2w3E', monto: 411.82, moneda: 'USD' },
    });
    expect(leerEventoStripe(sesion('checkout.session.async_payment_succeeded'))).toMatchObject({ evento: { resultado: 'aprobado' } });
  });
  it('rechazo por pago asíncrono fallido o sesión vencida; ignora la sesión sin pagar y otros tipos; inválido sin solicitud', () => {
    expect(leerEventoStripe(sesion('checkout.session.expired', { payment_status: 'unpaid' }))).toMatchObject({ evento: { resultado: 'rechazado', motivo: 'La sesión de pago de Stripe venció sin pagarse' } });
    expect(leerEventoStripe(sesion('checkout.session.async_payment_failed'))).toMatchObject({ evento: { resultado: 'rechazado' } });
    expect(leerEventoStripe(sesion('checkout.session.completed', { payment_status: 'unpaid' }))).toEqual({ tipo: 'ignorado' });
    expect(leerEventoStripe(sesion('payment_intent.created'))).toEqual({ tipo: 'ignorado' });
    expect(leerEventoStripe(sesion('checkout.session.completed', { client_reference_id: null, metadata: {} }))).toEqual({ tipo: 'invalido' });
    expect(leerEventoStripe(Buffer.from('[]'))).toEqual({ tipo: 'invalido' });
  });
  it('variables por modo: solo los nombres de las que faltan', () => {
    const p = new PasarelaStripe({ STRIPE_LLAVE_SECRETA_PRUEBAS: 'sk_test_x' });
    expect(p.variablesFaltantes('pruebas')).toEqual(['STRIPE_SECRETO_WEBHOOK_PRUEBAS']);
    expect(p.variablesFaltantes('produccion')).toEqual(['STRIPE_LLAVE_SECRETA_PRODUCCION', 'STRIPE_SECRETO_WEBHOOK_PRODUCCION']);
  });
  it('crea la sesión de Stripe Checkout en centavos, con la solicitud y una clave de idempotencia', async () => {
    const f = falso({ cuerpo: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } });
    const p = new PasarelaStripe({ STRIPE_LLAVE_SECRETA_PRUEBAS: 'sk_test_x', STRIPE_SECRETO_WEBHOOK_PRUEBAS: SECRETO }, f.http);
    const r = await p.crearPago('pruebas', { solicitudId: SOL, monto: 411.82, moneda: 'USD', descripcion: 'Aptio SCORM · Plan Productora (mensual)', correo: 'ana@minera.pe', urlExito: 'https://aptioscorm.com/pago?checkout=1', urlCancelado: 'https://aptioscorm.com/pago?cancelado=1' });
    expect(r).toEqual({ tipo: 'redireccion', url: 'https://checkout.stripe.com/c/pay/cs_test_a1', referencia: 'cs_test_a1' });
    const { url, init } = f.llamadas[0]!;
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_test_x', 'Idempotency-Key': `checkout-${SOL}` });
    const b = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(b)).toMatchObject({ mode: 'payment', client_reference_id: SOL, 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': '41182', 'metadata[solicitudId]': SOL });
  });
  it('reembolsa por el payment intent con el id del cobro como idempotencia; un error de Stripe es ErrorPasarela', async () => {
    const f = falso({ cuerpo: { id: 're_1', status: 'succeeded' } });
    const p = new PasarelaStripe({ STRIPE_LLAVE_SECRETA_PRUEBAS: 'sk_test_x' }, f.http);
    expect(await p.reembolsar('pruebas', { referencia: 'pi_3Q2w3E', monto: 411.82, moneda: 'USD', idempotencia: 'cobro-1' })).toEqual({ reembolsoId: 're_1' });
    expect(Object.fromEntries(new URLSearchParams(String(f.llamadas[0]!.init.body)))).toEqual({ payment_intent: 'pi_3Q2w3E', amount: '41182' });
    expect(f.llamadas[0]!.init.headers).toMatchObject({ 'Idempotency-Key': 'reembolso-cobro-1' });
    const mal = new PasarelaStripe({}, falso({ status: 400, cuerpo: { error: { message: 'Charge already refunded' } } }).http);
    await expect(mal.reembolsar('pruebas', { referencia: 'pi', monto: 1, moneda: 'USD', idempotencia: 'c' })).rejects.toMatchObject({ motivo: 'Charge already refunded' });
    await expect(new PasarelaStripe({}, falso(new Error('ECONNRESET')).http).reembolsar('pruebas', { referencia: 'pi', monto: 1, moneda: 'USD', idempotencia: 'c' })).rejects.toBeInstanceOf(ErrorPasarela);
  });
});

describe('culqi (formato de firma supuesto, SUP-294)', () => {
  const SECRETO = 'culqi-webhook-pruebas';
  const cargo = (tipo: string, extra: Record<string, unknown> = {}) => ({
    object: 'event', id: 'evt_test_Zx9', type: tipo,
    data: { object: 'charge', id: 'chr_test_Ab1', amount: 152220, currency_code: 'PEN', metadata: { solicitudId: SOL }, source: { card_number: '411111******1111' }, outcome: { type: 'venta_exitosa' }, ...extra },
  });
  it('verifica la firma HMAC del cuerpo y rechaza otra o ninguna', () => {
    const c = json(cargo('charge.creation.succeeded'));
    expect(firmaCulqiValida(SECRETO, c, firmarCulqi(SECRETO, c))).toBe(true);
    expect(firmaCulqiValida(SECRETO, c, `sha256=${firmarCulqi(SECRETO, c)}`)).toBe(true);
    expect(firmaCulqiValida(SECRETO, c, firmarCulqi('otro', c))).toBe(false);
    expect(firmaCulqiValida(SECRETO, c, undefined)).toBe(false);
    expect(new PasarelaCulqi({ CULQI_SECRETO_WEBHOOK_PRUEBAS: SECRETO }).verificarFirmaWebhook('pruebas', c, { 'x-culqi-signature': firmarCulqi(SECRETO, c) })).toBe(true);
  });
  it('lee el cargo aprobado con los 4 últimos de la tarjeta enmascarada (nunca el número), en soles', () => {
    expect(leerEventoCulqi(json(cargo('charge.creation.succeeded')))).toEqual({
      tipo: 'evento', evento: { eventoId: 'evt_test_Zx9', solicitudId: SOL, resultado: 'aprobado', ultimos4: '1111', motivo: null, referencia: 'chr_test_Ab1', monto: 1522.2, moneda: 'PEN' },
    });
    expect(ultimos4Culqi({ last_four: '4242' })).toBe('4242');
    expect(ultimos4Culqi({})).toBeNull();
  });
  it('acepta `data` como JSON en texto; rechazo con el mensaje de Culqi; ignora otros tipos', () => {
    const e = cargo('charge.creation.failed', { outcome: { user_message: 'Fondos insuficientes' } });
    expect(leerEventoCulqi(json({ ...e, data: JSON.stringify(e.data) }))).toMatchObject({ evento: { resultado: 'rechazado', motivo: 'Fondos insuficientes' } });
    expect(leerEventoCulqi(json({ ...e, data: '{malo' }))).toEqual({ tipo: 'invalido' });
    expect(leerEventoCulqi(json(cargo('order.status.changed')))).toEqual({ tipo: 'ignorado' });
    expect(leerEventoCulqi(json(cargo('charge.creation.succeeded', { metadata: {} })))).toEqual({ tipo: 'invalido' });
  });
  it('sin token devuelve el formulario con la llave pública; con token crea el cargo en céntimos', async () => {
    const env = { CULQI_LLAVE_PUBLICA_PRUEBAS: 'pk_test_x', CULQI_LLAVE_SECRETA_PRUEBAS: 'sk_test_y', CULQI_SECRETO_WEBHOOK_PRUEBAS: SECRETO };
    const f = falso({ cuerpo: { object: 'charge', id: 'chr_test_Ab1' } });
    const p = new PasarelaCulqi(env, f.http);
    const base = { solicitudId: SOL, monto: 1522.2, moneda: 'PEN' as const, descripcion: 'Aptio SCORM · Plan Productora (mensual)', correo: 'ana@minera.pe', urlExito: '', urlCancelado: '' };
    expect(await p.crearPago('pruebas', base)).toEqual({ tipo: 'formulario', llavePublica: 'pk_test_x', montoCentimos: 152220, moneda: 'PEN', descripcion: base.descripcion });
    expect(f.llamadas).toHaveLength(0);
    expect(await p.crearPago('pruebas', { ...base, token: 'tkn_test_AbCdEf123456' })).toEqual({ tipo: 'enviado', referencia: 'chr_test_Ab1' });
    expect(f.llamadas[0]!.url).toBe('https://api.culqi.com/v2/charges');
    expect(JSON.parse(String(f.llamadas[0]!.init.body))).toMatchObject({ amount: 152220, currency_code: 'PEN', source_id: 'tkn_test_AbCdEf123456', metadata: { solicitudId: SOL } });
    expect(f.llamadas[0]!.init.headers).toMatchObject({ Authorization: 'Bearer sk_test_y' });
    await expect(p.crearPago('pruebas', { ...base, token: '4111111111111111' })).rejects.toBeInstanceOf(ErrorPasarela);
    expect(p.variablesFaltantes('produccion')).toEqual(['CULQI_LLAVE_PUBLICA_PRODUCCION', 'CULQI_LLAVE_SECRETA_PRODUCCION', 'CULQI_SECRETO_WEBHOOK_PRODUCCION']);
  });
  it('un cargo rechazado por Culqi lleva su mensaje para el visitante; el reembolso va por el id del cargo', async () => {
    const p = new PasarelaCulqi({}, falso({ status: 402, cuerpo: { object: 'error', user_message: 'Tu tarjeta fue rechazada' } }).http);
    await expect(p.crearPago('pruebas', { solicitudId: SOL, monto: 1, moneda: 'PEN', descripcion: 'x', correo: 'a@b.pe', urlExito: '', urlCancelado: '', token: 'tkn_test_AbCdEf123456' })).rejects.toMatchObject({ motivo: 'Tu tarjeta fue rechazada' });
    const f = falso({ cuerpo: { object: 'refund', id: 'ref_test_1' } });
    expect(await new PasarelaCulqi({}, f.http).reembolsar('pruebas', { referencia: 'chr_test_Ab1', monto: 1522.2, moneda: 'PEN', idempotencia: 'c1' })).toEqual({ reembolsoId: 'ref_test_1' });
    expect(JSON.parse(String(f.llamadas[0]!.init.body))).toEqual({ amount: 152220, charge_id: 'chr_test_Ab1', reason: 'solicitud_comprador' });
  });
});
