// HU-1705 · La cuota de cápsulas y la compra de adicionales simuladas, con las mismas reglas que la API
// (@aptio/schema/cuotas): un proyecto consume una sola vez; sin cuota, 402 CUOTA_AGOTADA con la oferta; solo el
// administrador compra de 1 a 10; la pasarela de pruebas aprueba con 4111… y rechaza con 4000…; Stripe va a una página
// alojada simulada que aprueba y vuelve a /?compra=.
import { calcularCuota, precioAdicionales, validarCantidadAdicionales } from '@aptio/schema/cuotas';
import type { Moneda } from '@aptio/schema/suscripciones';

type Respuesta = { status: number; body?: unknown };
export const ORIGEN_PAGO_CAPSULAS = 'https://pago-capsulas.simulado.test';

export interface CuotaSitioSim {
  /** Cápsulas al mes del plan; null = a medida (sin límite). Sin `cuotaSitio`, `/organizacion/cuota` responde 404. */
  incluidas: number | null;
  usadas: number;
  adicionales?: number;
  /** Precio sin IGV de la adicional; null = el plan no vende adicionales. */
  unitario?: number | null;
  moneda?: Moneda;
  /** Cómo cobra la pasarela de la suscripción. */
  pago?: 'simulado' | 'redireccion';
  ventanaFin?: string;
}

interface CompraSim { id: string; estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; cantidad: number; subtotal: number; igv: number; total: number; moneda: Moneda; pasarela: string; motivoRechazo: string | null; vuelta: string }

export function crearCuotasSim(inicial: CuotaSitioSim | undefined, rol: () => string) {
  const estado = inicial ? { ...inicial, adicionales: inicial.adicionales ?? 0, unitario: inicial.unitario === undefined ? 69 : inicial.unitario, moneda: inicial.moneda ?? 'PEN' as Moneda } : null;
  const consumidos = new Set<string>();
  const compras: CompraSim[] = [];
  const ventanaFin = inicial?.ventanaFin ?? '2026-12-10T15:00:00.000Z';

  function cuota() {
    const c = calcularCuota({ capsulasMes: estado!.incluidas, adicionales: estado!.adicionales, usadas: estado!.usadas });
    const oferta = !c.ilimitada && estado!.unitario !== null
      ? (() => { const p = precioAdicionales(estado!.unitario!, 1, estado!.moneda); return { unitario: p.unitario, igv: p.igv, total: p.total, moneda: p.moneda, disponible: true }; })()
      : null;
    return {
      ilimitada: c.ilimitada, ventanaInicio: '2026-11-10T15:00:00.000Z', ventanaFin, incluidas: c.incluidas, adicionales: c.adicionales, usadas: c.usadas, disponibles: c.disponibles,
      oferta, puedeComprar: rol() === 'ADMINISTRADOR' && Boolean(oferta), planes: '/s/precios',
    };
  }
  const compraDto = (c: CompraSim, conPago = false) => {
    const { vuelta: _v, ...resto } = c;
    const pago = !conPago ? {} : { pago: c.pasarela === 'stripe' ? { tipo: 'redireccion', url: `${ORIGEN_PAGO_CAPSULAS}/stripe/${c.id}`, referencia: `cs_test_${c.id}` } : { tipo: 'simulado' } };
    return { ...resto, ...pago, cuota: cuota() };
  };

  /** Al lanzar una generación: null si puede seguir; 402 si no quedan cápsulas. */
  function consumir(proyectoId: string): Respuesta | null {
    if (!estado || consumidos.has(proyectoId)) return null;
    const c = cuota();
    if (!c.ilimitada && c.disponibles === 0) {
      return { status: 402, body: { codigo: 'CUOTA_AGOTADA', mensaje: `Usaste las ${(c.incluidas ?? 0) + c.adicionales} cápsulas de este mes. Compra una adicional o sube de plan; las cápsulas en revisión siguen editables.`, detalles: [c] } };
    }
    consumidos.add(proyectoId);
    estado.usadas += 1;
    return null;
  }

  function aprobar(c: CompraSim) {
    c.estado = 'APROBADA';
    estado!.adicionales += c.cantidad;
  }

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, origen: string): Respuesta | null {
    if (!ruta.startsWith('/organizacion/cuota')) return null;
    if (!estado) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado' } };
    if (rol() === 'REVISOR_CLIENTE' || rol() === 'SUPERADMIN') return { status: 403, body: { codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción' } };
    if (ruta === '/organizacion/cuota' && metodo === 'GET') return { status: 200, body: cuota() };
    if (rol() !== 'ADMINISTRADOR') return { status: 403, body: { codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción' } };
    if (ruta === '/organizacion/cuota/adicionales' && metodo === 'POST') {
      const cantidad = cuerpo.cantidad ?? 1;
      const errores = validarCantidadAdicionales(cantidad);
      if (errores.length) return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores[0]!.mensaje, detalles: errores } };
      if (estado.unitario === null) return { status: 422, body: { codigo: 'SIN_ADICIONALES', mensaje: 'Tu plan no vende cápsulas adicionales: sube de plan para tener más' } };
      const p = precioAdicionales(estado.unitario, cantidad as number, estado.moneda);
      const c: CompraSim = {
        id: `00000000-0000-4000-8000-${String(700 + compras.length).padStart(12, '0')}`, estado: 'PENDIENTE', cantidad: p.cantidad, subtotal: p.subtotal, igv: p.igv, total: p.total, moneda: p.moneda,
        pasarela: estado.pago === 'redireccion' ? 'stripe' : 'pruebas', motivoRechazo: null, vuelta: `${origen}/?compra=`,
      };
      compras.push(c);
      return { status: 201, body: compraDto(c, true) };
    }
    const una = ruta.match(/^\/organizacion\/cuota\/adicionales\/([0-9a-f-]{36})(?:\/(pago-prueba))?$/);
    const c = una ? compras.find((x) => x.id === una[1]) : undefined;
    if (una && !c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'La compra no existe' } };
    if (una && !una[2] && metodo === 'GET') return { status: 200, body: compraDto(c!) };
    if (una && una[2] === 'pago-prueba' && metodo === 'POST') {
      const numero = String(cuerpo.tarjeta ?? '').replace(/[\s-]/g, '');
      if (numero !== '4111111111111111' && numero !== '4000000000000002') {
        return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' } };
      }
      if (c!.estado === 'PENDIENTE') {
        if (numero === '4111111111111111') aprobar(c!);
        else Object.assign(c!, { estado: 'RECHAZADA', motivoRechazo: 'La tarjeta de prueba fue rechazada' });
      }
      return { status: 200, body: compraDto(c!) };
    }
    return null;
  }

  /** La página alojada de Stripe simulada: aprueba (como su webhook) y ofrece volver a la consola. */
  function paginaPago(id: string): string | null {
    const c = compras.find((x) => x.id === id && x.pasarela === 'stripe');
    if (!c) return null;
    if (c.estado === 'PENDIENTE') aprobar(c);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Stripe Checkout (simulado)</title></head><body><main><h1>Stripe Checkout (simulado)</h1><p>Pago aprobado.</p><a href="${c.vuelta}${c.id}">Volver a Aptio SCORM</a></main></body></html>`;
  }

  return { consumir, panel, paginaPago };
}
