// HU-1712 · Adaptador del PSE/OSE Mifact (DA-09, CP-162, CP-163). API JSON sobre HTTP (servicio WCF):
//   POST {MIFACT_URL}/SendInvoice        emite (firma, envía a SUNAT y devuelve XML firmado, CDR y PDF)
//   POST {MIFACT_URL}/GetEstatusInvoice  consulta el estado de un comprobante enviado
//   POST {MIFACT_URL}/GetInvoice         descarga el PDF (COD_FORM_IMPR 001 = A4), el XML firmado y el CDR
// Se autentica con TOKEN y NUM_NIF_EMIS en el cuerpo: el token es de un RUC emisor, así que el RUC de los datos fiscales
// debe ser el mismo del token. La numeración (serie y correlativo) la pone Aptio. Formato tomado de los ejemplos
// oficiales (github.com/mifact/apijson, carpeta integracionConJson_FV_BV_NC_ND).
//
// Errores: una caída de red, el tiempo de espera o un 5xx lanzan una excepción para que BullMQ reintente. Un 4xx o un
// `errors` del servicio dejan el comprobante PENDIENTE con el motivo, reenviable con el mismo correlativo.
import JSZip from 'jszip';
import { CODIGO_TIPO, type EstadoComprobante } from '@aptio/schema/comprobantes';
import type { ArchivosOse, DatosEnvio, EnvioOse, ProveedorOse, ReferenciaOse, RespuestaOse } from './contrato.js';

export const URL_DEMO_MIFACT = 'https://demo.mifact.net.pe/api/invoiceService.svc';
export const TIEMPO_MIFACT_MS = 30_000;
/** Formato de impresión del PDF: 001 = A4. */
export const FORMATO_A4 = '001';

const m = (n: number) => n.toFixed(2);
/** La fecha de emisión en Lima (UTC−5, sin horario de verano): AAAA-MM-DD. */
export const fechaLima = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
const correlativo = (n: number) => String(n).padStart(8, '0');

/**
 * El cuerpo de SendInvoice. Una sola línea por comprobante: el servicio de Aptio (unidad ZZ, gravado con IGV, afectación
 * 10). Operación 0101 (venta interna) o 1001 (sujeta a detracción). La nota de crédito es de tipo 06 (devolución total)
 * y referencia el comprobante que corrige. No se pide a Mifact que envíe el correo: lo envía Aptio.
 */
export function armarJsonMifact(d: DatosEnvio, token: string): Record<string, unknown> {
  // Catálogo 06: 6 = RUC, 1 = DNI, 0 = sin documento (solo boletas hasta S/ 700).
  const receptor = d.receptor.ruc
    ? { COD_TIP_NIF_RECP: '6', NUM_NIF_RECP: d.receptor.ruc, NOM_RZN_SOC_RECP: d.receptor.razonSocial, TXT_DMCL_FISC_RECEP: d.receptor.direccion ?? '-' }
    : d.receptor.dni
      ? { COD_TIP_NIF_RECP: '1', NUM_NIF_RECP: d.receptor.dni, NOM_RZN_SOC_RECP: d.receptor.razonSocial, TXT_DMCL_FISC_RECEP: d.receptor.direccion ?? '-' }
      : { COD_TIP_NIF_RECP: '0', NUM_NIF_RECP: '00000000', NOM_RZN_SOC_RECP: 'CLIENTE SIN NOMBRE', TXT_DMCL_FISC_RECEP: 'SIN DIRECCION' };
  const json: Record<string, unknown> = {
    TOKEN: token,
    COD_TIP_NIF_EMIS: '6',
    NUM_NIF_EMIS: d.emisor.ruc,
    NOM_RZN_SOC_EMIS: d.emisor.razonSocial,
    COD_UBI_EMIS: d.emisor.ubigeo,
    TXT_DMCL_FISC_EMIS: d.emisor.direccion,
    ...receptor,
    FEC_EMIS: fechaLima(d.emitidoEn),
    COD_TIP_CPE: CODIGO_TIPO[d.tipo],
    NUM_SERIE_CPE: d.serie,
    NUM_CORRE_CPE: correlativo(d.numero),
    COD_MND: d.moneda,
    COD_PRCD_CARGA: '001',
    MNT_TOT_GRAVADO: m(d.baseSinIgv),
    MNT_TOT_TRIB_IGV: m(d.igv),
    MNT_TOT: m(d.total),
    ENVIAR_A_SUNAT: 'true',
    RETORNA_XML_ENVIO: 'true',
    RETORNA_XML_CDR: 'true',
    RETORNA_PDF: 'true',
    COD_FORM_IMPR: FORMATO_A4,
    TXT_VERS_UBL: '2.1',
    TXT_VERS_ESTRUCT_UBL: '2.0',
    COD_ANEXO_EMIS: d.emisor.codigoAnexo || '0000',
    COD_TIP_OPE_SUNAT: d.detraccion ? '1001' : '0101',
  };
  if (d.detraccion) {
    Object.assign(json, {
      MNT_TOT_DETRACCION: m(d.detraccion.monto),
      POR_DETRACCION: m(d.detraccion.tasa),
      NRO_CUENTA_DETRAC: d.detraccion.cuenta,
      COD_TIP_DETRACCION: d.detraccion.codigo,
      MNT_PENDIENTE: m(d.total - d.detraccion.monto),
    });
  }
  if (d.tipo === 'NOTA_CREDITO' && d.referencia) {
    Object.assign(json, {
      COD_TIP_NC: '06',
      TXT_DESC_MTVO: d.referencia.motivo,
      docs_referenciado: [{
        COD_TIP_DOC_REF: CODIGO_TIPO[d.referencia.tipo],
        NUM_SERIE_CPE_REF: d.referencia.serie,
        NUM_CORRE_CPE_REF: correlativo(d.referencia.numero),
        FEC_DOC_REF: fechaLima(d.referencia.emitidoEn),
      }],
    });
  }
  json.items = [{
    COD_ITEM: 'APTIO-SERV',
    COD_UNID_ITEM: 'ZZ',
    CANT_UNID_ITEM: '1',
    VAL_UNIT_ITEM: m(d.baseSinIgv),
    PRC_VTA_UNIT_ITEM: m(d.total),
    VAL_VTA_ITEM: m(d.baseSinIgv),
    MNT_BRUTO: m(d.baseSinIgv),
    MNT_PV_ITEM: m(d.total),
    COD_TIP_PRC_VTA: '01',
    COD_TIP_AFECT_IGV_ITEM: '10',
    COD_TRIB_IGV_ITEM: '1000',
    POR_IGV_ITEM: '18',
    MNT_IGV_ITEM: m(d.igv),
    TXT_DESC_ITEM: d.descripcion.slice(0, 500),
  }];
  return json;
}

