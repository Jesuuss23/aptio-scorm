/**
 * HU-1709 · Cupones y convenios (REQ-089, CP-151, PNT-37).
 *
 * - `listar`, `crear` y `editar`: la pestaña Cupones de Ventas › Facturación, solo el superadmin y con auditoría. Sin
 *   borrar: ocultar (`visible: false`) lo retira del pago y conserva los usos.
 * - `aplicar`: lo que usan la vista previa y el checkout de `/pago`. Busca el cupón por su código, mira si la empresa ya
 *   lo usó (por el correo del administrador o el RUC, en un alta aprobada) y aplica `aplicarCupon`.
 * - `usarEnAlta`: el webhook, al aprobarse un alta con cupón, bloquea su fila (`FOR UPDATE`) y suma el uso. Si dos pagos
 *   concurren en el último cupo se respetan los dos y queda la auditoría CUPON_USO_SOBRE_LIMITE (SUP-326).
 */
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@aptio/db';
import {
  aplicarCupon, beneficioDe, type ContextoCupon, type CuponAplicable, type DatosCupon, diaLima, finDiaLima, inicioDiaLima, normalizarCodigo, type ResultadoAplicar, validarCupon,
} from '@aptio/schema/cupones';
import type { ResumenCheckout } from '@aptio/schema/suscripciones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { CuponDto, CuponesDto } from './cupones.dto.js';

type Tx = Prisma.TransactionClient;
type FilaCupon = Prisma.CuponGetPayload<object>;

const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/** La fila con sus días de Lima, como la valida `validarCupon` al editar. */
const aDatos = (c: FilaCupon): DatosCupon => ({
  codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, porcentaje: c.porcentaje, ciclosDescuento: c.ciclosDescuento, vigenciaDesde: c.vigenciaDesde ? diaLima(c.vigenciaDesde) : null,
  vigenciaHasta: c.vigenciaHasta ? diaLima(c.vigenciaHasta) : null, limiteUsos: c.limiteUsos, planesPermitidos: c.planesPermitidos, dominiosCorreo: c.dominiosCorreo, visible: c.visible, orden: c.orden,
});
const aFila = (d: DatosCupon) => ({
  ...d, vigenciaDesde: d.vigenciaDesde ? inicioDiaLima(d.vigenciaDesde) : null, vigenciaHasta: d.vigenciaHasta ? finDiaLima(d.vigenciaHasta) : null,
});

/** El estado que muestra la consola: oculto, programado, vencido, agotado o activo. */
export function estadoCupon(c: Pick<FilaCupon, 'visible' | 'vigenciaDesde' | 'vigenciaHasta' | 'limiteUsos' | 'usos'>, ahora: Date): CuponDto['estado'] {
  if (!c.visible) return 'OCULTO';
  if (c.vigenciaHasta && ahora.getTime() > c.vigenciaHasta.getTime()) return 'VENCIDO';
  if (c.limiteUsos !== null && c.usos >= c.limiteUsos) return 'AGOTADO';
  if (c.vigenciaDesde && ahora.getTime() < c.vigenciaDesde.getTime()) return 'PROGRAMADO';
  return 'ACTIVO';
}

export const aCuponDto = (c: FilaCupon, ahora = new Date()): CuponDto => ({
  id: c.id, ...aDatos(c), usos: c.usos, beneficio: beneficioDe(c), estado: estadoCupon(c, ahora),
});

