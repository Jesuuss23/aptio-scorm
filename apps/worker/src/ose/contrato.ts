// HU-1707 / HU-1712 · El contrato común de los proveedores OSE/PSE (DA-09). Cada adaptador recibe los datos estructurados
// del comprobante (y el XML UBL sin firmar, que usa el simulado) y devuelve el estado ante SUNAT. Un proveedor real
// (Mifact) firma el XML, lo envía a SUNAT y devuelve sus propios archivos: el XML firmado, el CDR y el PDF oficial.
import type { EstadoComprobante, MonedaComprobante, TipoComprobante } from '@aptio/schema/comprobantes';

/** Todo lo que el proveedor necesita para emitir, sin depender de la base de datos. */
export interface DatosEnvio {
  tipo: TipoComprobante; serie: string; numero: number; emitidoEn: Date; moneda: MonedaComprobante;
  emisor: { ruc: string; razonSocial: string; direccion: string; ubigeo: string; codigoAnexo: string };
  receptor: { ruc: string | null; dni: string | null; razonSocial: string; direccion: string | null };
  descripcion: string; baseSinIgv: number; igv: number; total: number;
  /** Solo en una factura en soles sobre el umbral: monto en soles, tasa en %, cuenta del Banco de la Nación y código SPOT. */
  detraccion: { monto: number; tasa: number; cuenta: string; codigo: string } | null;
  /** Solo en una nota de crédito: el comprobante que corrige. */
  referencia: { tipo: 'FACTURA' | 'BOLETA'; serie: string; numero: number; emitidoEn: Date; motivo: string } | null;
}

export interface EnvioOse {
  tipo: TipoComprobante; serie: string; numero: number; rucEmisor: string; receptorRuc: string | null; ambiente: string;
  /** El XML UBL 2.1 sin firmar que arma Aptio (lo usa el simulado; un proveedor real arma y firma el suyo). */
  xml: string;
  datos: DatosEnvio;
}

/** Los archivos oficiales que devuelve un proveedor real. */
export interface ArchivosOse { xmlFirmado?: string; cdr?: string; pdf?: Uint8Array }

export interface RespuestaOse extends ArchivosOse {
  estado: EstadoComprobante;
  motivo: string | null;
  /** Resumen (hash) del XML firmado y la cadena del código QR de la representación impresa. */
  hash?: string | null;
  cadenaQr?: string | null;
}

/** Para consultar un comprobante ya enviado. */
export interface ReferenciaOse { tipo: TipoComprobante; serie: string; numero: number; emitidoEn: Date; rucEmisor: string }

export interface ProveedorOse {
  codigo: string;
  /**
   * true si el proveedor firma y devuelve sus archivos (XML firmado, CDR y PDF): se guardan esos y no los de Aptio. Para
   * estos proveedores el estado OBSERVADO (aceptado con observaciones) ya es válido ante SUNAT y no se reenvía.
   */
  archivosPropios?: boolean;
  emitir(envio: EnvioOse): Promise<RespuestaOse>;
  /** El estado actual de un comprobante enviado (la consulta periódica de los pendientes). */
  consultar?(ref: ReferenciaOse): Promise<RespuestaOse>;
  /** El PDF, el XML firmado y el CDR de un comprobante ya aceptado. */
  obtenerArchivos?(ref: ReferenciaOse): Promise<ArchivosOse>;
}
