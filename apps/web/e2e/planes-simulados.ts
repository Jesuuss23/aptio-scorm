// HU-1702 · Ventas › Planes simulado, con las mismas reglas que la API (las funciones de @aptio/schema/planes): crear,
// editar, ordenar y destacar uno a la vez; el slug no cambia; los ajustes de la página de precios. Lo que ve el sitio
// sale de la versión publicada (la armadora de la instantánea recibe `filas()` y `ajustes()`).
import {
  AJUSTES_PLANES_POR_DEFECTO, type AjustesPlanes, type DatosPlan, PLANES_DE_EJEMPLO, precioAnualDe, precioAnualUsdDe, validarAjustesPlanes, validarPlan, validarPlanCompleto,
} from '@aptio/schema/planes';

export interface PlanSim extends DatosPlan { id: string; orden: number; ficticio: boolean; actualizadoEn: string }
/** `ejemplo`: los 3 planes del prototipo (`ficticio` dice si van marcados, como en la semilla). HU-1704: `usd`, el precio al mes en dólares por slug. */
export interface PlanesSitioSim { ejemplo?: boolean; ficticio?: boolean; planes?: PlanSim[]; ajustes?: Partial<AjustesPlanes>; usd?: Record<string, number> }

type Respuesta = { status: number; body?: unknown };
type ErrorCampo = { campo: string; mensaje: string };
const noValido = (errores: ErrorCampo[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });
const PLAN_NUEVO: Omit<DatosPlan, 'slug' | 'nombre'> = { descripcion: '', precioMes: null, precioAnual: null, precioMesUsd: null, precioAnualUsd: null, capsulasMes: null, usuarios: null, capsulaAdicional: null, textoBoton: 'Suscribirme', destacado: false, visible: false, caracteristicas: [] };
const CAMPOS: (keyof DatosPlan)[] = ['slug', 'nombre', 'descripcion', 'precioMes', 'precioAnual', 'precioMesUsd', 'precioAnualUsd', 'capsulasMes', 'usuarios', 'capsulaAdicional', 'textoBoton', 'destacado', 'visible', 'caracteristicas'];

export function crearPlanesSim(inicial: PlanesSitioSim = {}) {
  const base = '2026-11-01T00:00:00.000Z';
  let planes: PlanSim[] = inicial.planes?.map((p) => ({ ...p, caracteristicas: p.caracteristicas.map((c) => ({ ...c })) }))
    ?? (inicial.ejemplo ? PLANES_DE_EJEMPLO.map((p, i) => ({ ...p, id: `00000000-0000-4000-9800-${String(i + 1).padStart(12, '0')}`, ficticio: inicial.ficticio ?? false, actualizadoEn: base, caracteristicas: p.caracteristicas.map((c) => ({ ...c })), ...(inicial.usd?.[p.slug] ? { precioMesUsd: inicial.usd[p.slug]! } : {}) })) : []);
  let ajustes: AjustesPlanes = { ...AJUSTES_PLANES_POR_DEFECTO, ...inicial.ajustes };
  let secuencia = 100;
  const ordenados = () => [...planes].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const dto = (p: PlanSim) => ({ ...p, precioAnualEfectivo: precioAnualDe(p, ajustes.descuentoAnual), precioAnualUsdEfectivo: precioAnualUsdDe(p, ajustes.descuentoAnual) });
  const lista = (): Respuesta => ({ status: 200, body: { planes: ordenados().map(dto), ajustes } });
  const sello = () => new Date(Date.now() + ++secuencia).toISOString();

  /** Valida un plan completo como el servicio: primero los tipos, después las reglas entre campos. */
  function validar(d: DatosPlan): { ok: true; datos: DatosPlan } | { ok: false; r: Respuesta } {
    const tipos = validarPlan(d);
    if (tipos.length) return { ok: false, r: noValido(tipos) };
    const datos = Object.fromEntries(CAMPOS.map((k) => [k, d[k]])) as unknown as DatosPlan;
    const limpio = { ...datos, nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim(), textoBoton: datos.textoBoton.trim(), caracteristicas: datos.caracteristicas.map((c) => ({ texto: c.texto.trim(), visible: c.visible })) };
    const errores = validarPlanCompleto(limpio);
    return errores.length ? { ok: false, r: noValido(errores) } : { ok: true, datos: limpio };
  }

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>): Respuesta {
    if (ruta === '/ventas/planes' && metodo === 'GET') return lista();
    if (ruta === '/ventas/planes/ajustes' && metodo === 'GET') return { status: 200, body: ajustes };
    if (ruta === '/ventas/planes/ajustes' && metodo === 'PUT') {
      const errores = validarAjustesPlanes(cuerpo);
      if (errores.length) return noValido(errores);
      ajustes = { mostrarAnual: Boolean(cuerpo.mostrarAnual), descuentoAnual: Number(cuerpo.descuentoAnual), conIgv: Boolean(cuerpo.conIgv) };
      return { status: 200, body: ajustes };
    }
    if (ruta === '/ventas/planes/orden' && metodo === 'PUT') {
      const ids = (cuerpo.ids ?? []) as string[];
      if (new Set(ids).size !== ids.length || ids.length !== planes.length || ids.some((i) => !planes.some((p) => p.id === i))) {
        return { status: 422, body: { codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden lleva todos los planes, una vez cada uno' } };
      }
      planes = planes.map((p) => ({ ...p, orden: ids.indexOf(p.id) }));
      return lista();
    }
    const { ficticio, ...resto } = cuerpo;
    if (ruta === '/ventas/planes' && metodo === 'POST') {
      const v = validar({ ...PLAN_NUEVO, ...resto } as DatosPlan);
      if (!v.ok) return v.r;
      if (planes.some((p) => p.slug === v.datos.slug)) return { status: 409, body: { codigo: 'SLUG_EN_USO', mensaje: `Ya hay un plan con el identificador «${v.datos.slug}»` } };
      if (v.datos.destacado) planes = planes.map((p) => ({ ...p, destacado: false }));
      const p: PlanSim = { ...v.datos, id: `00000000-0000-4000-9800-${String(++secuencia).padStart(12, '0')}`, orden: Math.max(-1, ...planes.map((x) => x.orden)) + 1, ficticio: ficticio === true, actualizadoEn: sello() };
      planes.push(p);
      return { status: 201, body: dto(p) };
    }
    const m = ruta.match(/^\/ventas\/planes\/([0-9a-f-]{36})$/);
    const actual = m ? planes.find((p) => p.id === m[1]) : undefined;
    if (m && metodo === 'PATCH') {
      if (!actual) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El plan no existe' } };
      if (resto.slug !== undefined && resto.slug !== actual.slug) return { status: 422, body: { codigo: 'SLUG_FIJO', mensaje: 'El identificador del plan no cambia: lo usan las URL y las suscripciones' } };
      const parcial = validarPlan(resto, { parcial: true });
      if (parcial.length) return noValido(parcial);
      const v = validar({ ...actual, ...resto, slug: actual.slug } as DatosPlan);
      if (!v.ok) return v.r;
      if (v.datos.destacado && !actual.destacado) planes = planes.map((p) => (p.id === actual.id ? p : { ...p, destacado: false }));
      const nuevo: PlanSim = { ...actual, ...v.datos, ficticio: typeof ficticio === 'boolean' ? ficticio : actual.ficticio, actualizadoEn: sello() };
      planes = planes.map((p) => (p.id === actual.id ? nuevo : p));
      return { status: 200, body: dto(nuevo) };
    }
    return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta desconocida' } };
  }

  return { panel, filas: () => ordenados(), ajustes: () => ajustes };
}