@Injectable()
export class CuponesService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  // ── Consola (superadmin) ───────────────────────────────────────────────────────────────────────────────────────────

  async listar(ahora = new Date()): Promise<CuponesDto> {
    const filas = await this.bd.cupon.findMany({ orderBy: [{ orden: 'asc' }, { codigo: 'asc' }], take: 500 });
    return { cupones: filas.map((c) => aCuponDto(c, ahora)) };
  }

  async crear(u: UsuarioSesion, entrada: unknown): Promise<CuponDto> {
    const v = validarCupon(entrada);
    if (!v.ok) throw noValido(v.errores);
    try {
      const c = await this.bd.$transaction(async (tx) => {
        const c = await tx.cupon.create({ data: aFila(v.datos) });
        await tx.auditoria.create({ data: { organizacionId: null, usuarioId: u.id, accion: 'CUPON_CREADO', entidad: 'Cupon', entidadId: c.id, datos: { ...v.datos } } });
        return c;
      });
      return aCuponDto(c);
    } catch (e) {
      throw this.codigoEnUso(e);
    }
  }

  /** PATCH: solo los campos que llegan, sobre el cupón actual (los usos no se editan). */
  async editar(u: UsuarioSesion, id: string, entrada: unknown): Promise<CuponDto> {
    const actual = await this.bd.cupon.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El cupón no existe' });
    const v = validarCupon(entrada, aDatos(actual));
    if (!v.ok) throw noValido(v.errores);
    const antes = aDatos(actual);
    const cambios = Object.fromEntries(Object.entries(v.datos).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(antes[k as keyof DatosCupon])));
    try {
      const c = await this.bd.$transaction(async (tx) => {
        const c = await tx.cupon.update({ where: { id }, data: aFila(v.datos) });
        await tx.auditoria.create({
          data: { organizacionId: null, usuarioId: u.id, accion: 'CUPON_ACTUALIZADO', entidad: 'Cupon', entidadId: id, datos: { cambios, antes: Object.fromEntries(Object.keys(cambios).map((k) => [k, antes[k as keyof DatosCupon]])) } as Prisma.InputJsonValue },
        });
        return c;
      });
      return aCuponDto(c);
    } catch (e) {
      throw this.codigoEnUso(e);
    }
  }

  private codigoEnUso(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException({ codigo: 'CODIGO_EN_USO', mensaje: 'Ya hay un cupón con ese código', detalles: [{ campo: 'codigo', mensaje: 'Ya hay un cupón con ese código' }] });
    return e;
  }

  // ── Pago ───────────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Aplica el código al resumen del pago. `empresa` es el correo del administrador y el RUC, si ya se escribieron: con
   * ellos se revisa el convenio y si la empresa ya usó el cupón en un alta aprobada.
   */
  async aplicar(codigo: unknown, plan: ContextoCupon['plan'], resumen: ResumenCheckout, empresa: { correo?: string | null; ruc?: string | null }, ahora = new Date()): Promise<{ resultado: ResultadoAplicar; cuponId: string | null }> {
    const c = normalizarCodigo(codigo);
    const fila = c ? await this.bd.cupon.findUnique({ where: { codigo: c } }) : null;
    const correo = empresa.correo?.trim().toLowerCase() || null;
    const ruc = empresa.ruc?.replace(/[\s-]/g, '') || null;
    const yaUsado = fila && (correo || ruc)
      ? Boolean(await this.bd.solicitudSuscripcion.findFirst({
        where: { cuponId: fila.id, estado: 'APROBADA', organizacionId: { not: null }, OR: [...(correo ? [{ correoAdmin: correo }] : []), ...(ruc ? [{ ruc }] : [])] }, select: { id: true },
      }))
      : false;
    const resultado = aplicarCupon(fila as CuponAplicable | null, { plan, correo, yaUsado, ahora }, resumen);
    return { resultado, cuponId: resultado.ok ? fila!.id : null };
  }

  /**
   * El webhook, dentro de la transacción del alta aprobada: bloquea el cupón, suma el uso y devuelve los ciclos del
   * cupón. Si ya no quedaban usos, el pago igual se respeta y queda la auditoría (SUP-326).
   */
  async usarEnAlta(tx: Tx, cuponId: string, contexto: { solicitudId: string; organizacionId: string; eventoId: string }): Promise<{ ciclosDescuento: number | null }> {
    await tx.$queryRaw`SELECT "id" FROM "Cupon" WHERE "id" = ${cuponId}::uuid FOR UPDATE`;
    const c = await tx.cupon.findUniqueOrThrow({ where: { id: cuponId } });
    const sobreLimite = c.limiteUsos !== null && c.usos >= c.limiteUsos;
    await tx.cupon.update({ where: { id: c.id }, data: { usos: { increment: 1 } } });
    await tx.auditoria.create({
      data: {
        organizacionId: contexto.organizacionId, usuarioId: null, accion: sobreLimite ? 'CUPON_USO_SOBRE_LIMITE' : 'CUPON_USADO', entidad: 'Cupon', entidadId: c.id,
        datos: { codigo: c.codigo, usos: c.usos + 1, limiteUsos: c.limiteUsos, solicitudId: contexto.solicitudId, eventoId: contexto.eventoId },
      },
    });
    return { ciclosDescuento: c.ciclosDescuento };
  }
}
