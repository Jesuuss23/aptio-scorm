// HU-1707 · Comprobantes electrónicos SUNAT (REQ-087, CP-148, CP-149, RN-18-4, RN-18-5, RN-18-9). Consume
// «emitir-comprobante» de la cola `comprobantes`: un comprobante por cobro y tipo (idempotente por `(cobroId, tipo)`),
// con el correlativo de su serie tomado bajo bloqueo de fila. Arma el XML UBL 2.1 y el PDF, los guarda en S3, los envía
// al OSE con el adaptador del proveedor elegido (DA-09) y, aceptado, los manda por correo. La nota de crédito de un
// reembolso corrige el comprobante original por el total. HU-1712: con Mifact (proveedor real) se guardan y envían sus
// archivos oficiales (XML firmado, CDR de SUNAT y PDF A4); el PDF de pdf-lib queda solo para el simulado.
import { COLA_COMPROBANTES, type DatosComprobante } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import {
  desglosar, detraccionDe, type EstadoComprobante, montoEnLetras, nombreArchivo, numeroCompleto, rucEmisorValido, serieDe, tipoPara,
  type TipoComprobante, xmlUbl,
} from '@aptio/schema/comprobantes';
import { entornoSitio } from '@aptio/schema/sitio-ficticios';
import { Worker, type ConnectionOptions } from 'bullmq';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { EnviarCorreo } from './correo.js';
import type { ArchivosOse, DatosEnvio, ProveedorOse, ReferenciaOse } from './ose/contrato.js';
import { proveedorMifact } from './ose/mifact.js';

export type { ArchivosOse, DatosEnvio, EnvioOse, ProveedorOse, ReferenciaOse, RespuestaOse } from './ose/contrato.js';

// ---------- Adaptador del OSE (DA-09) ----------

/** Con este RUC de receptor, el OSE simulado responde «Observado» (como las tarjetas de prueba de la pasarela). */
export const RUC_OBSERVADO_PRUEBAS = '20999999990';

/** El OSE de pruebas (simulado): acepta todo salvo el RUC de prueba que observa. No envía nada a SUNAT. */
export const oseSimulado = (): ProveedorOse => ({
  codigo: 'pruebas',
  emitir: async (e) => (e.receptorRuc === RUC_OBSERVADO_PRUEBAS
    ? { estado: 'OBSERVADO', motivo: 'El RUC del receptor no figura como activo en el padrón (OSE simulado)' }
    : { estado: 'ACEPTADO', motivo: `${numeroCompleto(e.serie, e.numero)} aceptado por el OSE de pruebas (simulado, sin envío a SUNAT)` }),
});

/**
 * Los proveedores disponibles en este entorno. El simulado solo existe con SITIO_ENTORNO=pruebas (SUP-314); Mifact, con
 * MIFACT_URL y MIFACT_TOKEN (HU-1712). En producción solo queda Mifact.
 */
export function proveedoresOseDesdeEntorno(env: NodeJS.ProcessEnv = process.env): Record<string, ProveedorOse> {
  const p: Record<string, ProveedorOse> = entornoSitio(env.SITIO_ENTORNO) === 'pruebas' ? { pruebas: oseSimulado() } : {};
  const url = env.MIFACT_URL?.trim();
  const token = env.MIFACT_TOKEN?.trim();
  if (url && token) p.mifact = proveedorMifact({ url, token });
  return p;
}

// ---------- PDF ----------

export interface DatosPdf {
  tipo: TipoComprobante; serie: string; numero: number; emitidoEn: Date; moneda: 'PEN' | 'USD'; ambiente: string;
  emisor: { ruc: string; razonSocial: string; direccion: string };
  receptor: { ruc: string | null; razonSocial: string; direccion: string | null };
  descripcion: string; baseSinIgv: number; igv: number; total: number; detraccion: number | null; estado: EstadoComprobante;
  referencia: string | null;
}

