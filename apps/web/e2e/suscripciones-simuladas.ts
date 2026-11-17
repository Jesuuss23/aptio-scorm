// HU-1703 · El checkout de /pago simulado, con las mismas reglas que la API (las funciones de @aptio/schema/suscripciones):
// el plan sale de la versión publicada; 404 si es a medida u oculto; 409 si el correo ya es de un usuario; 503 sin pasarela
// (producción); la pasarela de pruebas aprueba con 4111 1111 1111 1111 y rechaza con 4000 0000 0000 0002.
// HU-1704: la moneda (dólares si el plan tiene precio en USD y una pasarela cobra en dólares) y la pasarela que cobra cada
// moneda; con Stripe, la página alojada es `https://pago.simulado.test/stripe/{id}` (la sirve `rutaStripeSimulada`):
// visitarla aprueba el pago como lo haría su webhook y su enlace vuelve a `/pago?plan=…&checkout={id}`.
import type { PlanPublico } from '@aptio/schema/planes';
import type { CodigoPasarela } from '@aptio/schema/pasarelas';
import { esCiclo, esMoneda, finPeriodo, type Moneda, monedasDelPlan, resumenCheckout, type ResumenCheckout, TARJETAS_PRUEBA, type TipoComprobante, validarEmpresa } from '@aptio/schema/suscripciones';

export const ORIGEN_STRIPE_SIMULADO = 'https://pago.simulado.test';

type Respuesta = { status: number; body?: unknown };
export interface CheckoutSim {
  id: string; estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; resumen: ResumenCheckout; tipoComprobante: TipoComprobante; correoAdmin: string; razonSocial: string; ruc: string | null;
  nombreAdmin: string; cuerpo: Record<string, unknown>; motivoRechazo: string | null; finPeriodo: string | null; pasarela: CodigoPasarela; vuelta: string;
}
/** Lo que llegó al checkout (las pruebas lo leen). */
export const checkoutsSim: CheckoutSim[] = [];

