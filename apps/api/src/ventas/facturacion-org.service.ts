/**
 * HU-1711 · Portal de facturación de la organización (REQ-091, CP-153, PNT-40). Solo el ADMINISTRADOR y siempre con el
 * `organizacionId` de su sesión: un comprobante de otra organización da 404 (CP-153).
 *
 * - `resumen`: el plan, el consumo del mes, el medio de pago, los datos de facturación (los editados o, si no, los del
 *   alta) y los comprobantes.
 * - `archivo`: el PDF o el XML desde el almacenamiento, con auditoría.
 * - `guardarDatos`: crea o actualiza `DatosFacturacionOrg` (rige para los comprobantes nuevos, SUP-318), con auditoría.
 * - `cambiarMedio`: con la pasarela de pruebas guarda los 4 últimos dígitos de una tarjeta de prueba; con Stripe o Culqi
 *   responde 409 con el aviso del cobro por enlace (SUP-319, SUP-331).
 */
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { numeroCompleto } from '@aptio/schema/comprobantes';
import { type DatosFacturacion, validarDatosFacturacion, validarMedioPrueba } from '@aptio/schema/facturacion-org';
import { PASARELA_PRUEBA } from '@aptio/schema/suscripciones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { CON_REFERENCIA } from './comprobantes.service.js';
import { CuotasService } from './cuotas.service.js';
import type { ComprobanteOrgDto, DatosFacturacionDto, FacturacionOrgDto, MedioPagoDto } from './facturacion-org.dto.js';

const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });
const noEncontrado = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe' });
export const AVISO_COBRO_POR_ENLACE = 'Con esta pasarela la tarjeta no se guarda en Aptio SCORM: cada renovación te llega por correo con el enlace para pagar.';
const moneda = (m: string): 'PEN' | 'USD' => (m === 'USD' ? 'USD' : 'PEN');

