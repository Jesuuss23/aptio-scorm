/**
 * HU-1702 · Planes administrables (M18, REQ-082, PNT-35, CP-141, CP-142, RN-18-2, RN-18-5). Reglas puras, las mismas en
 * la API, la web, el sitio y las pruebas:
 * - validar un plan y los ajustes de la página de precios;
 * - el precio anual efectivo (el propio del plan, o mensual × 12 × (1 − descuento)), el ahorro anual y el IGV de 18 %;
 * - un solo plan destacado a la vez;
 * - la proyección pública: solo los planes visibles, en orden, con sus características visibles.
 *
 * Precios en soles enteros sin IGV. `precioMes` null = plan a medida (sin precio; el botón lleva a agendar).
 */

export const IGV = 0.18;
export const SLUG_PLAN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const LIMITES_PLAN = { nombre: 60, descripcion: 200, textoBoton: 40, caracteristica: 120, caracteristicas: 12, precio: 1_000_000, cantidad: 100_000 } as const;
export const AJUSTES_PLANES_POR_DEFECTO: AjustesPlanes = { mostrarAnual: true, descuentoAnual: 20, conIgv: false };
/** HU-1702 · Hasta la HU-1703 (pago), cada botón de plan lleva a agendar una demo con el plan elegido. */
export const RUTA_AGENDAR_PLAN = '/agendar-demo';

export interface Caracteristica { texto: string; visible: boolean }

/** Lo editable de un plan. */
export interface DatosPlan {
  slug: string;
  nombre: string;
  descripcion: string;
  precioMes: number | null;
  precioAnual: number | null;
  capsulasMes: number | null;
  usuarios: number | null;
  capsulaAdicional: number | null;
  textoBoton: string;
  destacado: boolean;
  visible: boolean;
  caracteristicas: Caracteristica[];
}

export interface PlanGuardado extends DatosPlan { id: string; orden: number; ficticio: boolean }
export interface AjustesPlanes { mostrarAnual: boolean; descuentoAnual: number; conIgv: boolean }

export interface ErrorCampo { campo: string; mensaje: string }

const entero = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const enteroONulo = (v: unknown, min: number, max: number) => v === null || entero(v, min, max);
const texto = (v: unknown, max: number, { vacio = false } = {}) => typeof v === 'string' && v.trim().length <= max && (vacio || v.trim().length > 0);

/**
 * Valida un plan completo o parcial (`parcial`: solo los campos presentes, para un PATCH). Devuelve los errores por
 * campo; vacío = válido. Un plan a medida (`precioMes` null) no lleva precio anual ni cápsula adicional.
 */
export function validarPlan(v: Partial<Record<keyof DatosPlan, unknown>>, { parcial = false } = {}): ErrorCampo[] {
  const e: ErrorCampo[] = [];
  const hay = (k: keyof DatosPlan) => !parcial || Object.hasOwn(v, k);
  if (hay('slug') && !(typeof v.slug === 'string' && SLUG_PLAN.test(v.slug))) e.push({ campo: 'slug', mensaje: 'Minúsculas, números y guiones, de 1 a 40 caracteres' });
  if (hay('nombre') && !texto(v.nombre, LIMITES_PLAN.nombre)) e.push({ campo: 'nombre', mensaje: `El nombre va de 1 a ${LIMITES_PLAN.nombre} caracteres` });
  if (hay('descripcion') && !texto(v.descripcion, LIMITES_PLAN.descripcion, { vacio: true })) e.push({ campo: 'descripcion', mensaje: `Hasta ${LIMITES_PLAN.descripcion} caracteres` });
  if (hay('textoBoton') && !texto(v.textoBoton, LIMITES_PLAN.textoBoton)) e.push({ campo: 'textoBoton', mensaje: `El texto del botón va de 1 a ${LIMITES_PLAN.textoBoton} caracteres` });
  for (const k of ['precioMes', 'precioAnual', 'capsulaAdicional'] as const) {
    if (hay(k) && !enteroONulo(v[k], 1, LIMITES_PLAN.precio)) e.push({ campo: k, mensaje: 'Soles enteros mayores que 0, o vacío' });
  }
  for (const k of ['capsulasMes', 'usuarios'] as const) {
    if (hay(k) && !enteroONulo(v[k], 1, LIMITES_PLAN.cantidad)) e.push({ campo: k, mensaje: 'Un número entero mayor que 0, o vacío (ilimitado o según contrato)' });
  }
  for (const k of ['destacado', 'visible'] as const) if (hay(k) && typeof v[k] !== 'boolean') e.push({ campo: k, mensaje: 'Debe ser verdadero o falso' });
  if (hay('caracteristicas')) {
    const c = v.caracteristicas;
    if (!Array.isArray(c) || c.length > LIMITES_PLAN.caracteristicas) e.push({ campo: 'caracteristicas', mensaje: `Hasta ${LIMITES_PLAN.caracteristicas} características` });
    else c.forEach((f, i) => {
      if (!f || typeof f !== 'object' || !texto((f as Caracteristica).texto, LIMITES_PLAN.caracteristica) || typeof (f as Caracteristica).visible !== 'boolean') {
        e.push({ campo: `caracteristicas[${i}]`, mensaje: `Texto de 1 a ${LIMITES_PLAN.caracteristica} caracteres y visible verdadero o falso` });
      }
    });
  }
  return e;
}