/** El cuerpo de GetEstatusInvoice y GetInvoice. */
export function armarConsultaMifact(ref: ReferenciaOse, token: string, archivos = false): Record<string, unknown> {
  return {
    TOKEN: token,
    NUM_NIF_EMIS: ref.rucEmisor,
    COD_TIP_CPE: CODIGO_TIPO[ref.tipo],
    NUM_SERIE_CPE: ref.serie,
    NUM_CORRE_CPE: correlativo(ref.numero),
    FEC_EMIS: fechaLima(ref.emitidoEn),
    ...(archivos ? { RETORNA_XML_ENVIO: 'true', RETORNA_XML_CDR: 'true', RETORNA_PDF: 'true', COD_FORM_IMPR: FORMATO_A4 } : {}),
  };
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * La respuesta de Mifact es un objeto plano (así la lee su ejemplo oficial en .NET). Por si el servicio WCF la envolviera
 * en una clave «…Result» o la devolviera como texto JSON, se desenvuelve (SUP-351).
 */
export function leerRespuestaMifact(cuerpo: unknown): Record<string, unknown> {
  let v = cuerpo;
  for (let i = 0; i < 3; i++) {
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch { return {}; }
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ('estado_documento' in o || 'errors' in o) return o;
      const envoltura = Object.keys(o).find((k) => /Result$/.test(k));
      if (envoltura) { v = o[envoltura]; continue; }
      return o;
    }
    return {};
  }
  return {};
}

/** Estado de Mifact → estado de Aptio: 102 aceptado, 103 aceptado con observaciones, 104 rechazado, 101 y 108 en proceso. */
export function mapearEstado(r: Record<string, unknown>): { estado: EstadoComprobante; motivo: string | null } {
  const codigo = texto(r.estado_documento);
  const sunat = [texto(r.sunat_responsecode), texto(r.sunat_description)].filter(Boolean).join(' · ');
  const nota = texto(r.sunat_note);
  const errores = texto(r.errors);
  switch (codigo) {
    case '102': return { estado: 'ACEPTADO', motivo: sunat ? `Aceptado por SUNAT: ${sunat}` : 'Aceptado por SUNAT' };
    case '103': return { estado: 'OBSERVADO', motivo: `Aceptado con observaciones: ${nota || sunat || 'sin detalle'}` };
    case '104': return { estado: 'RECHAZADO', motivo: `Rechazado por SUNAT: ${sunat || errores || 'sin detalle'}` };
    default: break;
  }
  if (errores) return { estado: 'PENDIENTE', motivo: `Mifact no lo emitió: ${errores}` };
  if (codigo === '101' || codigo === '108') return { estado: 'PENDIENTE', motivo: `En proceso en SUNAT (Mifact ${codigo}): se consulta cada 10 minutos` };
  return { estado: 'PENDIENTE', motivo: codigo ? `Mifact respondió el estado ${codigo}, que Aptio no reconoce: revísalo en Mifact` : 'Mifact respondió sin estado: se consultará de nuevo' };
}

