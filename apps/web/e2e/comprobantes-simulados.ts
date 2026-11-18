// HU-1707 · Ventas › Facturación simulada, con las mismas reglas que la API (@aptio/schema/comprobantes): el filtro por
// estado SUNAT, la descarga del PDF y el XML, «Corregir y reenviar» de un observado (queda pendiente y, en la siguiente
// carga, el OSE simulado lo acepta, salvo que siga con el RUC de prueba que observa) y los datos fiscales validados.
// HU-1712: Mifact disponible (como con MIFACT_URL), el CDR de sus comprobantes, su observado que no se reenvía, el DNI
// de la boleta y los campos fiscales nuevos.
import { normalizarDni, numeroCompleto, PROVEEDORES_OSE, validarDatosFiscales, validarReceptor } from '@aptio/schema/comprobantes';

type Respuesta = { status: number; body?: unknown; binario?: { contenido: string; mime: string; nombre: string } };
export type EstadoSim = 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
export interface ComprobanteSim {
  id: string; tipo: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO'; serie: string; numero: number; referencia?: string | null; ruc: string | null; razonSocial: string; direccion?: string | null;
  correoFacturacion: string; moneda: 'PEN' | 'USD'; total: number; detraccion?: number | null; estado: EstadoSim; motivo?: string | null; emitidoEn: string;
  dni?: string | null; proveedor?: 'pruebas' | 'mifact';
}
export interface FacturacionSitioSim { comprobantes?: ComprobanteSim[] }

const RUC_OBSERVADO = '20999999990';
const FISCALES_INICIALES = {
  rucEmisor: '20000000001', razonSocialEmisor: 'Grupo de Soluciones Creativas SAC', direccionEmisor: 'Av. Ejemplo 123, Lima',
  serieFactura: 'F001', serieBoleta: 'B001', serieNotaFactura: 'FC01', serieNotaBoleta: 'BC01', proveedor: 'pruebas', ambiente: 'pruebas',
  detraccionActiva: false, detraccionTasa: 12, detraccionUmbralPen: 700,
  ubigeoEmisor: '', codigoAnexo: '0000', cuentaDetraccion: '', codigoDetraccion: '',
};
const reenviables = (proveedor: string): EstadoSim[] => (proveedor === 'mifact' ? ['PENDIENTE'] : ['OBSERVADO', 'PENDIENTE']);
const noValido = (errores: { campo: string; mensaje: string }[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });

export function crearComprobantesSim(inicial: FacturacionSitioSim = {}, entorno: () => 'pruebas' | 'produccion') {
  const comprobantes = (inicial.comprobantes ?? []).map((c) => ({ ...c, intentos: 1, enEspera: false }));
  let fiscales: Record<string, unknown> = { ...FISCALES_INICIALES };
  const disponible = (soloPruebas: boolean) => !soloPruebas || entorno() === 'pruebas';
  const proveedorDe = (c: { proveedor?: 'pruebas' | 'mifact' }) => c.proveedor ?? 'pruebas';
  const dto = (c: (typeof comprobantes)[number]) => {
    const base = Math.round((c.total / 1.18) * 100) / 100;
    return {
      id: c.id, tipo: c.tipo, serie: c.serie, numero: c.numero, numeroCompleto: numeroCompleto(c.serie, c.numero), cobroId: `cobro-${c.id}`, referencia: c.referencia ?? null,
      ruc: c.ruc, dni: c.dni ?? null, razonSocial: c.razonSocial, direccion: c.direccion ?? null, correoFacturacion: c.correoFacturacion, moneda: c.moneda,
      baseSinIgv: base, igv: Math.round((c.total - base) * 100) / 100, total: c.total, detraccion: c.detraccion ?? null, estado: c.estado, motivo: c.motivo ?? null,
      proveedor: proveedorDe(c), ambiente: 'pruebas', conArchivos: true, conCdr: proveedorDe(c) === 'mifact' && (c.estado === 'ACEPTADO' || c.estado === 'OBSERVADO'),
      reenviable: reenviables(proveedorDe(c)).includes(c.estado), intentos: c.intentos, emitidoEn: c.emitidoEn,
      correoEnviadoEn: c.estado === 'ACEPTADO' ? c.emitidoEn : null,
    };
  };
  const fiscalesDto = () => ({ ...fiscales, proveedores: PROVEEDORES_OSE.map((p) => ({ codigo: p.codigo, nombre: p.nombre, disponible: disponible(p.soloPruebas) })), actualizadoEn: '2026-11-17T15:00:00.000Z' });

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, consulta: URLSearchParams): Respuesta | null {
    if (ruta === '/ventas/comprobantes' && metodo === 'GET') {
      // El worker y el OSE simulado responden entre una carga y la siguiente.
      for (const c of comprobantes.filter((x) => x.enEspera)) {
        c.enEspera = false;
        c.intentos += 1;
        Object.assign(c, c.ruc === RUC_OBSERVADO
          ? { estado: 'OBSERVADO', motivo: 'El RUC del receptor no figura como activo en el padrón (OSE simulado)' }
          : { estado: 'ACEPTADO', motivo: `${numeroCompleto(c.serie, c.numero)} aceptado por el OSE de pruebas (simulado, sin envío a SUNAT)` });
      }
      const estado = consulta.get('estado');
      return { status: 200, body: { comprobantes: comprobantes.filter((c) => !estado || c.estado === estado).map(dto) } };
    }
    const archivo = ruta.match(/^\/ventas\/comprobantes\/([\w-]+)\/(pdf|xml|cdr)$/);
    if (archivo && metodo === 'GET') {
      const c = comprobantes.find((x) => x.id === archivo[1]);
      if (!c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe' } };
      const nombre = `20000000001-${{ FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07' }[c.tipo]}-${numeroCompleto(c.serie, c.numero)}.${archivo[2] === 'pdf' ? 'pdf' : 'xml'}`;
      if (archivo[2] === 'cdr') return { status: 200, binario: { contenido: '<ApplicationResponse/>', mime: 'application/xml', nombre: `R-${nombre}` } };
      return archivo[2] === 'pdf'
        ? { status: 200, binario: { contenido: '%PDF-1.7 simulado', mime: 'application/pdf', nombre } }
        : { status: 200, binario: { contenido: '<Invoice/>', mime: 'application/xml', nombre } };
    }
    const reenvio = ruta.match(/^\/ventas\/comprobantes\/([\w-]+)\/reenviar$/);
    if (reenvio && metodo === 'POST') {
      const c = comprobantes.find((x) => x.id === reenvio[1]);
      if (!c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe' } };
      if (!reenviables(proveedorDe(c)).includes(c.estado)) return { status: 409, body: { codigo: 'COMPROBANTE_NO_REENVIABLE', mensaje: 'El comprobante ya fue aceptado' } };
      const errores = validarReceptor(cuerpo, c.tipo, { total: c.total, moneda: c.moneda });
      if (errores.length) return noValido(errores);
      const limpio = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
      Object.assign(c, {
        ruc: limpio(cuerpo.ruc), dni: c.tipo === 'BOLETA' && !limpio(cuerpo.ruc) ? normalizarDni(cuerpo.dni) || null : null, razonSocial: String(cuerpo.razonSocial).trim(), direccion: limpio(cuerpo.direccion), correoFacturacion: String(cuerpo.correoFacturacion).trim(),
        estado: 'PENDIENTE', motivo: 'Corregido y reenviado: esperando la respuesta del OSE', enEspera: true,
      });
      return { status: 200, body: dto(c) };
    }
    if (ruta === '/ventas/datos-fiscales' && metodo === 'GET') return { status: 200, body: fiscalesDto() };
    if (ruta === '/ventas/datos-fiscales' && metodo === 'PUT') {
      const v: Record<string, unknown> = { ...cuerpo, rucEmisor: cuerpo.rucEmisor === '' ? null : cuerpo.rucEmisor ?? null };
      const errores = validarDatosFiscales(v, PROVEEDORES_OSE.map((p) => p.codigo));
      if (v.proveedor === 'pruebas' && v.ambiente === 'produccion') errores.push({ campo: 'ambiente', mensaje: 'El OSE de pruebas solo emite en el ambiente de pruebas' });
      const p = PROVEEDORES_OSE.find((x) => x.codigo === v.proveedor);
      if (p && !disponible(p.soloPruebas)) errores.push({ campo: 'proveedor', mensaje: `${p.nombre} no está disponible en este entorno` });
      if (errores.length) return noValido(errores);
      fiscales = { ...fiscales, ...v };
      return { status: 200, body: fiscalesDto() };
    }
    return null;
  }

  return { panel, comprobantes, fiscales: () => fiscales };
}
