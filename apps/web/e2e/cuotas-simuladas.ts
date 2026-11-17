// HU-1705 · La cuota de cápsulas y la compra de adicionales simuladas, con las mismas reglas que la API
// (@aptio/schema/cuotas): un proyecto consume una sola vez; sin cuota, 402 CUOTA_AGOTADA con la oferta; solo el
// administrador compra de 1 a 10; la pasarela de pruebas aprueba con 4111… y rechaza con 4000…; Stripe va a una página
// alojada simulada que aprueba y vuelve a /?compra=.
import { diasDelPeriodo, prorrateo, validarCambio } from '@aptio/schema/cambio-plan';
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
  /**
   * HU-1706 · El plan de la suscripción (slug de PLANES_SIM): con él, `/organizacion/suscripcion` responde y la cuota
   * sigue al plan. Período del 10 de noviembre al 10 de diciembre, hoy el 25: quedan 15 de 30 días (CP-147).
   */
  plan?: string;
  /** HU-1709 · El cupón del alta con las renovaciones que le quedan con descuento. */
  descuento?: { codigo: string; porcentaje: number; ciclosRestantes: number | null };
}

/** HU-1706 · Los planes publicados, mensuales en soles; «corporativo» es a medida. */
export const PLANES_SIM = [
  { slug: 'inicial', nombre: 'Inicial', capsulasMes: 8, precioCiclo: 490 as number | null, aMedida: false },
  { slug: 'productora', nombre: 'Productora', capsulasMes: 20, precioCiclo: 1290, aMedida: false },
  { slug: 'estudio', nombre: 'Estudio', capsulasMes: 60, precioCiclo: 2990, aMedida: false },
  { slug: 'corporativo', nombre: 'Corporativo', capsulasMes: null as number | null, precioCiclo: null, aMedida: true },
];
const INICIO_SIM = '2026-11-10T15:00:00.000Z';
const HOY_SIM = new Date('2026-11-25T15:00:00.000Z');
interface CambioSim { id: string; tipo: 'SUBIDA'; estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'; origen: string; destino: string; precioNuevo: number; diasRestantes: number; diasPeriodo: number; diferenciaSinIgv: number; igv: number; total: number; motivoRechazo: string | null; pasarela: string; vuelta: string }

interface CompraSim { id: string; estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; cantidad: number; subtotal: number; igv: number; total: number; moneda: Moneda; pasarela: string; motivoRechazo: string | null; vuelta: string }

export function crearCuotasSim(inicial: CuotaSitioSim | undefined, rol: () => string) {
  const estado = inicial ? { ...inicial, adicionales: inicial.adicionales ?? 0, unitario: inicial.unitario === undefined ? 69 : inicial.unitario, moneda: inicial.moneda ?? 'PEN' as Moneda } : null;
  const consumidos = new Set<string>();
  const compras: CompraSim[] = [];
  const ventanaFin = inicial?.ventanaFin ?? '2026-12-10T15:00:00.000Z';
  const sus = inicial?.plan ? {
    plan: inicial.plan, precio: PLANES_SIM.find((p) => p.slug === inicial.plan)!.precioCiclo!, estado: 'ACTIVA' as 'ACTIVA' | 'CANCELADA',
    cancelarAlFin: false, canceladaEn: null as string | null, programado: null as string | null,
  } : null;
  const cambios: CambioSim[] = [];

  function cuota() {
    const c = calcularCuota({ capsulasMes: estado!.incluidas, adicionales: estado!.adicionales, usadas: estado!.usadas });
    const oferta = !c.ilimitada && estado!.unitario !== null
      ? (() => { const p = precioAdicionales(estado!.unitario!, 1, estado!.moneda); return { unitario: p.unitario, igv: p.igv, total: p.total, moneda: p.moneda, disponible: true }; })()
      : null;
    return {
      ilimitada: c.ilimitada, ventanaInicio: '2026-11-10T15:00:00.000Z', ventanaFin, incluidas: c.incluidas, adicionales: c.adicionales, usadas: c.usadas, disponibles: c.disponibles,
      oferta, puedeComprar: rol() === 'ADMINISTRADOR' && Boolean(oferta), planes: sus && rol() === 'ADMINISTRADOR' ? '/plan' : '/s/precios',
      cancelada: sus?.estado === 'CANCELADA',
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

  const breve = (slug: string) => { const p = PLANES_SIM.find((x) => x.slug === slug)!; return { slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes }; };
  function suscripcionDto() {
    return {
      plan: breve(sus!.plan), ciclo: 'MENSUAL', precioPactadoSinIgv: sus!.precio, moneda: estado!.moneda, estado: sus!.estado, inicioPeriodo: INICIO_SIM, finPeriodo: ventanaFin,
      cancelarAlFin: sus!.cancelarAlFin, canceladaEn: sus!.canceladaEn, planProgramado: sus!.programado ? breve(sus!.programado) : null, pagoDisponible: true, descuento: inicial?.descuento ?? null,
      planes: PLANES_SIM.map((p) => ({
        slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes, precioCiclo: p.precioCiclo, actual: p.slug === sus!.plan,
        tipo: p.slug === sus!.plan || p.precioCiclo === null ? null : p.precioCiclo > sus!.precio ? 'SUBIDA' : 'BAJADA',
      })),
    };
  }
  const cambioDto = (c: CambioSim, conPago = false) => ({
    id: c.id, tipo: c.tipo, estado: c.estado, planOrigen: breve(c.origen), planDestino: breve(c.destino), ciclo: 'MENSUAL', precioNuevoSinIgv: c.precioNuevo,
    diasRestantes: c.diasRestantes, diasPeriodo: c.diasPeriodo, diferenciaSinIgv: c.diferenciaSinIgv, igv: c.igv, total: c.total, moneda: estado!.moneda, rigeDesde: HOY_SIM.toISOString(),
    pasarela: c.pasarela, motivoRechazo: c.motivoRechazo,
    ...(!conPago ? {} : { pago: c.pasarela === 'stripe' ? { tipo: 'redireccion', url: `${ORIGEN_PAGO_CAPSULAS}/stripe/${c.id}`, referencia: `cs_test_${c.id}` } : { tipo: 'simulado' } }),
    suscripcion: suscripcionDto(),
  });
  function aprobarCambio(c: CambioSim) {
    c.estado = 'APROBADO';
    sus!.plan = c.destino;
    sus!.precio = c.precioNuevo;
    sus!.programado = null;
    estado!.incluidas = PLANES_SIM.find((p) => p.slug === c.destino)!.capsulasMes;
  }

  /** HU-1706 · `/organizacion/suscripcion`: solo el administrador. */
  function suscripcion(ruta: string, metodo: string, cuerpo: Record<string, unknown>, origen: string): Respuesta | null {
    if (rol() !== 'ADMINISTRADOR') return { status: 403, body: { codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción' } };
    if (!sus) return { status: 404, body: { codigo: 'SIN_SUSCRIPCION', mensaje: 'Tu organización no tiene una suscripción' } };
    if (ruta === '/organizacion/suscripcion' && metodo === 'GET') return { status: 200, body: suscripcionDto() };
    if ((ruta === '/organizacion/suscripcion/cancelar' || ruta === '/organizacion/suscripcion/reanudar') && metodo === 'POST') {
      if (sus.estado === 'CANCELADA') return { status: 409, body: { codigo: 'SUSCRIPCION_CANCELADA', mensaje: 'Tu suscripción ya terminó' } };
      sus.cancelarAlFin = ruta.endsWith('cancelar');
      if (!sus.cancelarAlFin) sus.programado = null;
      return { status: 200, body: suscripcionDto() };
    }
    if (ruta === '/organizacion/suscripcion/cambio' && metodo === 'POST') {
      const p = PLANES_SIM.find((x) => x.slug === cuerpo.plan);
      const v = validarCambio(
        { planId: sus.plan, ciclo: 'MENSUAL', moneda: estado!.moneda, precioPactadoSinIgv: sus.precio, estado: sus.estado, cancelarAlFin: sus.cancelarAlFin },
        p ? { id: p.slug, visible: true, aMedida: p.aMedida, precioCiclo: p.precioCiclo } : null,
      );
      if (!v.ok) return { status: 422, body: { codigo: v.errores[0]!.campo === 'suscripcion' ? 'SUSCRIPCION_CANCELADA' : 'NO_VALIDO', mensaje: v.errores[0]!.mensaje, detalles: v.errores } };
      const d = diasDelPeriodo(new Date(INICIO_SIM), new Date(ventanaFin), HOY_SIM);
      const pr = prorrateo(sus.precio, v.tipo === 'SUBIDA' ? v.precioNuevo : sus.precio, d.diasRestantes, d.diasPeriodo, estado!.moneda);
      const base = { tipo: v.tipo, planOrigen: breve(sus.plan), planDestino: breve(p!.slug), ciclo: 'MENSUAL', precioNuevoSinIgv: v.precioNuevo, ...pr, pasarela: null, motivoRechazo: null };
      if (!cuerpo.confirmar) return { status: 200, body: { id: null, estado: 'VISTA_PREVIA', ...base, rigeDesde: v.tipo === 'SUBIDA' ? HOY_SIM.toISOString() : ventanaFin, suscripcion: suscripcionDto() } };
      if (v.tipo === 'BAJADA') {
        sus.programado = p!.slug;
        return { status: 200, body: { id: null, estado: 'PROGRAMADO', ...base, rigeDesde: ventanaFin, suscripcion: suscripcionDto() } };
      }
      const c: CambioSim = {
        id: `00000000-0000-4000-8000-${String(800 + cambios.length).padStart(12, '0')}`, tipo: 'SUBIDA', estado: 'PENDIENTE', origen: sus.plan, destino: p!.slug, precioNuevo: v.precioNuevo,
        diasRestantes: pr.diasRestantes, diasPeriodo: pr.diasPeriodo, diferenciaSinIgv: pr.diferenciaSinIgv, igv: pr.igv, total: pr.total, motivoRechazo: null,
        pasarela: estado!.pago === 'redireccion' ? 'stripe' : 'pruebas', vuelta: `${origen}/plan?cambio=`,
      };
      cambios.push(c);
      return { status: 200, body: cambioDto(c, true) };
    }
    const uno = ruta.match(/^\/organizacion\/suscripcion\/cambios\/([0-9a-f-]{36})(?:\/(pago-prueba))?$/);
    const c = uno ? cambios.find((x) => x.id === uno[1]) : undefined;
    if (uno && !c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El cambio no existe' } };
    if (uno && !uno[2] && metodo === 'GET') return { status: 200, body: cambioDto(c!) };
    if (uno && uno[2] === 'pago-prueba' && metodo === 'POST') {
      const numero = String(cuerpo.tarjeta ?? '').replace(/[\s-]/g, '');
      if (numero !== '4111111111111111' && numero !== '4000000000000002') {
        return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza' } };
      }
      if (c!.estado === 'PENDIENTE') {
        if (numero === '4111111111111111') aprobarCambio(c!);
        else Object.assign(c!, { estado: 'RECHAZADO', motivoRechazo: 'La tarjeta de prueba fue rechazada' });
      }
      return { status: 200, body: cambioDto(c!) };
    }
    return null;
  }

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, origen: string): Respuesta | null {
    if (ruta.startsWith('/organizacion/suscripcion')) return suscripcion(ruta, metodo, cuerpo, origen);
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
    const cambio = cambios.find((x) => x.id === id && x.pasarela === 'stripe');
    if (cambio) {
      if (cambio.estado === 'PENDIENTE') aprobarCambio(cambio);
      return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Stripe Checkout (simulado)</title></head><body><main><h1>Stripe Checkout (simulado)</h1><p>Pago aprobado.</p><a href="${cambio.vuelta}${cambio.id}">Volver a Aptio SCORM</a></main></body></html>`;
    }
    const c = compras.find((x) => x.id === id && x.pasarela === 'stripe');
    if (!c) return null;
    if (c.estado === 'PENDIENTE') aprobar(c);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Stripe Checkout (simulado)</title></head><body><main><h1>Stripe Checkout (simulado)</h1><p>Pago aprobado.</p><a href="${c.vuelta}${c.id}">Volver a Aptio SCORM</a></main></body></html>`;
  }

  return { consumir, panel, paginaPago };
}