/** Un archivo en base64: zip (XML enviado y CDR) o el contenido directo. */
async function textoDeArchivo(b64: unknown): Promise<string | undefined> {
  const s = texto(b64);
  if (!s) return undefined;
  if (s.startsWith('<')) return s;
  const bytes = Buffer.from(s, 'base64');
  if (bytes.subarray(0, 2).toString('latin1') === 'PK') {
    const zip = await JSZip.loadAsync(bytes);
    const xml = Object.values(zip.files).find((f) => !f.dir && /\.xml$/i.test(f.name)) ?? Object.values(zip.files).find((f) => !f.dir);
    return xml ? xml.async('string') : undefined;
  }
  return bytes.toString('utf8');
}

export async function archivosDeRespuesta(r: Record<string, unknown>): Promise<ArchivosOse & { hash: string | null; cadenaQr: string | null }> {
  const pdf = texto(r.pdf_bytes);
  const xmlFirmado = await textoDeArchivo(r.xml_enviado);
  const cdr = await textoDeArchivo(r.cdr_sunat);
  return {
    ...(xmlFirmado ? { xmlFirmado } : {}),
    ...(cdr ? { cdr } : {}),
    ...(pdf ? { pdf: new Uint8Array(Buffer.from(pdf, 'base64')) } : {}),
    hash: texto(r.codigo_hash) || null,
    cadenaQr: texto(r.cadena_para_codigo_qr) || null,
  };
}

export interface OpcionesMifact { url: string; token: string; fetch?: typeof fetch; timeoutMs?: number }

/** Falla que conviene reintentar (red, tiempo de espera o error del servidor de Mifact). */
export class ErrorRedMifact extends Error {}

export function proveedorMifact(o: OpcionesMifact): ProveedorOse {
  const base = o.url.replace(/\/+$/, '');
  const f = o.fetch ?? fetch;
  const espera = o.timeoutMs ?? TIEMPO_MIFACT_MS;

  /** POST al método: la respuesta leída, o el motivo si Mifact la rechazó (4xx o algo que no es JSON). */
  async function llamar(metodo: string, cuerpo: Record<string, unknown>): Promise<{ ok: true; r: Record<string, unknown> } | { ok: false; motivo: string }> {
    let res: Response;
    try {
      res = await f(`${base}/${metodo}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(espera),
      });
    } catch (e) {
      const nombre = (e as { name?: string }).name;
      throw new ErrorRedMifact(nombre === 'TimeoutError' || nombre === 'AbortError'
        ? `Mifact no respondió en ${Math.round(espera / 1000)} s (${metodo})`
        : `No se pudo conectar con Mifact (${metodo}): ${(e as Error).message}`);
    }
    const crudo = await res.text();
    if (res.status >= 500) throw new ErrorRedMifact(`Mifact respondió HTTP ${res.status} (${metodo})`);
    if (!res.ok) return { ok: false, motivo: `Mifact rechazó la solicitud (HTTP ${res.status}): ${crudo.replace(/\s+/g, ' ').slice(0, 200) || 'sin detalle'}` };
    let json: unknown;
    try { json = JSON.parse(crudo); } catch { return { ok: false, motivo: 'Mifact respondió algo que no es JSON: revisa MIFACT_URL' }; }
    return { ok: true, r: leerRespuestaMifact(json) };
  }

  async function respuesta(metodo: string, cuerpo: Record<string, unknown>): Promise<RespuestaOse> {
    const l = await llamar(metodo, cuerpo);
    if (!l.ok) return { estado: 'PENDIENTE', motivo: l.motivo };
    const estado = mapearEstado(l.r);
    return { ...estado, ...(await archivosDeRespuesta(l.r)) };
  }

  return {
    codigo: 'mifact',
    archivosPropios: true,
    async emitir(e: EnvioOse) {
      const d = e.datos;
      // SUP-350: Mifact exige el tipo de cambio para otra moneda y Aptio aún no tiene fuente para él.
      if (d.moneda !== 'PEN') return { estado: 'PENDIENTE', motivo: 'Falta definir el tipo de cambio para emitir en dólares con Mifact (SUP-350)' };
      if (!/^\d{6}$/.test(d.emisor.ubigeo)) return { estado: 'PENDIENTE', motivo: 'Falta el ubigeo del emisor en los datos fiscales: complétalo y reenvía' };
      if (d.detraccion && (!d.detraccion.cuenta || !d.detraccion.codigo)) return { estado: 'PENDIENTE', motivo: 'Faltan la cuenta de detracciones o el código SPOT en los datos fiscales' };
      return respuesta('SendInvoice', armarJsonMifact(d, o.token));
    },
    consultar: (ref) => respuesta('GetEstatusInvoice', armarConsultaMifact(ref, o.token)),
    async obtenerArchivos(ref) {
      const l = await llamar('GetInvoice', armarConsultaMifact(ref, o.token, true));
      if (!l.ok) return {};
      const { hash: _h, cadenaQr: _q, ...archivos } = await archivosDeRespuesta(l.r);
      return archivos;
    },
  };
}
