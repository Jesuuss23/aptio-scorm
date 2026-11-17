import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { esCodigoPasarela } from '@aptio/schema/pasarelas';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ErrorPasarela } from './pasarelas/contrato.js';
import { PasarelasService } from './pasarelas.service.js';
import type { CobroDto, CobrosDto } from './pasarelas.dto.js';

const CON_SOLICITUD = { solicitud: { include: { plan: true } }, compraCapsulas: { include: { organizacion: true, suscripcion: { include: { plan: true } } } } } as const;
type FilaCobro = Prisma.CobroGetPayload<{ include: typeof CON_SOLICITUD }>;

/**
 * HU-1704 · Los cobros aprobados (REQ-084, REQ-110) y el reembolso de un pago aprobado sin alta (SUP-291): el superadmin
 * lo pide, la pasarela devuelve el dinero y el cobro queda REEMBOLSADO con auditoría. La nota de crédito llega con la
 * HU-1707. Un cobro con suscripción no se reembolsa aquí: eso es cancelar, que llega con la HU-1706.
 */
@Injectable()
export class CobrosService {
  private readonly log = new Logger('Cobros');

  constructor(private readonly baseDatos: BaseDatosService, private readonly pasarelas: PasarelasService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(filtro: { estado?: 'APROBADO' | 'REEMBOLSADO' | undefined; sinAlta?: boolean | undefined }): Promise<CobrosDto> {
    const filas = await this.bd.cobro.findMany({
      where: { ...(filtro.estado ? { estado: filtro.estado } : {}), ...(filtro.sinAlta === undefined ? {} : filtro.sinAlta ? { suscripcionId: null } : { suscripcionId: { not: null } }) },
      include: CON_SOLICITUD, orderBy: { creadoEn: 'desc' }, take: 200,
    });
    const correos = await this.correosDe(filas);
    return { cobros: filas.map((c) => this.aDto(c, correos)) };
  }

  async obtener(id: string): Promise<CobroDto> {
    const c = await this.buscar(id);
    return this.aDto(c, await this.correosDe([c]));
  }

  /**
   * Reembolsa un cobro aprobado sin alta. Primero lo marca REEMBOLSADO de forma condicional (dos pedidos a la vez: solo
   * uno pasa) y luego llama a la pasarela con el id del cobro como clave de idempotencia; si la pasarela falla, el cobro
   * vuelve a APROBADO y responde 502.
   */
  async reembolsar(u: UsuarioSesion, id: string, ahora = new Date()): Promise<CobroDto> {
    const c = await this.buscar(id);
    if (c.suscripcionId) throw new ConflictException({ codigo: 'COBRO_CON_SUSCRIPCION', mensaje: 'Este cobro está acreditado a una suscripción: se devuelve al cancelarla, no desde aquí' });
    const tomado = await this.bd.cobro.updateMany({ where: { id, estado: 'APROBADO', suscripcionId: null }, data: { estado: 'REEMBOLSADO', reembolsadoEn: ahora } });
    if (tomado.count === 0) throw new ConflictException({ codigo: 'COBRO_YA_REEMBOLSADO', mensaje: 'Este cobro ya se reembolsó' });
    try {
      if (!esCodigoPasarela(c.pasarela)) throw new ErrorPasarela(`Pasarela desconocida: ${c.pasarela}`);
      if (!c.tokenPago) throw new ErrorPasarela('El cobro no tiene la referencia de la pasarela');
      const config = await this.pasarelas.config(c.pasarela);
      if (!config || !this.pasarelas.activa(config)) throw new ErrorPasarela(`La pasarela ${c.pasarela} no está activa`);
      const { reembolsoId } = await this.pasarelas.adaptador(config.codigo).reembolsar(config.modo, { referencia: c.tokenPago, monto: Number(c.monto), moneda: c.moneda === 'USD' ? 'USD' : 'PEN', idempotencia: c.id });
      const hecho = await this.bd.cobro.update({ where: { id }, data: { reembolsoId }, include: CON_SOLICITUD });
      await this.bd.auditoria.create({
        data: { organizacionId: null, usuarioId: u.id, accion: 'COBRO_REEMBOLSADO', entidad: 'Cobro', entidadId: id, datos: { pasarela: c.pasarela, monto: Number(c.monto), moneda: c.moneda, reembolsoId, solicitudId: c.solicitudSuscripcionId, compraCapsulasId: c.compraCapsulasId } },
      });
      return this.aDto(hecho, await this.correosDe([hecho]));
    } catch (e) {
      await this.bd.cobro.update({ where: { id }, data: { estado: 'APROBADO', reembolsadoEn: null } });
      const mensaje = e instanceof Error ? e.message : String(e);
      this.log.error(`No se pudo reembolsar el cobro ${id}: ${mensaje}`);
      await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: u.id, accion: 'COBRO_REEMBOLSO_FALLIDO', entidad: 'Cobro', entidadId: id, datos: { pasarela: c.pasarela, error: mensaje.slice(0, 300) } } });
      throw new BadGatewayException({ codigo: 'PASARELA_NO_RESPONDE', mensaje: e instanceof ErrorPasarela && e.motivo ? e.motivo : 'La pasarela no completó el reembolso: intenta de nuevo en unos minutos' });
    }
  }

  private async buscar(id: string): Promise<FilaCobro> {
    const c = await this.bd.cobro.findUnique({ where: { id }, include: CON_SOLICITUD });
    if (!c) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El cobro no existe' });
    return c;
  }

  /** HU-1705 · El correo de quien pidió cada compra de cápsulas (la compra guarda solo su id). */
  private async correosDe(filas: FilaCobro[]): Promise<Map<string, string>> {
    const ids = [...new Set(filas.flatMap((c) => (c.compraCapsulas ? [c.compraCapsulas.pedidoPorId] : [])))];
    if (!ids.length) return new Map();
    const usuarios = await this.bd.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    return new Map(usuarios.map((x) => [x.id, x.email]));
  }

  private aDto(c: FilaCobro, correos: Map<string, string>): CobroDto {
    const compra = c.compraCapsulas;
    const motivo = c.suscripcionId ? null
      : compra ? (compra.motivoRechazo ?? 'El pago llegó cuando la compra ya estaba cerrada')
        : (c.solicitud?.motivoRechazo ?? 'El pago llegó cuando la solicitud ya estaba cerrada');
    const origen = compra
      ? { razonSocial: compra.organizacion.nombre, correoAdmin: correos.get(compra.pedidoPorId) ?? '', nombrePlan: `${compra.suscripcion.plan.nombre} · ${compra.cantidad} ${compra.cantidad === 1 ? 'cápsula adicional' : 'cápsulas adicionales'}` }
      : { razonSocial: c.solicitud?.razonSocial ?? '', correoAdmin: c.solicitud?.correoAdmin ?? '', nombrePlan: c.solicitud?.plan.nombre ?? '' };
    return {
      id: c.id, solicitudId: c.solicitudSuscripcionId, compraCapsulasId: c.compraCapsulasId, concepto: compra ? 'CAPSULAS' : 'SUSCRIPCION', suscripcionId: c.suscripcionId, ...origen,
      monto: Number(c.monto), moneda: c.moneda === 'USD' ? 'USD' : 'PEN', pasarela: c.pasarela, ultimos4Digitos: c.ultimos4Digitos, estado: c.estado, motivoSinAlta: motivo,
      reembolsable: c.estado === 'APROBADO' && !c.suscripcionId, reembolsoId: c.reembolsoId, reembolsadoEn: c.reembolsadoEn?.toISOString() ?? null, creadoEn: c.creadoEn.toISOString(),
    };
  }
}