export function crearSuscripcionesSim(d: {
  planes: () => { ajustes: { mostrarAnual: boolean }; planes: PlanPublico[] } | null; entorno: () => 'pruebas' | 'produccion'; correosEnUso: () => string[];
  pasarelas: { elegir: (m: Moneda) => CodigoPasarela | null; monedas: () => Moneda[] };
}) {
  let secuencia = 0;
  const estado = (c: CheckoutSim) => ({
    id: c.id, estado: c.estado, plan: c.resumen.plan, nombrePlan: c.resumen.nombrePlan, ciclo: c.resumen.ciclo, total: c.resumen.total, moneda: c.resumen.moneda, tipoComprobante: c.tipoComprobante,
    correoAdmin: c.correoAdmin, motivoRechazo: c.motivoRechazo, finPeriodo: c.finPeriodo,
  });

  function publico(ruta: string, metodo: string, cuerpo: Record<string, unknown>, origen = 'http://localhost'): Respuesta | null {
    const plan = ruta.match(/^\/publico\/planes\/([a-z0-9-]+)$/);
    if (plan && metodo === 'GET') {
      const s = d.planes();
      const p = s?.planes.find((x) => x.slug === plan[1]);
      if (!p) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El plan no existe o no está publicado' } };
      const monedas = monedasDelPlan(p, d.pasarelas.monedas());
      const usd = monedas.includes('USD');
      return { status: 200, body: { ...p, precioMesUsd: usd ? (p.precioMesUsd ?? null) : null, precioAnualUsd: usd ? (p.precioAnualUsd ?? null) : null, monedas, ajustes: s!.ajustes } };
    }
    if (ruta === '/publico/checkout' && metodo === 'POST') {
      const s = d.planes();
      const p = s?.planes.find((x) => x.slug === cuerpo.plan);
      if (!s || !p || p.aMedida) return { status: 404, body: { codigo: 'PLAN_NO_DISPONIBLE', mensaje: 'Este plan no se puede contratar en línea' } };
      const ciclo = cuerpo.ciclo ?? 'MENSUAL';
      const moneda = (cuerpo.moneda ?? 'PEN') as Moneda;
      const empresa = validarEmpresa(cuerpo);
      const errores = [...(esCiclo(ciclo) ? [] : [{ campo: 'ciclo', mensaje: 'El ciclo es MENSUAL o ANUAL' }]), ...(esMoneda(moneda) ? [] : [{ campo: 'moneda', mensaje: 'La moneda es PEN o USD' }]), ...(empresa.ok ? [] : empresa.errores)];
      if (errores.length || !empresa.ok) return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } };
      if (moneda === 'USD' && (p.precioMesUsd ?? null) === null) return { status: 422, body: { codigo: 'NO_VALIDO', detalles: [{ campo: 'moneda', mensaje: 'Este plan no se cobra en dólares' }] } };
      const resumen = resumenCheckout(p, ciclo as 'MENSUAL', s.ajustes.mostrarAnual, moneda);
      if (!resumen) return { status: 422, body: { codigo: 'NO_VALIDO', detalles: [{ campo: 'ciclo', mensaje: 'Este plan no se ofrece con pago anual' }] } };
      if (d.correosEnUso().includes(empresa.datos.correoAdmin)) return { status: 409, body: { codigo: 'CORREO_EN_USO', mensaje: 'Ese correo ya tiene una cuenta' } };
      const pasarela = d.pasarelas.elegir(moneda);
      if (!pasarela) return { status: 503, body: { codigo: 'PAGO_NO_DISPONIBLE', mensaje: 'El pago en línea todavía no está disponible' } };
      const id = `00000000-0000-4000-9900-${String(++secuencia).padStart(12, '0')}`;
      const vuelta = `${origen}/s${cuerpo.idioma === 'en' ? '/en' : ''}/pago?${new URLSearchParams({ plan: p.slug, checkout: id })}`;
      const c: CheckoutSim = { id, estado: 'PENDIENTE', resumen, tipoComprobante: empresa.tipoComprobante, ...empresa.datos, cuerpo, motivoRechazo: null, finPeriodo: null, pasarela, vuelta };
      checkoutsSim.push(c);
      const pago = pasarela === 'stripe' ? { tipo: 'redireccion', url: `${ORIGEN_STRIPE_SIMULADO}/stripe/${id}`, referencia: `cs_test_${id}` } : { tipo: 'simulado' };
      return { status: 201, body: { id: c.id, estado: 'PENDIENTE', resumen, tipoComprobante: c.tipoComprobante, pasarela, pago } };
    }
    const m = ruta.match(/^\/publico\/checkout\/([0-9a-f-]{36})(\/pago-prueba)?$/);
    const c = m ? checkoutsSim.find((x) => x.id === m[1]) : undefined;
    if (m && !m[2] && metodo === 'GET') return c ? { status: 200, body: estado(c) } : { status: 404, body: { codigo: 'NO_ENCONTRADO' } };
    if (m && m[2] && metodo === 'POST') {
      if (!c || d.entorno() !== 'pruebas' || c.pasarela !== 'pruebas') return { status: 404, body: { codigo: 'NO_ENCONTRADO' } };
      const n = String(cuerpo.tarjeta ?? '').replace(/[\s-]/g, '');
      if (n !== TARJETAS_PRUEBA.aprobada && n !== TARJETAS_PRUEBA.rechazada) return { status: 422, body: { codigo: 'NO_VALIDO', detalles: [{ campo: 'tarjeta', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' }] } };
      if (c.estado === 'PENDIENTE') {
        if (n === TARJETAS_PRUEBA.aprobada) Object.assign(c, { estado: 'APROBADA', finPeriodo: finPeriodo(new Date(), c.resumen.ciclo).toISOString() });
        else Object.assign(c, { estado: 'RECHAZADA', motivoRechazo: 'La tarjeta de prueba fue rechazada' });
      }
      return { status: 200, body: estado(c) };
    }
    return null;
  }

  /** La página alojada de Stripe simulada: aprueba el pago (como su webhook) y ofrece volver al sitio. */
  function paginaStripe(id: string): string | null {
    const c = checkoutsSim.find((x) => x.id === id && x.pasarela === 'stripe');
    if (!c) return null;
    if (c.estado === 'PENDIENTE') Object.assign(c, { estado: 'APROBADA', finPeriodo: finPeriodo(new Date(), c.resumen.ciclo).toISOString() });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stripe Checkout (simulado)</title></head><body><main><h1>Stripe Checkout (simulado)</h1><p>Pago aprobado.</p><a href="${c.vuelta}">Volver a Aptio SCORM</a></main></body></html>`;
  }
  return { publico, paginaStripe };
}