/** Las reglas entre campos del plan ya combinado (lo guardado más el cambio). */
export function validarPlanCompleto(p: DatosPlan): ErrorCampo[] {
  const e = validarPlan(p);
  if (p.precioMes === null && p.precioAnual !== null) e.push({ campo: 'precioAnual', mensaje: 'Un plan a medida no lleva precio anual' });
  if (p.precioMes === null && p.capsulaAdicional !== null) e.push({ campo: 'capsulaAdicional', mensaje: 'Un plan a medida no lleva cápsula adicional' });
  return e;
}

export function validarAjustesPlanes(v: unknown): ErrorCampo[] {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const e: ErrorCampo[] = [];
  if (typeof o.mostrarAnual !== 'boolean') e.push({ campo: 'mostrarAnual', mensaje: 'Debe ser verdadero o falso' });
  if (!entero(o.descuentoAnual, 0, 90)) e.push({ campo: 'descuentoAnual', mensaje: 'Un porcentaje entero de 0 a 90' });
  if (typeof o.conIgv !== 'boolean') e.push({ campo: 'conIgv', mensaje: 'Debe ser verdadero o falso' });
  return e;
}

/** IGV de 18 % sobre la base, con dos decimales (RN-18-5). */
export const igvDe = (base: number) => Math.round(base * IGV * 100) / 100;
/** Base más IGV, con dos decimales. */
export const conIgv = (base: number) => Math.round((base + base * IGV) * 100) / 100;

/** Precio anual efectivo: el propio del plan o mensual × 12 × (1 − descuento) en soles enteros. Null si es a medida. */
export function precioAnualDe(p: Pick<DatosPlan, 'precioMes' | 'precioAnual'>, descuentoAnual: number): number | null {
  if (p.precioMes === null) return null;
  if (p.precioAnual !== null) return p.precioAnual;
  return Math.round(p.precioMes * 12 * (1 - descuentoAnual / 100));
}

/** Lo que se ahorra al año frente a pagar 12 meses (0 si el anual no es más barato). Null si es a medida. */
export function ahorroAnualDe(p: Pick<DatosPlan, 'precioMes' | 'precioAnual'>, descuentoAnual: number): number | null {
  const anual = precioAnualDe(p, descuentoAnual);
  return anual === null || p.precioMes === null ? null : Math.max(0, p.precioMes * 12 - anual);
}

/** Al destacar `id`, los demás dejan de estarlo: devuelve los ids que hay que apagar. */
export function apagarOtrosDestacados(planes: readonly Pick<PlanGuardado, 'id' | 'destacado'>[], id: string): string[] {
  return planes.filter((p) => p.destacado && p.id !== id).map((p) => p.id);
}

