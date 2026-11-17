import {
  ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import {
  COLA_COMPROBANTES, type DatosComprobante, idTareaNotaCredito, idTareaReenvio, opcionesRedis, opcionesTareaComprobante, prefijoColas, TAREA_EMITIR_COMPROBANTE,
} from '@aptio/colas';
import { Prisma } from '@aptio/db';
import {
  esCodigoOse, leerEventoOse, numeroCompleto, PROVEEDORES_OSE, validarDatosFiscales, validarReceptor,
} from '@aptio/schema/comprobantes';
import { Queue } from 'bullmq';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { ComprobanteDto, ComprobantesDto, DatosFiscalesDto, EventoOseRecibidoDto } from './comprobantes.dto.js';
import { type Cabeceras, cabecera } from './pasarelas/contrato.js';
import { CABECERA_FIRMA, firmaValida } from './pasarelas/pruebas.js';

type Estado = 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
const noValido = (errores: { campo: string; mensaje: string }[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });
const noEncontrado = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe' });
/** Sin la variable, un secreto local fijo que solo vale en pruebas (como la pasarela de pruebas). */
const SECRETO_OSE_PRUEBAS_LOCAL = 'secreto-local-del-ose-de-pruebas';
const CON_REFERENCIA = { comprobanteReferencia: { select: { serie: true, numero: true } } } as const;
type Fila = Prisma.ComprobanteGetPayload<{ include: typeof CON_REFERENCIA }>;

/**
 * HU-1707 · Comprobantes electrónicos SUNAT (REQ-087, CP-148, CP-149, PNT-37). La emisión la hace el worker (cola
 * `comprobantes`); aquí el superadmin los lista, descarga el PDF y el XML, corrige el receptor de un observado y lo
 * reenvía, y mantiene los datos fiscales del emisor. El OSE avisa del estado por su webhook firmado. Un reembolso
 * encola la nota de crédito que corrige el comprobante original (DA-09: hoy solo el OSE simulado).
 */
@Injectable()
export class ComprobantesService implements OnModuleDestroy {
  private readonly log = new Logger('Comprobantes');
  private cola?: Queue<DatosComprobante>;

  constructor(private readonly baseDatos: BaseDatosService, private readonly almacenes: AlmacenService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  get colaComprobantes(): Queue<DatosComprobante> {
    this.cola ??= new Queue<DatosComprobante>(COLA_COMPROBANTES, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }

  /** Los proveedores OSE de este entorno: el simulado solo existe con SITIO_ENTORNO=pruebas (SUP-314). */
  disponible(codigo: string): boolean {
    const p = PROVEEDORES_OSE.find((x) => x.codigo === codigo);
    return !!p && (!p.soloPruebas || entornoActual() === 'pruebas');
  }

  async listar(filtro: { estado?: Estado | undefined }): Promise<ComprobantesDto> {
    const filas = await this.bd.comprobante.findMany({ where: filtro.estado ? { estado: filtro.estado } : {}, include: CON_REFERENCIA, orderBy: [{ emitidoEn: 'desc' }, { numero: 'desc' }], take: 200 });
    return { comprobantes: filas.map(aDto) };
  }

  async obtener(id: string): Promise<ComprobanteDto> {
    return aDto(await this.buscar(id));
  }

  /** El PDF o el XML guardado en S3, con auditoría de la descarga. 404 mientras el worker no los haya generado. */
  async archivo(u: UsuarioSesion, id: string, formato: 'pdf' | 'xml'): Promise<{ contenido: Uint8Array; nombre: string; mime: string }> {
    const c = await this.buscar(id);
    const clave = formato === 'pdf' ? c.s3KeyPdf : c.s3KeyXml;
    if (!clave) throw new NotFoundException({ codigo: 'ARCHIVO_PENDIENTE', mensaje: 'El comprobante aún no tiene su archivo: se genera al emitirlo' });
    const contenido = await this.almacenes.almacen.leer(clave);
    await this.auditar(u, 'COMPROBANTE_DESCARGADO', c.id, { formato, numero: numeroCompleto(c.serie, c.numero) });
    const nombre = clave.split('/').pop() ?? `${numeroCompleto(c.serie, c.numero)}.${formato}`;
    return { contenido, nombre, mime: formato === 'pdf' ? 'application/pdf' : 'application/xml' };
  }

  /**
   * CP-149 · Corrige el receptor de un comprobante observado (o pendiente) y lo vuelve a enviar al OSE con el mismo
   * número: el worker lo toma con su id. Un aceptado o rechazado no se toca (el rechazado se corrige con otro número).
   */
  async reenviar(u: UsuarioSesion, id: string, cuerpo: Record<string, unknown>): Promise<ComprobanteDto> {
    const c = await this.buscar(id);
    if (c.estado !== 'OBSERVADO' && c.estado !== 'PENDIENTE') {
      throw new ConflictException({ codigo: 'COMPROBANTE_NO_REENVIABLE', mensaje: c.estado === 'ACEPTADO' ? 'El comprobante ya fue aceptado' : 'Un comprobante rechazado no se reenvía: su número no se reutiliza' });
    }
    const v = { ruc: cuerpo?.ruc ?? null, razonSocial: cuerpo?.razonSocial, direccion: cuerpo?.direccion ?? null, correoFacturacion: cuerpo?.correoFacturacion };
    const errores = validarReceptor(v, c.tipo);
    if (errores.length) throw noValido(errores);
    const limpio = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
    const nuevo = { ruc: limpio(v.ruc), razonSocial: String(v.razonSocial).trim(), direccion: limpio(v.direccion), correoFacturacion: String(v.correoFacturacion).trim() };
    const tomado = await this.bd.comprobante.updateMany({
      where: { id, estado: { in: ['OBSERVADO', 'PENDIENTE'] } }, data: { ...nuevo, estado: 'PENDIENTE', motivo: 'Corregido y reenviado: esperando la respuesta del OSE' },
    });
    if (tomado.count === 0) throw new ConflictException({ codigo: 'COMPROBANTE_NO_REENVIABLE', mensaje: 'El comprobante cambió de estado: vuelve a cargarlo' });
    await this.auditar(u, 'COMPROBANTE_REENVIADO', c.id, {
      numero: numeroCompleto(c.serie, c.numero), estadoAnterior: c.estado,
      antes: { ruc: c.ruc, razonSocial: c.razonSocial, direccion: c.direccion, correoFacturacion: c.correoFacturacion }, despues: nuevo,
    });
    await this.encolar({ cobroId: c.cobroId, comprobanteId: c.id }, idTareaReenvio(c.id, `${c.intentos}-${Date.now()}`), true);
    return aDto(await this.buscar(id));
  }

  /** HU-1707 · Tras un reembolso: la nota de crédito del cobro (una por cobro). El worker espera al original si aún no está. */
  async encolarNotaCredito(cobroId: string): Promise<void> {
    await this.encolar({ cobroId, tipo: 'NOTA_CREDITO' }, idTareaNotaCredito(cobroId), false);
  }

  async datosFiscales(): Promise<DatosFiscalesDto> {
    const f = await this.bd.datosFiscales.upsert({ where: { id: 'principal' }, create: {}, update: {} });
    return {
      rucEmisor: f.rucEmisor, razonSocialEmisor: f.razonSocialEmisor, direccionEmisor: f.direccionEmisor,
      serieFactura: f.serieFactura, serieBoleta: f.serieBoleta, serieNotaFactura: f.serieNotaFactura, serieNotaBoleta: f.serieNotaBoleta,
      proveedor: f.proveedor, ambiente: f.ambiente === 'produccion' ? 'produccion' : 'pruebas',
      detraccionActiva: f.detraccionActiva, detraccionTasa: Number(f.detraccionTasa), detraccionUmbralPen: Number(f.detraccionUmbralPen),
      proveedores: PROVEEDORES_OSE.map((p) => ({ codigo: p.codigo, nombre: p.nombre, disponible: this.disponible(p.codigo) })),
      actualizadoEn: f.actualizadoEn.toISOString(),
    };
  }

  /** Guarda los datos fiscales (emisor, series, proveedor, ambiente y detracción). Los secretos del OSE no pasan por aquí. */
  async guardarDatosFiscales(u: UsuarioSesion, cuerpo: Record<string, unknown>): Promise<DatosFiscalesDto> {
    const v: Record<string, unknown> = { ...cuerpo, rucEmisor: cuerpo?.rucEmisor === '' ? null : cuerpo?.rucEmisor ?? null };
    const errores = validarDatosFiscales(v, PROVEEDORES_OSE.map((p) => p.codigo));
    const proveedor = PROVEEDORES_OSE.find((p) => p.codigo === v.proveedor);
    if (proveedor?.soloPruebas && v.ambiente === 'produccion') errores.push({ campo: 'ambiente', mensaje: 'El OSE de pruebas solo emite en el ambiente de pruebas' });
    const conocidos = new Set(['rucEmisor', 'razonSocialEmisor', 'direccionEmisor', 'serieFactura', 'serieBoleta', 'serieNotaFactura', 'serieNotaBoleta', 'proveedor', 'ambiente', 'detraccionActiva', 'detraccionTasa', 'detraccionUmbralPen']);
    for (const k of Object.keys(cuerpo ?? {})) if (!conocidos.has(k)) errores.push({ campo: k, mensaje: `«${k}» no es un dato fiscal` });
    if (errores.length) throw noValido(errores);
    const datos = {
      rucEmisor: (v.rucEmisor as string | null) ?? null, razonSocialEmisor: String(v.razonSocialEmisor).trim(), direccionEmisor: String(v.direccionEmisor).trim(),
      serieFactura: String(v.serieFactura), serieBoleta: String(v.serieBoleta), serieNotaFactura: String(v.serieNotaFactura), serieNotaBoleta: String(v.serieNotaBoleta),
      proveedor: String(v.proveedor), ambiente: String(v.ambiente),
      detraccionActiva: Boolean(v.detraccionActiva), detraccionTasa: Number(v.detraccionTasa), detraccionUmbralPen: Number(v.detraccionUmbralPen),
    };
    await this.bd.datosFiscales.upsert({ where: { id: 'principal' }, create: datos, update: datos });
    await this.auditar(u, 'DATOS_FISCALES_ACTUALIZADOS', 'principal', datos, 'DatosFiscales');
    return this.datosFiscales();
  }

  /**
   * `POST /webhooks/ose/{proveedor}`: el OSE avisa el estado de un comprobante. 404 si el proveedor no existe aquí; 401
   * si la firma (HMAC-SHA256 del cuerpo tal como llegó) no coincide; un aviso repetido (mismo id) no cambia nada. Un
   * estado final (aceptado o rechazado) no vuelve atrás. Aceptado y sin correo, encola el envío.
   */
  async recibirWebhook(proveedor: string, cuerpo: Buffer | undefined, cabeceras: Cabeceras): Promise<EventoOseRecibidoDto> {
    if (!esCodigoOse(proveedor) || !this.disponible(proveedor)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El proveedor no existe en este entorno' });
    const crudo = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.alloc(0);
    if (!firmaValida(this.secreto(proveedor), crudo, cabecera(cabeceras, CABECERA_FIRMA))) throw new UnauthorizedException({ codigo: 'FIRMA_NO_VALIDA', mensaje: 'La firma del aviso no es válida' });
    let json: unknown = null;
    try { json = JSON.parse(crudo.toString('utf8')); } catch { /* queda null */ }
    const ev = leerEventoOse(json);
    if (!ev) throw new UnprocessableEntityException({ codigo: 'EVENTO_NO_VALIDO', mensaje: 'El aviso no tiene la forma esperada' });
    const c = await this.bd.comprobante.findUnique({ where: { serie_numero: { serie: ev.serie, numero: ev.numero } } });
    if (!c || c.proveedor !== proveedor) throw noEncontrado();
    let enviarCorreo = false;
    try {
      await this.bd.$transaction(async (tx) => {
        await tx.eventoOse.create({ data: { id: `${proveedor}:${ev.id}`, comprobanteId: c.id, estado: ev.estado } });
        const actual = await tx.comprobante.findUniqueOrThrow({ where: { id: c.id } });
        if (actual.estado === 'ACEPTADO' || actual.estado === 'RECHAZADO') return;
        const hecho = await tx.comprobante.update({ where: { id: c.id }, data: { estado: ev.estado, motivo: ev.motivo } });
        enviarCorreo = hecho.estado === 'ACEPTADO' && !hecho.correoEnviadoEn;
        await tx.auditoria.create({
          data: { organizacionId: null, usuarioId: null, accion: 'COMPROBANTE_ESTADO_OSE', entidad: 'Comprobante', entidadId: c.id, datos: { proveedor, eventoId: ev.id, estadoAnterior: actual.estado, estado: ev.estado, motivo: ev.motivo } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { recibido: true, duplicado: true };
      throw e;
    }
    if (enviarCorreo) await this.encolar({ cobroId: c.cobroId, comprobanteId: c.id }, idTareaReenvio(c.id, `ose-${ev.id}`), false);
    return { recibido: true, duplicado: false };
  }

  private secreto(proveedor: string): string {
    return proveedor === 'pruebas' ? process.env.OSE_PRUEBAS_SECRETO_WEBHOOK || SECRETO_OSE_PRUEBAS_LOCAL : '';
  }

  private async encolar(datos: DatosComprobante, jobId: string, exigir: boolean): Promise<void> {
    try {
      await this.colaComprobantes.add(TAREA_EMITIR_COMPROBANTE, datos, opcionesTareaComprobante(datos.cobroId, jobId));
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      this.log.error(`No se pudo encolar ${jobId}: ${mensaje}`);
      if (exigir) throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE', mensaje: 'No se pudo encolar el reenvío: intenta de nuevo en unos minutos' });
    }
  }

  private async buscar(id: string): Promise<Fila> {
    const c = await this.bd.comprobante.findUnique({ where: { id }, include: CON_REFERENCIA });
    if (!c) throw noEncontrado();
    return c;
  }

  private async auditar(u: UsuarioSesion, accion: string, entidadId: string, datos: Prisma.InputJsonValue, entidad = 'Comprobante'): Promise<void> {
    await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: u.id, accion, entidad, entidadId, datos } });
  }
}

function aDto(c: Fila): ComprobanteDto {
  return {
    id: c.id, tipo: c.tipo, serie: c.serie, numero: c.numero, numeroCompleto: numeroCompleto(c.serie, c.numero), cobroId: c.cobroId,
    referencia: c.comprobanteReferencia ? numeroCompleto(c.comprobanteReferencia.serie, c.comprobanteReferencia.numero) : null,
    ruc: c.ruc, razonSocial: c.razonSocial, direccion: c.direccion, correoFacturacion: c.correoFacturacion, moneda: c.moneda === 'USD' ? 'USD' : 'PEN',
    baseSinIgv: Number(c.baseSinIgv), igv: Number(c.igv), total: Number(c.total), detraccion: c.detraccion === null ? null : Number(c.detraccion),
    estado: c.estado, motivo: c.motivo, proveedor: c.proveedor, ambiente: c.ambiente, conArchivos: Boolean(c.s3KeyPdf && c.s3KeyXml),
    reenviable: c.estado === 'OBSERVADO' || c.estado === 'PENDIENTE', intentos: c.intentos, emitidoEn: c.emitidoEn.toISOString(), correoEnviadoEn: c.correoEnviadoEn?.toISOString() ?? null,
  };
}

