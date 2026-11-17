// HU-1709 · Cupones y convenios simulados, con las mismas reglas que la API (@aptio/schema/cupones): la pestaña Cupones
// de Ventas › Facturación (crear, editar, ocultar sin borrar, código único) y el cupón en /pago (vista previa y checkout).
import {
  aplicarCupon, beneficioDe, type CuponAplicable, type DatosCupon, finDiaLima, inicioDiaLima, normalizarCodigo, type ResultadoAplicar, validarCupon,
} from '@aptio/schema/cupones';
import type { ResumenCheckout } from '@aptio/schema/suscripciones';

type Respuesta = { status: number; body?: unknown };
type FilaSim = DatosCupon & { id: string; usos: number };

const fila = (n: number, d: Partial<DatosCupon> & Pick<DatosCupon, 'codigo' | 'nombre' | 'porcentaje'>, usos = 0): FilaSim => ({
  id: `00000000-0000-4000-9300-${String(n).padStart(12, '0')}`, tipo: 'CAMPANA', ciclosDescuento: null, vigenciaDesde: null, vigenciaHasta: null, limiteUsos: null, planesPermitidos: [],
  dominiosCorreo: [], visible: true, orden: n, usos, ...d,
});
/** Los cupones de ejemplo del prototipo (con fechas que no vencen mientras corran las pruebas, salvo el vencido). */
export const CUPONES_INICIALES: FilaSim[] = [
  fila(1, { codigo: 'LANZAMIENTO26', nombre: 'Lanzamiento 2026', porcentaje: 20, ciclosDescuento: 3, vigenciaDesde: '2026-11-01', vigenciaHasta: '2099-12-31', limiteUsos: 50 }, 18),
  fila(2, { codigo: 'CONVENIO-EDU', nombre: 'Convenio universidades', tipo: 'CONVENIO', porcentaje: 15, dominiosCorreo: ['pucp.edu.pe', 'uni.edu.pe'] }, 4),
  fila(3, { codigo: 'VERANO26', nombre: 'Verano 2026', porcentaje: 10, ciclosDescuento: 1, vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-03-31', limiteUsos: 100 }, 31),
  fila(4, { codigo: 'PILOTO-30', nombre: 'Piloto', porcentaje: 30, ciclosDescuento: 1, visible: false }),
];

const aplicable = (f: FilaSim): CuponAplicable => ({
  ...f, vigenciaDesde: f.vigenciaDesde ? inicioDiaLima(f.vigenciaDesde) : null, vigenciaHasta: f.vigenciaHasta ? finDiaLima(f.vigenciaHasta) : null,
});

export function crearCuponesSim() {
  const filas: FilaSim[] = CUPONES_INICIALES.map((c) => structuredClone(c));
  let secuencia = 100;
  const estado = (f: FilaSim, ahora = new Date()) => {
    const c = aplicable(f);
    if (!f.visible) return 'OCULTO';
    if (c.vigenciaHasta && ahora > c.vigenciaHasta) return 'VENCIDO';
    if (f.limiteUsos !== null && f.usos >= f.limiteUsos) return 'AGOTADO';
    if (c.vigenciaDesde && ahora < c.vigenciaDesde) return 'PROGRAMADO';
    return 'ACTIVO';
  };
  const dto = (f: FilaSim) => ({ ...f, beneficio: beneficioDe(f), estado: estado(f) });
  const noValido = (errores: { campo: string; mensaje: string }[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });
  const enUso = (codigo: string, id?: string) => filas.some((x) => x.codigo === codigo && x.id !== id);

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>): Respuesta | null {
    if (ruta === '/ventas/cupones' && metodo === 'GET') return { status: 200, body: { cupones: [...filas].sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo)).map(dto) } };
    if (ruta === '/ventas/cupones' && metodo === 'POST') {
      const v = validarCupon(cuerpo);
      if (!v.ok) return noValido(v.errores);
      if (enUso(v.datos.codigo)) return { status: 409, body: { codigo: 'CODIGO_EN_USO', mensaje: 'Ya hay un cupón con ese código', detalles: [{ campo: 'codigo', mensaje: 'Ya hay un cupón con ese código' }] } };
      const f: FilaSim = { ...v.datos, id: `00000000-0000-4000-9300-${String(++secuencia).padStart(12, '0')}`, usos: 0 };
      filas.push(f);
      return { status: 201, body: dto(f) };
    }
    const m = ruta.match(/^\/ventas\/cupones\/([0-9a-f-]{36})$/);
    if (m && metodo === 'PATCH') {
      const f = filas.find((x) => x.id === m[1]);
      if (!f) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El cupón no existe' } };
      const v = validarCupon(cuerpo, f);
      if (!v.ok) return noValido(v.errores);
      if (enUso(v.datos.codigo, f.id)) return { status: 409, body: { codigo: 'CODIGO_EN_USO', mensaje: 'Ya hay un cupón con ese código', detalles: [{ campo: 'codigo', mensaje: 'Ya hay un cupón con ese código' }] } };
      Object.assign(f, v.datos);
      return { status: 200, body: dto(f) };
    }
    return null;
  }

  /** El cupón en /pago: el mismo `aplicarCupon` de la API (sin «ya usado»: el simulador no guarda altas por empresa). */
  function aplicar(codigo: unknown, plan: { slug: string; aMedida?: boolean }, resumen: ResumenCheckout, correo: string | null): ResultadoAplicar {
    const f = filas.find((x) => x.codigo === normalizarCodigo(codigo));
    return aplicarCupon(f ? aplicable(f) : null, { plan, correo, ahora: new Date() }, resumen);
  }
  /** Al aprobarse un alta con cupón, un uso más. */
  const usar = (codigo: string) => { const f = filas.find((x) => x.codigo === codigo); if (f) f.usos += 1; };
  return { panel, aplicar, usar, filas };
}
export type CuponesSim = ReturnType<typeof crearCuponesSim>;