@Injectable()
export class FacturacionOrgService {
  constructor(private readonly baseDatos: BaseDatosService, private readonly cuotas: CuotasService, private readonly almacenes: AlmacenService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async resumen(u: UsuarioSesion, ahora = new Date()): Promise<FacturacionOrgDto> {
    const organizacionId = organizacionDe(u);
    const [s, consumo, datos, filas] = await Promise.all([
      this.bd.suscripcion.findUnique({ where: { organizacionId }, include: { plan: { select: { nombre: true } } } }),
      this.cuotas.cuota(u, ahora),
      this.datos(organizacionId),
      this.bd.comprobante.findMany({ where: { organizacionId }, include: CON_REFERENCIA, orderBy: [{ emitidoEn: 'desc' }, { numero: 'desc' }], take: 100 }),
    ]);
    return {
      plan: s ? { nombre: s.plan.nombre, ciclo: s.ciclo, precioPactadoSinIgv: s.precioPactadoSinIgv, moneda: moneda(s.moneda), estado: s.estado, finPeriodo: s.finPeriodo.toISOString() } : null,
      consumo,
      medioPago: s ? this.medio(s.pasarela, s.ultimos4Digitos) : null,
      datos,
      comprobantes: filas.map((c): ComprobanteOrgDto => ({
        id: c.id, tipo: c.tipo, numeroCompleto: numeroCompleto(c.serie, c.numero), referencia: c.comprobanteReferencia ? numeroCompleto(c.comprobanteReferencia.serie, c.comprobanteReferencia.numero) : null,
        emitidoEn: c.emitidoEn.toISOString(), moneda: moneda(c.moneda), total: Number(c.total), estado: c.estado, conPdf: Boolean(c.s3KeyPdf), conXml: Boolean(c.s3KeyXml),
      })),
    };
  }

  private medio(pasarela: string, ultimos4Digitos: string | null): MedioPagoDto {
    const editable = pasarela === PASARELA_PRUEBA;
    return { pasarela, ultimos4Digitos, editable, aviso: editable ? null : AVISO_COBRO_POR_ENLACE };
  }

  /** Los editados en el portal o, si no, los del alta (la solicitud de la suscripción) o la organización con su primer administrador. */
  private async datos(organizacionId: string): Promise<DatosFacturacionDto> {
    const d = await this.bd.datosFacturacionOrg.findUnique({ where: { organizacionId } });
    if (d) return { razonSocial: d.razonSocial, ruc: d.ruc, direccion: d.direccion, correoFacturacion: d.correoFacturacion, tipoComprobantePreferido: d.tipoComprobantePreferido, origen: 'PORTAL' };
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId }, include: { solicitud: true } });
    const sol = s?.solicitud;
    if (sol) return { razonSocial: sol.razonSocial, ruc: sol.ruc, direccion: null, correoFacturacion: sol.correoAdmin, tipoComprobantePreferido: sol.tipoComprobante, origen: 'ALTA' };
    const org = await this.bd.organizacion.findUniqueOrThrow({ where: { id: organizacionId } });
    const admin = await this.bd.usuario.findFirst({ where: { organizacionId, rol: 'ADMINISTRADOR' }, orderBy: { creadoEn: 'asc' }, select: { email: true } });
    return { razonSocial: org.nombre, ruc: org.ruc, direccion: null, correoFacturacion: admin?.email ?? '', tipoComprobantePreferido: org.ruc ? 'FACTURA' : 'BOLETA', origen: 'ALTA' };
  }

  /** CP-153 · El archivo de un comprobante de la organización: 404 si es de otra o si aún no se generó. */
  async archivo(u: UsuarioSesion, id: string, formato: 'pdf' | 'xml'): Promise<{ contenido: Uint8Array; nombre: string; mime: string }> {
    const organizacionId = organizacionDe(u);
    const c = await this.bd.comprobante.findFirst({ where: { id, organizacionId } });
    if (!c) throw noEncontrado();
    const clave = formato === 'pdf' ? c.s3KeyPdf : c.s3KeyXml;
    if (!clave) throw new NotFoundException({ codigo: 'ARCHIVO_PENDIENTE', mensaje: 'El comprobante aún no tiene su archivo: se genera al emitirlo' });
    const contenido = await this.almacenes.almacen.leer(clave);
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'COMPROBANTE_DESCARGADO', entidad: 'Comprobante', entidadId: c.id, datos: { formato, numero: numeroCompleto(c.serie, c.numero), desde: 'portal' } } });
    return { contenido, nombre: clave.split('/').pop() ?? `${numeroCompleto(c.serie, c.numero)}.${formato}`, mime: formato === 'pdf' ? 'application/pdf' : 'application/xml' };
  }

  async guardarDatos(u: UsuarioSesion, entrada: unknown): Promise<DatosFacturacionDto> {
    const organizacionId = organizacionDe(u);
    const v = validarDatosFacturacion(entrada);
    if (!v.ok) throw noValido(v.errores);
    const antes = await this.datos(organizacionId);
    const d: DatosFacturacion = v.datos;
    await this.bd.$transaction(async (tx) => {
      const fila = await tx.datosFacturacionOrg.upsert({ where: { organizacionId }, create: { organizacionId, ...d }, update: d });
      await tx.auditoria.create({
        data: { organizacionId, usuarioId: u.id, accion: 'DATOS_FACTURACION_ACTUALIZADOS', entidad: 'DatosFacturacionOrg', entidadId: fila.id, datos: { antes, despues: { ...d } } as unknown as Prisma.InputJsonValue },
      });
    });
    return { ...d, origen: 'PORTAL' };
  }

  async cambiarMedio(u: UsuarioSesion, entrada: unknown): Promise<MedioPagoDto> {
    const organizacionId = organizacionDe(u);
    const s = await this.bd.suscripcion.findUnique({ where: { organizacionId } });
    if (!s) throw new NotFoundException({ codigo: 'SIN_SUSCRIPCION', mensaje: 'Tu organización no tiene una suscripción' });
    if (s.pasarela !== PASARELA_PRUEBA) throw new ConflictException({ codigo: 'MEDIO_NO_EDITABLE', mensaje: AVISO_COBRO_POR_ENLACE });
    const v = validarMedioPrueba(entrada);
    if (!v.ok) throw noValido(v.errores);
    await this.bd.$transaction(async (tx) => {
      await tx.suscripcion.update({ where: { id: s.id }, data: { ultimos4Digitos: v.ultimos4Digitos } });
      await tx.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'MEDIO_PAGO_ACTUALIZADO', entidad: 'Suscripcion', entidadId: s.id, datos: { pasarela: s.pasarela, antes: s.ultimos4Digitos, despues: v.ultimos4Digitos } } });
    });
    return this.medio(s.pasarela, v.ultimos4Digitos);
  }
}