/** El plan como lo ve el público (en la versión publicada del sitio y en el resumen del pago). */
export interface PlanPublico {
  slug: string;
  nombre: string;
  descripcion: string;
  aMedida: boolean;
  precioMes: number | null;
  precioAnual: number | null;
  ahorroAnual: number | null;
  /** Precio al mes con IGV (si los precios se muestran con IGV, es el que se muestra). */
  precioMesConIgv: number | null;
  capsulasMes: number | null;
  usuarios: number | null;
  capsulaAdicional: number | null;
  textoBoton: string;
  destacado: boolean;
  caracteristicas: string[];
  enlace: string;
}

export interface PlanesPublicados { ajustes: AjustesPlanes; planes: PlanPublico[] }

/** Proyección pública: los visibles por orden (y nombre), cada uno con sus características visibles y sus precios. */
export function planesPublicos(planes: readonly PlanGuardado[], ajustes: AjustesPlanes): PlanPublico[] {
  return planes
    .filter((p) => p.visible)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((p) => {
      const aMedida = p.precioMes === null;
      return {
        slug: p.slug,
        nombre: p.nombre,
        descripcion: p.descripcion,
        aMedida,
        precioMes: p.precioMes,
        precioAnual: precioAnualDe(p, ajustes.descuentoAnual),
        ahorroAnual: ahorroAnualDe(p, ajustes.descuentoAnual),
        precioMesConIgv: p.precioMes === null ? null : conIgv(p.precioMes),
        capsulasMes: p.capsulasMes,
        usuarios: p.usuarios,
        capsulaAdicional: aMedida ? null : p.capsulaAdicional,
        textoBoton: p.textoBoton,
        destacado: p.destacado,
        caracteristicas: p.caracteristicas.filter((c) => c.visible).map((c) => c.texto),
        enlace: `${RUTA_AGENDAR_PLAN}?plan=${encodeURIComponent(p.slug)}`,
      };
    });
}

/** Precio en soles con separador de miles y sin decimales si es entero: `S/ 1,290`, `S/ 88.20`. */
export function soles(n: number): string {
  const entero = Number.isInteger(n);
  return `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Los 3 planes del prototipo (`docs/23`, sección 7): ficticios, con precios por validar (DA-12, SUP-277). */
export const PLANES_DE_EJEMPLO: (DatosPlan & { orden: number })[] = [
  {
    slug: 'inicial', nombre: 'Inicial', descripcion: 'Para equipos de capacitación que empiezan con microaprendizaje.', precioMes: 490, precioAnual: null,
    capsulasMes: 5, usuarios: 3, capsulaAdicional: 89, textoBoton: 'Suscribirme', destacado: false, visible: true, orden: 0,
    caracteristicas: ['5 cápsulas al mes', 'Español', 'SCORM 1.2 y HTML', '1 kit de marca', 'Soporte por correo'].map((texto) => ({ texto, visible: true })),
  },
  {
    slug: 'productora', nombre: 'Productora', descripcion: 'Para productoras y áreas que entregan cápsulas cada semana.', precioMes: 1290, precioAnual: null,
    capsulasMes: 20, usuarios: 10, capsulaAdicional: 69, textoBoton: 'Suscribirme', destacado: true, visible: true, orden: 1,
    caracteristicas: ['20 cápsulas al mes', 'Español e inglés', 'Kits de marca ilimitados', 'Revisor del cliente con comentarios', 'Video interactivo', 'Soporte por WhatsApp'].map((texto) => ({ texto, visible: true })),
  },
  {
    slug: 'empresa', nombre: 'Empresa', descripcion: 'Para corporaciones con varios equipos y requisitos de seguridad.', precioMes: null, precioAnual: null,
    capsulasMes: null, usuarios: null, capsulaAdicional: null, textoBoton: 'Hablar con ventas', destacado: false, visible: true, orden: 2,
    caracteristicas: ['Cápsulas según contrato', 'Inicio de sesión único (SSO)', 'Retención de documentos a medida', 'Responsable de cuenta en Lima', 'Facturación anual'].map((texto) => ({ texto, visible: true })),
  },
];
