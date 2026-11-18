// HU-1711 · Facturación de la organización simulada con las mismas reglas que la API (`@aptio/schema/facturacion-org`):
// solo el administrador, los datos del alta hasta que se editan, el cambio de tarjeta solo con la pasarela de pruebas y
// la descarga del PDF y el XML de los comprobantes de la organización (un id ajeno da 404). HU-1712: el DNI de la boleta
// (obligatorio si el plan supera S/ 700 con IGV) y el CDR de SUNAT.
import { validarDatosFacturacion, validarMedioPrueba } from '@aptio/schema/facturacion-org';
import { conIgv } from '@aptio/schema/planes';

export interface ComprobanteOrgSim {
  id: string; tipo: 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO'; numeroCompleto: string; referencia?: string | null; emitidoEn: string; moneda?: 'PEN' | 'USD'; total: number;
  estado?: 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO'; conPdf?: boolean; conXml?: boolean; conCdr?: boolean;
}
export interface FacturacionOrgSitioSim {
  plan?: { nombre: string; ciclo: 'MENSUAL' | 'ANUAL'; precioPactadoSinIgv: number; moneda: 'PEN' | 'USD'; estado: 'ACTIVA' | 'PAGO_PENDIENTE' | 'SUSPENDIDA' | 'CANCELADA'; finPeriodo: string } | null;
  pasarela?: 'pruebas' | 'stripe' | 'culqi';
  ultimos4Digitos?: string | null;
  /** Los del alta (origen ALTA) hasta que se editan. */
  datos?: { razonSocial: string; ruc: string | null; direccion: string | null; correoFacturacion: string; tipoComprobantePreferido: 'FACTURA' | 'BOLETA'; dni?: string | null };
  comprobantes?: ComprobanteOrgSim[];
}
type Respuesta = { status: number; body?: unknown; binario?: { contenido: string; mime: string; nombre: string } };

const AVISO = 'Con esta pasarela la tarjeta no se guarda en Aptio SCORM: cada renovación te llega por correo con el enlace para pagar.';
const noValido = (errores: { campo: string; mensaje: string }[]): Respuesta => ({ status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } });

export function crearFacturacionOrgSim(d: FacturacionOrgSitioSim | undefined, rol: () => string, consumo: () => unknown) {
  const plan = d?.plan === undefined ? { nombre: 'Productora', ciclo: 'MENSUAL' as const, precioPactadoSinIgv: 1290, moneda: 'PEN' as const, estado: 'ACTIVA' as const, finPeriodo: '2026-12-10T05:00:00.000Z' } : d.plan;
  const medio = { pasarela: d?.pasarela ?? 'pruebas', ultimos4Digitos: d?.ultimos4Digitos === undefined ? '1111' : d.ultimos4Digitos };
  let datos = { ...(d?.datos ?? { razonSocial: 'Minera Andina SAC', ruc: '20100070970', direccion: null, correoFacturacion: 'pagos@minera.pe', tipoComprobantePreferido: 'FACTURA' as const }), dni: d?.datos?.dni ?? null, origen: 'ALTA' as 'ALTA' | 'PORTAL' };
  const comprobantes = (d?.comprobantes ?? []).map((c) => ({ referencia: null, moneda: 'PEN' as const, estado: 'ACEPTADO' as const, conPdf: true, conXml: true, conCdr: false, ...c }));
  /** Lo que el portal pidió, para comprobarlo en las pruebas. */
  const registro: { descargas: string[]; auditoria: { accion: string; datos: unknown }[] } = { descargas: [], auditoria: [] };
  const medioDto = () => ({ ...medio, editable: medio.pasarela === 'pruebas', aviso: medio.pasarela === 'pruebas' ? null : AVISO });

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>): Respuesta | null {
    if (ruta !== '/organizacion/facturacion' && !ruta.startsWith('/organizacion/facturacion/') && !ruta.startsWith('/organizacion/comprobantes/')) return null;
    if (rol() !== 'ADMINISTRADOR') return { status: 403, body: { codigo: 'SIN_PERMISO', mensaje: 'Tu rol no permite esta acción' } };
    if (ruta === '/organizacion/facturacion' && metodo === 'GET') return { status: 200, body: { plan, consumo: consumo(), medioPago: plan ? medioDto() : null, datos, comprobantes } };
    if (ruta === '/organizacion/facturacion/datos' && metodo === 'PUT') {
      const v = validarDatosFacturacion(cuerpo, plan ? { total: conIgv(plan.precioPactadoSinIgv), moneda: plan.moneda } : undefined);
      if (!v.ok) return noValido(v.errores);
      registro.auditoria.push({ accion: 'DATOS_FACTURACION_ACTUALIZADOS', datos: { antes: datos, despues: v.datos } });
      datos = { ...v.datos, origen: 'PORTAL' };
      return { status: 200, body: datos };
    }
    if (ruta === '/organizacion/facturacion/medio-pago' && metodo === 'POST') {
      if (medio.pasarela !== 'pruebas') return { status: 409, body: { codigo: 'MEDIO_NO_EDITABLE', mensaje: AVISO } };
      const v = validarMedioPrueba(cuerpo);
      if (!v.ok) return noValido(v.errores);
      registro.auditoria.push({ accion: 'MEDIO_PAGO_ACTUALIZADO', datos: { pasarela: medio.pasarela, antes: medio.ultimos4Digitos, despues: v.ultimos4Digitos } });
      medio.ultimos4Digitos = v.ultimos4Digitos;
      return { status: 200, body: medioDto() };
    }
    const archivo = ruta.match(/^\/organizacion\/comprobantes\/([\w-]+)\/(pdf|xml|cdr)$/);
    if (archivo && metodo === 'GET') {
      const c = comprobantes.find((x) => x.id === archivo[1]);
      if (!c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe' } };
      if (!(archivo[2] === 'pdf' ? c.conPdf : archivo[2] === 'xml' ? c.conXml : c.conCdr)) return { status: 404, body: { codigo: 'ARCHIVO_PENDIENTE', mensaje: 'El comprobante aún no tiene su archivo: se genera al emitirlo' } };
      registro.descargas.push(`${c.numeroCompleto}.${archivo[2]}`);
      const nombre = `20000000001-${c.tipo === 'FACTURA' ? '01' : c.tipo === 'BOLETA' ? '03' : '07'}-${c.numeroCompleto}.${archivo[2] === 'pdf' ? 'pdf' : 'xml'}`;
      if (archivo[2] === 'cdr') return { status: 200, binario: { contenido: '<ApplicationResponse/>', mime: 'application/xml', nombre: `R-${nombre}` } };
      return archivo[2] === 'pdf'
        ? { status: 200, binario: { contenido: '%PDF-1.7 simulado', mime: 'application/pdf', nombre } }
        : { status: 200, binario: { contenido: '<Invoice/>', mime: 'application/xml', nombre } };
    }
    return null;
  }
  return { panel, registro };
}