const TITULO: Record<TipoComprobante, string> = { FACTURA: 'FACTURA ELECTRÓNICA', BOLETA: 'BOLETA DE VENTA ELECTRÓNICA', NOTA_CREDITO: 'NOTA DE CRÉDITO ELECTRÓNICA' };
const dinero = (n: number, moneda: string) => `${moneda === 'USD' ? 'US$' : 'S/'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** La representación impresa del comprobante (A4), con la fuente estándar Helvetica (WinAnsi, admite tildes y ñ). */
export async function pdfComprobante(d: DatosPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITULO[d.tipo]} ${numeroCompleto(d.serie, d.numero)}`);
  pdf.setCreator('Aptio SCORM');
  const pag = pdf.addPage([595.28, 841.89]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const negro = rgb(0.1, 0.1, 0.1);
  const gris = rgb(0.35, 0.35, 0.35);
  let y = 790;
  const linea = (t: string, x: number, size = 10, f = normal, color = negro) => pag.drawText(t, { x, y, size, font: f, color });
  linea(d.emisor.razonSocial, 40, 14, negrita);
  y -= 16; linea(d.emisor.direccion, 40, 9, normal, gris);
  pag.drawRectangle({ x: 360, y: 730, width: 195, height: 70, borderColor: negro, borderWidth: 1 });
  y = 782; linea(`RUC ${d.emisor.ruc}`, 372, 11, negrita);
  y -= 18; linea(TITULO[d.tipo], 372, 9, negrita);
  y -= 18; linea(numeroCompleto(d.serie, d.numero), 372, 12, negrita);
  y = 700;
  const fecha = new Date(d.emitidoEn.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  const filas: [string, string][] = [
    ['Fecha de emisión', fecha],
    [d.receptor.ruc ? 'RUC del cliente' : 'Cliente', d.receptor.ruc ?? 'Sin documento'],
    ['Razón social', d.receptor.razonSocial],
    ...(d.receptor.direccion ? [['Dirección', d.receptor.direccion] as [string, string]] : []),
    ['Moneda', d.moneda === 'USD' ? 'Dólares americanos' : 'Soles'],
    ...(d.referencia ? [['Comprobante que modifica', d.referencia] as [string, string]] : []),
  ];
  for (const [k, v] of filas) { linea(k, 40, 9, negrita); linea(v, 170, 9); y -= 15; }
  y -= 10;
  pag.drawLine({ start: { x: 40, y: y + 4 }, end: { x: 555, y: y + 4 }, thickness: 0.5, color: gris });
  y -= 12; linea('Descripción', 40, 9, negrita); linea('Valor sin IGV', 470, 9, negrita);
  y -= 15; linea(d.descripcion.slice(0, 90), 40, 9); linea(dinero(d.baseSinIgv, d.moneda), 470, 9);
  y -= 30;
  const totales: [string, string][] = [['Op. gravada', dinero(d.baseSinIgv, d.moneda)], ['IGV (18 %)', dinero(d.igv, d.moneda)], ['Importe total', dinero(d.total, d.moneda)]];
  for (const [k, v] of totales) { linea(k, 360, 10, k === 'Importe total' ? negrita : normal); linea(v, 470, 10, k === 'Importe total' ? negrita : normal); y -= 15; }
  y -= 8; linea(`SON: ${montoEnLetras(d.total, d.moneda)}`, 40, 9);
  if (d.detraccion !== null) { y -= 15; linea(`Operación sujeta a detracción: ${dinero(d.detraccion, 'PEN')} (por validar con el contador)`, 40, 9); }
  y -= 25; linea(`Estado SUNAT: ${d.estado}`, 40, 9, negrita);
  y -= 15; linea(`Representación impresa de la ${TITULO[d.tipo].toLowerCase()}.`, 40, 8, normal, gris);
  if (d.ambiente !== 'produccion') { y -= 13; linea('Ambiente de pruebas: sin valor tributario.', 40, 8, negrita, gris); }
  return pdf.save();
}

// ---------- Emisión ----------

type Tx = Prisma.TransactionClient;
export interface DependenciasComprobantes {
  proveedores: Record<string, ProveedorOse>;
  subir: (clave: string, cuerpo: Uint8Array | string, mime: string) => Promise<void>;
  enviar: EnviarCorreo;
  ahora?: () => Date;
}
export type ResultadoComprobante = { resultado: 'emitido' | 'pendiente' | 'omitido'; comprobanteId?: string; estado?: EstadoComprobante; motivo?: string };

const CON_COBRO = {
  solicitud: { include: { plan: true } },
  compraCapsulas: true,
  cambioPlan: { include: { planOrigen: true, planDestino: true } },
  renovacion: { include: { plan: true, suscripcion: true } },
  suscripcion: { include: { solicitud: true } },
} as const;
type CobroCompleto = Prisma.CobroGetPayload<{ include: typeof CON_COBRO }>;

const dia = (d: Date) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }).format(d);

