// HU-1708 · Cobranza y suspensión simuladas, con las mismas reglas que la API (@aptio/schema/cobranza): el aviso global
// (`/organizacion/cobranza`), la renovación en `/organizacion/suscripcion`, «Pagar ahora» con la pasarela de pruebas
// (4111… reactiva, 4000…0002 rechaza), la solo lectura (403 SUSCRIPCION_SUSPENDIDA en la escritura, salvo la sesión,
// exportar y pagar) y Ventas › Suscripciones con «Reintentar ahora» (en la carga siguiente, el worker simulado cobra la
// de pruebas).
import { conIgv, igvDe } from '@aptio/schema/planes';
import { DIAS_INTENTOS, fechaDelPaso } from '@aptio/schema/cobranza';
import { PLANES_SIM } from './cuotas-simuladas';

type Respuesta = { status: number; body?: unknown };
export interface CobranzaSitioSim {
  /** El estado de cobro de la organización del usuario (plan de `cuotaSitio`, o Productora). */
  estado?: 'PAGO_PENDIENTE' | 'SUSPENDIDA';
  /** Ventas › Suscripciones: tres organizaciones (activa, con pago pendiente en pruebas y suspendida con Stripe). */
  ventas?: boolean;
}

const FIN_SIM = '2026-12-10T15:00:00.000Z';
const TARJETA_APRUEBA = '4111111111111111';
const TARJETA_RECHAZA = '4000000000000002';
const PERMITIDAS = [/^\/auth\//, /^\/cursos\/[^/]+\/(validar|exportaciones)$/, /^\/organizacion\/suscripcion(\/|$)/];

function renovacion(id: string, plan: string, intentos: number, estado: 'PENDIENTE' | 'VENCIDA' | 'APROBADA', pasarela: string) {
  const p = PLANES_SIM.find((x) => x.slug === plan)!;
  const base = p.precioCiclo!;
  const fin = new Date(FIN_SIM);
  return {
    id, estado, plan: { slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes }, periodoInicio: FIN_SIM, periodoFin: '2027-01-10T15:00:00.000Z', montoSinIgv: base, igv: igvDe(base),
    total: conIgv(base), moneda: 'PEN' as const, pasarela, intentos, proximoIntento: estado === 'VENCIDA' ? null : fechaDelPaso(fin, intentos).toISOString(),
    suspensionEn: fechaDelPaso(fin, DIAS_INTENTOS.length).toISOString(), motivoRechazo: intentos ? 'La tarjeta de prueba fue rechazada' : null as string | null,
  };
}

export function crearCobranzaSim(inicial: CobranzaSitioSim | undefined, plan: string, rol: () => string) {
  let estado: 'AL_DIA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' = inicial?.estado ?? 'AL_DIA';
  const r = renovacion('00000000-0000-4000-8000-000000000901', plan, estado === 'SUSPENDIDA' ? 4 : 1, estado === 'SUSPENDIDA' ? 'VENCIDA' : 'PENDIENTE', 'pruebas');
  let finPeriodo = FIN_SIM;
  const filas = inicial?.ventas ? [
    { id: '00000000-0000-4000-8000-000000000911', organizacion: { id: 'org-1', nombre: 'Estudio Quipu' }, plan: 'productora', estado: 'ACTIVA', pasarela: 'pruebas', ultimos4Digitos: '1111', renovacion: null as ReturnType<typeof renovacion> | null, enCola: false },
    { id: '00000000-0000-4000-8000-000000000912', organizacion: { id: 'org-2', nombre: 'Minera Andina SAC' }, plan: 'inicial', estado: 'PAGO_PENDIENTE', pasarela: 'pruebas', ultimos4Digitos: '0002', renovacion: renovacion('00000000-0000-4000-8000-000000000922', 'inicial', 2, 'PENDIENTE', 'pruebas'), enCola: false },
    { id: '00000000-0000-4000-8000-000000000913', organizacion: { id: 'org-3', nombre: 'Municipalidad de Lima' }, plan: 'estudio', estado: 'SUSPENDIDA', pasarela: 'stripe', ultimos4Digitos: '4242', renovacion: { ...renovacion('00000000-0000-4000-8000-000000000923', 'estudio', 4, 'VENCIDA', 'stripe'), motivoRechazo: null }, enCola: false },
  ] : [];
  const breve = (slug: string) => { const p = PLANES_SIM.find((x) => x.slug === slug)!; return { slug: p.slug, nombre: p.nombre, capsulasMes: p.capsulasMes }; };
  const filaDto = (f: (typeof filas)[number]) => ({
    id: f.id, organizacion: f.organizacion, plan: breve(f.plan), ciclo: 'MENSUAL', estado: f.estado, finPeriodo: FIN_SIM, pasarela: f.pasarela, ultimos4Digitos: f.ultimos4Digitos,
    renovacion: f.renovacion, reintentable: Boolean(f.renovacion),
  });

  /** El aviso global. */
  const aviso = () => (estado === 'AL_DIA'
    ? { estado, total: null, moneda: null, finPeriodo: null, suspensionEn: null, puedePagar: false, regularizar: '/plan' }
    : { estado, total: r.total, moneda: r.moneda, finPeriodo: FIN_SIM, suspensionEn: r.suspensionEn, puedePagar: rol() === 'ADMINISTRADOR', regularizar: '/plan' });

  /** Agrega el estado de cobro a la suscripción de la organización. */
  const decorar = (s: Record<string, unknown>) => ({
    ...s, ...(estado === 'AL_DIA' ? { renovacion: null, ...(inicial?.estado ? { finPeriodo, inicioPeriodo: FIN_SIM } : {}) } : { estado, renovacion: { ...r }, finPeriodo: FIN_SIM }),
  });

  /** CP-150 · Suspendida, la escritura responde 403, salvo la sesión, exportar y pagar. */
  function bloqueo(ruta: string, metodo: string): Respuesta | null {
    if (estado !== 'SUSPENDIDA' || metodo === 'GET' || rol() === 'SUPERADMIN' || PERMITIDAS.some((x) => x.test(ruta))) return null;
    const admin = rol() === 'ADMINISTRADOR';
    return {
      status: 403, body: {
        codigo: 'SUSCRIPCION_SUSPENDIDA',
        mensaje: admin
          ? 'Tu cuenta está en solo lectura porque no recibimos el pago de la renovación. Paga en Mi plan para reactivarla; lo exportado se puede descargar.'
          : 'La cuenta de tu organización está en solo lectura porque falta el pago de la renovación. Pide al administrador que la regularice; lo exportado se puede descargar.',
        detalles: [{ regularizar: '/plan', renovacionId: r.id, total: r.total, moneda: r.moneda, puedePagar: admin }],
      },
    };
  }

  /** «Pagar ahora»: devuelve el cuerpo con la suscripción decorada que le pasa `suscripcion()`. */
  function pagar(ruta: string, metodo: string, cuerpo: Record<string, unknown>, suscripcion: () => Record<string, unknown> | null): Respuesta | null {
    if (!ruta.startsWith('/organizacion/suscripcion/renovacion/') || metodo !== 'POST') return null;
    if (rol() !== 'ADMINISTRADOR') return { status: 403, body: { codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción' } };
    if (estado === 'AL_DIA') return { status: 409, body: { codigo: 'SIN_PAGO_PENDIENTE', mensaje: 'No hay una renovación por pagar' } };
    const dto = () => ({ renovacion: { ...r }, suscripcion: decorar(suscripcion() ?? {}) });
    if (ruta.endsWith('/pago')) return { status: 200, body: { ...dto(), pago: { tipo: 'simulado' } } };
    if (ruta.endsWith('/pago-prueba')) {
      const t = String(cuerpo.tarjeta ?? '').replace(/[\s-]/g, '');
      if (t !== TARJETA_APRUEBA && t !== TARJETA_RECHAZA) {
        return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: 'Usa una tarjeta de prueba: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza', detalles: [{ campo: 'tarjeta', mensaje: 'Usa una tarjeta de prueba' }] } };
      }
      if (t === TARJETA_RECHAZA) {
        r.motivoRechazo = 'La tarjeta de prueba fue rechazada';
        return { status: 200, body: dto() };
      }
      // Suspendida, el período nuevo empieza el día del pago; si no, se ancla al fin del anterior.
      finPeriodo = estado === 'SUSPENDIDA' ? '2027-01-15T15:00:00.000Z' : r.periodoFin;
      Object.assign(r, { estado: 'APROBADA', motivoRechazo: null, proximoIntento: null });
      const body = { renovacion: { ...r }, suscripcion: {} as Record<string, unknown> };
      estado = 'AL_DIA';
      body.suscripcion = decorar({ ...(suscripcion() ?? {}), estado: 'ACTIVA' });
      return { status: 200, body };
    }
    return null;
  }

  /** Ventas › Suscripciones (solo el superadmin). */
  function ventas(ruta: string, metodo: string, consulta: URLSearchParams): Respuesta | null {
    if (ruta === '/ventas/suscripciones' && metodo === 'GET') {
      // El worker simulado corre entre una carga y la siguiente: cobra con la tarjeta de pruebas que aprueba.
      for (const f of filas.filter((x) => x.enCola)) {
        f.enCola = false;
        if (f.pasarela === 'pruebas') Object.assign(f, { estado: 'ACTIVA', renovacion: null, ultimos4Digitos: '1111' });
      }
      const e = consulta.get('estado');
      if (e && !['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA', 'CANCELADA'].includes(e)) return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: 'Estado no válido' } };
      return { status: 200, body: { suscripciones: filas.filter((f) => !e || f.estado === e).map(filaDto) } };
    }
    const m = ruta.match(/^\/ventas\/suscripciones\/([\w-]+)\/reintentar$/);
    if (m && metodo === 'POST') {
      const f = filas.find((x) => x.id === m[1]);
      if (!f) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'La suscripción no existe' } };
      if (!f.renovacion) return { status: 409, body: { codigo: 'SIN_PAGO_PENDIENTE', mensaje: 'Esta suscripción no tiene una renovación por cobrar' } };
      f.enCola = true;
      return { status: 202, body: { suscripcion: filaDto(f), encolado: true } };
    }
    return null;
  }

  return { aviso, decorar, bloqueo, pagar, ventas, estado: () => estado };
}