/** Lo que se cobró, en una línea. */
export function descripcionDe(c: CobroCompleto): string {
  if (c.solicitud) return `Suscripción ${c.solicitud.plan.nombre} de Aptio SCORM (${c.solicitud.ciclo === 'ANUAL' ? 'anual' : 'mensual'})`;
  if (c.compraCapsulas) return `${c.compraCapsulas.cantidad} ${c.compraCapsulas.cantidad === 1 ? 'cápsula adicional' : 'cápsulas adicionales'} de Aptio SCORM`;
  if (c.cambioPlan) return `Cambio de plan de ${c.cambioPlan.planOrigen.nombre} a ${c.cambioPlan.planDestino.nombre} (${c.cambioPlan.diasRestantes} de ${c.cambioPlan.diasPeriodo} días)`;
  // HU-1708 · La renovación: el plan, el ciclo y el período que paga.
  if (c.renovacion) return `Renovación ${c.renovacion.plan.nombre} de Aptio SCORM (${c.renovacion.suscripcion.ciclo === 'ANUAL' ? 'anual' : 'mensual'}, ${dia(c.renovacion.periodoInicio)} al ${dia(c.renovacion.periodoFin)})`;
  return 'Servicio de Aptio SCORM';
}

/**
 * El receptor. HU-1711: primero los datos de facturación que el administrador editó en el portal (SUP-318); si no los
 * hay, la solicitud del cobro o la de la suscripción de su organización; sin solicitud, la organización. Solo cuenta al
 * crear el comprobante: los ya emitidos guardan sus datos.
 */
async function receptorDe(bd: PrismaClient, c: CobroCompleto) {
  const organizacionId = c.suscripcion?.organizacionId ?? c.compraCapsulas?.organizacionId ?? c.cambioPlan?.organizacionId ?? c.renovacion?.organizacionId ?? c.solicitud?.organizacionId ?? null;
  const editados = organizacionId ? await bd.datosFacturacionOrg.findUnique({ where: { organizacionId } }) : null;
  if (editados) {
    const tipo: 'FACTURA' | 'BOLETA' = editados.tipoComprobantePreferido === 'FACTURA' ? tipoPara(editados.ruc) : 'BOLETA';
    return {
      organizacionId, tipo, ruc: tipo === 'FACTURA' ? editados.ruc : null, dni: tipo === 'BOLETA' ? editados.dniReceptor : null,
      razonSocial: editados.razonSocial, direccion: editados.direccion, correo: editados.correoFacturacion,
    };
  }
  let sol = c.solicitud ?? c.suscripcion?.solicitud ?? null;
  if (!sol && organizacionId) sol = (await bd.suscripcion.findUnique({ where: { organizacionId }, include: { solicitud: true } }))?.solicitud ?? null;
  const org = organizacionId ? await bd.organizacion.findUnique({ where: { id: organizacionId } }) : null;
  const ruc = (sol?.ruc ?? org?.ruc ?? null) || null;
  const quiereFactura = sol ? sol.tipoComprobante === 'FACTURA' : Boolean(ruc);
  const tipo: 'FACTURA' | 'BOLETA' = quiereFactura ? tipoPara(ruc) : 'BOLETA';
  const admin = !sol && organizacionId ? await bd.usuario.findFirst({ where: { organizacionId, rol: 'ADMINISTRADOR' }, orderBy: { creadoEn: 'asc' } }) : null;
  return {
    organizacionId, tipo,
    ruc: tipo === 'FACTURA' ? ruc : null,
    dni: tipo === 'BOLETA' ? (sol?.dniReceptor ?? null) : null,
    razonSocial: sol?.razonSocial ?? org?.nombre ?? 'Cliente',
    direccion: null as string | null,
    correo: sol?.correoAdmin ?? admin?.email ?? '',
  };
}

/** Toma el siguiente número de la serie con la fila bloqueada: dos emisiones a la vez nunca reciben el mismo. */
export async function siguienteNumero(tx: Tx, serie: string, tipo: TipoComprobante): Promise<number> {
  await tx.$executeRaw`INSERT INTO "SerieComprobante" ("serie", "tipo", "ultimoNumero", "actualizadoEn") VALUES (${serie}, ${tipo}::"TipoCpe", 0, now()) ON CONFLICT ("serie") DO NOTHING`;
  const [fila] = await tx.$queryRaw<{ ultimoNumero: number }[]>`SELECT "ultimoNumero" FROM "SerieComprobante" WHERE "serie" = ${serie} FOR UPDATE`;
  const numero = (fila?.ultimoNumero ?? 0) + 1;
  await tx.serieComprobante.update({ where: { serie }, data: { ultimoNumero: numero } });
  return numero;
}

const esDuplicado = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/** Crea (una sola vez) el comprobante del cobro, o devuelve el que ya existe. */
async function crearComprobante(bd: PrismaClient, c: CobroCompleto, tipo: TipoComprobante, ahora: Date) {
  const existente = await bd.comprobante.findUnique({ where: { cobroId_tipo: { cobroId: c.id, tipo } } });
  if (existente) return existente;
  const fiscales = await bd.datosFiscales.upsert({ where: { id: 'principal' }, create: {}, update: {} });
  let base: { organizacionId: string | null; ruc: string | null; dni: string | null; razonSocial: string; direccion: string | null; correoFacturacion: string; total: number; moneda: string; referenciaId: string | null; referenciaTipo?: 'FACTURA' | 'BOLETA' };
  if (tipo === 'NOTA_CREDITO') {
    const original = await bd.comprobante.findFirst({ where: { cobroId: c.id, tipo: { in: ['FACTURA', 'BOLETA'] } } });
    if (!original) throw new Error(`El cobro ${c.id} aún no tiene comprobante: la nota de crédito espera`);
    base = {
      organizacionId: original.organizacionId, ruc: original.ruc, dni: original.dniReceptor, razonSocial: original.razonSocial, direccion: original.direccion, correoFacturacion: original.correoFacturacion,
      total: Number(original.total), moneda: original.moneda, referenciaId: original.id, referenciaTipo: original.tipo as 'FACTURA' | 'BOLETA',
    };
  } else {
    const r = await receptorDe(bd, c);
    if (r.tipo !== tipo) throw new Error(`El cobro ${c.id} emite ${r.tipo}, no ${tipo}`);
    base = { organizacionId: r.organizacionId, ruc: r.ruc, dni: r.dni, razonSocial: r.razonSocial, direccion: r.direccion, correoFacturacion: r.correo, total: Number(c.monto), moneda: c.moneda, referenciaId: null };
  }
  const d = desglosar(base.total);
  const detraccion = detraccionDe(tipo, base.moneda as 'PEN' | 'USD', d.total, { activa: fiscales.detraccionActiva, tasa: Number(fiscales.detraccionTasa), umbralPen: Number(fiscales.detraccionUmbralPen) });
  const serie = serieDe(tipo, fiscales, base.referenciaTipo);
  try {
    return await bd.$transaction(async (tx) => {
      const numero = await siguienteNumero(tx, serie, tipo);
      return tx.comprobante.create({
        data: {
          organizacionId: base.organizacionId, cobroId: c.id, tipo, serie, numero, comprobanteReferenciaId: base.referenciaId,
          ruc: base.ruc, dniReceptor: base.dni, razonSocial: base.razonSocial, direccion: base.direccion, correoFacturacion: base.correoFacturacion, moneda: base.moneda,
          baseSinIgv: d.baseSinIgv, igv: d.igv, total: d.total, detraccion, proveedor: fiscales.proveedor, ambiente: fiscales.ambiente, emitidoEn: ahora,
        },
      });
    });
  } catch (e) {
    // Otra tarea del mismo cobro ganó: su transacción guardó el comprobante y la nuestra no consumió número.
    if (esDuplicado(e)) return bd.comprobante.findUniqueOrThrow({ where: { cobroId_tipo: { cobroId: c.id, tipo } } });
    throw e;
  }
}

/** Válido ante SUNAT: aceptado, o aceptado con observaciones cuando lo emitió un proveedor real (HU-1712). */
const esValido = (estado: EstadoComprobante, propio: boolean) => estado === 'ACEPTADO' || (propio && estado === 'OBSERVADO');

export async function procesarComprobante(bd: PrismaClient, datos: DatosComprobante, deps: DependenciasComprobantes): Promise<ResultadoComprobante> {
  const ahora = deps.ahora?.() ?? new Date();
  const cobro = await bd.cobro.findUnique({ where: { id: datos.cobroId }, include: CON_COBRO });
  if (!cobro) return { resultado: 'omitido', motivo: 'el cobro no existe' };
  let comp = datos.comprobanteId
    ? await bd.comprobante.findUnique({ where: { id: datos.comprobanteId } })
    : await crearComprobante(bd, cobro, datos.tipo === 'NOTA_CREDITO' ? 'NOTA_CREDITO' : (await receptorDe(bd, cobro)).tipo, ahora);
  if (!comp) return { resultado: 'omitido', motivo: 'el comprobante no existe' };
  if (comp.estado === 'RECHAZADO') return { resultado: 'omitido', comprobanteId: comp.id, estado: comp.estado, motivo: 'rechazado: su número no se reutiliza' };
  const ose = deps.proveedores[comp.proveedor];
  const propio = Boolean(ose?.archivosPropios);
  if (esValido(comp.estado, propio) && comp.correoEnviadoEn) return { resultado: 'omitido', comprobanteId: comp.id, estado: comp.estado, motivo: 'ya se emitió y se envió' };

  const fiscales = await bd.datosFiscales.upsert({ where: { id: 'principal' }, create: {}, update: {} });
  const pendiente = async (motivo: string): Promise<ResultadoComprobante> => {
    await bd.comprobante.update({ where: { id: comp!.id }, data: { motivo } });
    return { resultado: 'pendiente', comprobanteId: comp!.id, estado: 'PENDIENTE', motivo };
  };
  if (!rucEmisorValido(fiscales.rucEmisor ?? '', comp.ambiente) || !fiscales.razonSocialEmisor.trim()) return pendiente('Faltan los datos fiscales del emisor (RUC y razón social): complétalos y reenvía');
  if (!ose) return pendiente(`El proveedor OSE «${comp.proveedor}» no está disponible en este entorno (DA-09)`);

  const referencia = comp.comprobanteReferenciaId ? await bd.comprobante.findUnique({ where: { id: comp.comprobanteReferenciaId } }) : null;
  const descripcion = comp.tipo === 'NOTA_CREDITO' ? `Devolución: ${descripcionDe(cobro)}` : descripcionDe(cobro);
  const emisor = { ruc: fiscales.rucEmisor!, razonSocial: fiscales.razonSocialEmisor, direccion: fiscales.direccionEmisor };
  const receptor = { ruc: comp.ruc, razonSocial: comp.razonSocial, direccion: comp.direccion };
  const montos = { baseSinIgv: Number(comp.baseSinIgv), igv: Number(comp.igv), total: Number(comp.total) };
  const detraccion = comp.detraccion === null ? null : Number(comp.detraccion);
  const moneda = comp.moneda as 'PEN' | 'USD';
  const motivoNota = 'Devolución total por reembolso del pago';
  const xml = xmlUbl({
    tipo: comp.tipo, serie: comp.serie, numero: comp.numero, emitidoEn: comp.emitidoEn, moneda, emisor, receptor, descripcion, ...montos,
    detraccion: detraccion === null ? null : { monto: detraccion, tasa: Number(fiscales.detraccionTasa) },
    referencia: referencia ? { tipo: referencia.tipo as 'FACTURA' | 'BOLETA', serie: referencia.serie, numero: referencia.numero, motivo: motivoNota } : null,
  });
  const datosEnvio: DatosEnvio = {
    tipo: comp.tipo, serie: comp.serie, numero: comp.numero, emitidoEn: comp.emitidoEn, moneda,
    emisor: { ...emisor, ubigeo: fiscales.ubigeoEmisor, codigoAnexo: fiscales.codigoAnexo },
    receptor: { ...receptor, dni: comp.dniReceptor },
    descripcion, ...montos,
    detraccion: detraccion === null ? null : { monto: detraccion, tasa: Number(fiscales.detraccionTasa), cuenta: fiscales.cuentaDetraccion, codigo: fiscales.codigoDetraccion },
    referencia: referencia ? { tipo: referencia.tipo as 'FACTURA' | 'BOLETA', serie: referencia.serie, numero: referencia.numero, emitidoEn: referencia.emitidoEn, motivo: motivoNota } : null,
  };
  const ref: ReferenciaOse = { tipo: comp.tipo, serie: comp.serie, numero: comp.numero, emitidoEn: comp.emitidoEn, rucEmisor: emisor.ruc };

  let archivos: ArchivosOse = {};
  if (!esValido(comp.estado, propio)) {
    const id = comp.id;
    const r = await ose.emitir({ tipo: comp.tipo, serie: comp.serie, numero: comp.numero, rucEmisor: emisor.ruc, receptorRuc: comp.ruc, ambiente: comp.ambiente, xml, datos: datosEnvio })
      .catch(async (e: unknown) => {
        // Caída de red o tiempo de espera: el proveedor pudo haberlo recibido. Se marca como enviado (así la consulta de
        // cada 10 minutos lo revisa) y se relanza para que la cola reintente.
        await bd.comprobante.update({ where: { id }, data: { motivo: `Sin respuesta del proveedor: ${(e as Error).message}. Se reintenta`, intentos: { increment: 1 }, enviadoEn: ahora } });
        throw e;
      });
    archivos = r;
    comp = await bd.comprobante.update({
      where: { id: comp.id },
      data: { estado: r.estado, motivo: r.motivo, intentos: { increment: 1 }, enviadoEn: ahora, ...(r.hash ? { hashCpe: r.hash } : {}), ...(r.cadenaQr ? { cadenaQr: r.cadenaQr } : {}) },
    });
  }
  const archivo = nombreArchivo(emisor.ruc, comp.tipo, comp.serie, comp.numero);
  const claveXml = `comprobantes/${comp.id}/${archivo}.xml`;
  const clavePdf = `comprobantes/${comp.id}/${archivo}.pdf`;
  const claveCdr = `comprobantes/${comp.id}/R-${archivo}.xml`;
  let pdf: Uint8Array | undefined;
  let xmlEnviado: string | undefined;
  if (propio) {
    // Aceptado sin el PDF a mano (respuesta incompleta o consulta posterior): se piden los archivos con GetInvoice.
    if (esValido(comp.estado, propio) && !archivos.pdf && ose.obtenerArchivos) archivos = { ...archivos, ...(await ose.obtenerArchivos(ref)) };
    pdf = archivos.pdf;
    xmlEnviado = archivos.xmlFirmado;
    const claves: { s3KeyXml?: string; s3KeyPdf?: string; s3KeyCdr?: string } = {};
    if (archivos.xmlFirmado) { await deps.subir(claveXml, archivos.xmlFirmado, 'application/xml'); claves.s3KeyXml = claveXml; }
    if (archivos.pdf) { await deps.subir(clavePdf, archivos.pdf, 'application/pdf'); claves.s3KeyPdf = clavePdf; }
    if (archivos.cdr) { await deps.subir(claveCdr, archivos.cdr, 'application/xml'); claves.s3KeyCdr = claveCdr; }
    if (Object.keys(claves).length) comp = await bd.comprobante.update({ where: { id: comp.id }, data: claves });
    // Sin el PDF oficial no se envía el correo: la cola (o la consulta de cada 10 minutos) lo vuelve a pedir.
    if (esValido(comp.estado, propio) && !comp.correoEnviadoEn && !pdf) throw new Error(`${numeroCompleto(comp.serie, comp.numero)}: ${ose.codigo} aún no entrega el PDF`);
  } else {
    pdf = await pdfComprobante({
      tipo: comp.tipo, serie: comp.serie, numero: comp.numero, emitidoEn: comp.emitidoEn, moneda, ambiente: comp.ambiente, emisor, receptor, descripcion, ...montos,
      detraccion, estado: comp.estado, referencia: referencia ? numeroCompleto(referencia.serie, referencia.numero) : null,
    });
    xmlEnviado = xml;
    await deps.subir(claveXml, xml, 'application/xml');
    await deps.subir(clavePdf, pdf, 'application/pdf');
    comp = await bd.comprobante.update({ where: { id: comp.id }, data: { s3KeyXml: claveXml, s3KeyPdf: clavePdf } });
  }

  // El correo se reclama con una actualización condicional: dos tareas a la vez no lo envían dos veces. Si el SMTP
  // falla, se libera y la cola reintenta.
  const reclamado = esValido(comp.estado, propio) && pdf && !comp.correoEnviadoEn && comp.correoFacturacion
    ? (await bd.comprobante.updateMany({ where: { id: comp.id, correoEnviadoEn: null }, data: { correoEnviadoEn: ahora } })).count === 1
    : false;
  if (reclamado && pdf) {
    const nombre = { FACTURA: 'factura', BOLETA: 'boleta', NOTA_CREDITO: 'nota de crédito' }[comp.tipo];
    const destino = comp;
    const adjuntos: { archivo: string; contenido: Uint8Array | string; mime: string }[] = [{ archivo: `${archivo}.pdf`, contenido: pdf, mime: 'application/pdf' }];
    if (xmlEnviado) adjuntos.push({ archivo: `${archivo}.xml`, contenido: xmlEnviado, mime: 'application/xml' });
    if (propio && archivos.cdr) adjuntos.push({ archivo: `R-${archivo}.xml`, contenido: archivos.cdr, mime: 'application/xml' });
    await deps.enviar({
      para: destino.correoFacturacion,
      asunto: `Tu ${nombre} ${numeroCompleto(comp.serie, comp.numero)} de Aptio SCORM`,
      texto: [
        `Hola, ${comp.razonSocial}:`, '',
        `Adjuntamos tu ${nombre} electrónica ${numeroCompleto(comp.serie, comp.numero)} por ${moneda === 'USD' ? 'US$' : 'S/'} ${montos.total.toFixed(2)} (${descripcion}).`,
        propio && archivos.cdr ? 'Van el PDF, el XML y la constancia de recepción de SUNAT (CDR).' : 'Van el PDF y el XML.',
        comp.ambiente !== 'produccion' ? '\nEs del ambiente de pruebas: no tiene valor tributario.' : '',
      ].join('\n'),
      adjuntos,
    }).catch(async (e: unknown) => {
      await bd.comprobante.update({ where: { id: comp!.id }, data: { correoEnviadoEn: null } });
      throw e;
    });
  }
  return { resultado: 'emitido', comprobanteId: comp.id, estado: comp.estado, ...(comp.motivo ? { motivo: comp.motivo } : {}) };
}

export interface ResultadoConsulta { consultados: number; resueltos: number; errores: string[] }

/**
 * HU-1712 · La consulta periódica (cada 10 minutos, cola `mantenimiento`): pregunta al proveedor real el estado de los
 * comprobantes enviados que siguen PENDIENTE (SUNAT aún los procesa, o hubo una caída de red) y, ya confirmados, descarga
 * sus archivos y envía el correo. Mientras el proveedor diga que sigue pendiente, no se toca nada. También retoma los
 * aceptados que aún no tienen el PDF oficial.
 */
export async function consultarPendientes(bd: PrismaClient, deps: DependenciasComprobantes, limite = 50): Promise<ResultadoConsulta> {
  const consultables = Object.values(deps.proveedores).filter((p) => p.consultar).map((p) => p.codigo);
  const resultado: ResultadoConsulta = { consultados: 0, resueltos: 0, errores: [] };
  if (!consultables.length) return resultado;
  const fiscales = await bd.datosFiscales.findUnique({ where: { id: 'principal' } });
  if (!fiscales?.rucEmisor) return resultado;
  const lista = await bd.comprobante.findMany({
    where: {
      proveedor: { in: consultables }, enviadoEn: { not: null },
      OR: [{ estado: 'PENDIENTE' }, { estado: { in: ['ACEPTADO', 'OBSERVADO'] }, s3KeyPdf: null }],
    },
    orderBy: { emitidoEn: 'asc' }, take: limite,
  });
  for (const c of lista) {
    const ose = deps.proveedores[c.proveedor]!;
    try {
      if (c.estado === 'PENDIENTE') {
        resultado.consultados++;
        const r = await ose.consultar!({ tipo: c.tipo, serie: c.serie, numero: c.numero, emitidoEn: c.emitidoEn, rucEmisor: fiscales.rucEmisor });
        if (r.estado === 'PENDIENTE') continue;
        await bd.comprobante.update({
          where: { id: c.id },
          data: { estado: r.estado, motivo: r.motivo, ...(r.hash ? { hashCpe: r.hash } : {}), ...(r.cadenaQr ? { cadenaQr: r.cadenaQr } : {}) },
        });
        resultado.resueltos++;
        if (r.estado === 'RECHAZADO') continue;
      }
      // Aceptado: descarga los archivos oficiales y envía el correo con el mismo flujo de la emisión.
      await procesarComprobante(bd, { cobroId: c.cobroId, comprobanteId: c.id }, deps);
    } catch (e) {
      resultado.errores.push(`${numeroCompleto(c.serie, c.numero)}: ${(e as Error).message}`);
    }
  }
  return resultado;
}

export function crearTrabajadorComprobantes(bd: PrismaClient, deps: DependenciasComprobantes, opciones: { connection: ConnectionOptions; prefix: string }): Worker<DatosComprobante, ResultadoComprobante> {
  return new Worker<DatosComprobante, ResultadoComprobante>(COLA_COMPROBANTES, (job) => procesarComprobante(bd, job.data, deps), {
    connection: opciones.connection, prefix: opciones.prefix, concurrency: 4,
  });
}
