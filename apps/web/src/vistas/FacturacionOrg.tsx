// HU-1711 · Facturación de la organización (PNT-40, REQ-091, CP-153), solo el administrador. Cuatro secciones:
// 1. «Plan y consumo»: el plan vigente, la cuota del mes y el enlace a Plan y suscripción;
// 2. «Comprobantes»: tipo, serie-número, fecha, monto y estado SUNAT, con la descarga del PDF y el XML cuando existen;
// 3. «Medio de pago»: la pasarela y los 4 últimos dígitos; con la pasarela de pruebas se cambia la tarjeta (sin CVV, solo
//    se guardan los 4 últimos dígitos, SUP-331); con Stripe o Culqi, el aviso del cobro por enlace (SUP-319);
// 4. «Datos de facturación»: razón social, factura o boleta, RUC, dirección y correo, validados con las mismas reglas que
//    la API. Rigen para los comprobantes nuevos: los ya emitidos no cambian (SUP-318). HU-1712: con boleta, el DNI del
//    comprador, obligatorio si el plan supera S/ 700 con IGV; y la descarga del CDR de SUNAT cuando el OSE lo entrega.
import { Cabecera } from '@aptio/ui';
import { LIMITES_FACTURACION, validarDatosFacturacion } from '@aptio/schema/facturacion-org';
import { conIgv } from '@aptio/schema/planes';
import { monto2 } from '@aptio/schema/suscripciones';
import { useEffect, useId, useState } from 'react';
import { api, type ComprobanteOrg, type FormatoComprobante, type DatosFacturacionOrg, ErrorApi, type EstadoComprobante, type EstadoSuscripcion, type FacturacionOrg as Resumen, type MedioPagoOrg } from '../api';
import { navegar } from '../ruta';
import { IndicadorCuota } from './CuotaCapsulas';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const fecha = (iso: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(iso));
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(iso));
const TIPOS: Record<ComprobanteOrg['tipo'], string> = { FACTURA: 'Factura', BOLETA: 'Boleta', NOTA_CREDITO: 'Nota de crédito' };
const ESTADOS: Record<EstadoComprobante, { nombre: string; chip: string }> = {
  PENDIENTE: { nombre: 'Pendiente', chip: '' }, ACEPTADO: { nombre: 'Aceptado', chip: 'validado' }, OBSERVADO: { nombre: 'Observado', chip: 'aviso' }, RECHAZADO: { nombre: 'Rechazado', chip: 'error' },
};
const ESTADOS_PLAN: Record<EstadoSuscripcion, string> = { ACTIVA: 'Activa', PAGO_PENDIENTE: 'Pago pendiente', SUSPENDIDA: 'Suspendida', CANCELADA: 'Cancelada' };
const PASARELAS: Record<string, string> = { pruebas: 'Pasarela de pruebas', stripe: 'Stripe', culqi: 'Culqi' };

export function FacturacionOrg() {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.facturacionOrg().then(setR, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar la facturación')));
  }, []);

  return (
    <>
      <Cabecera titulo="Facturación" subtitulo="Tu plan y su consumo, tus comprobantes, el medio de pago y los datos con los que se emiten tus comprobantes." />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!r ? (!error ? <p className="sec" role="status">Cargando la facturación…</p> : null) : (
        <div className="facturacion-org">
          <PlanConsumo r={r} />
          <Comprobantes lista={r.comprobantes} />
          <MedioPago medio={r.medioPago} alCambiar={(medioPago) => setR({ ...r, medioPago })} />
          <DatosFacturacion inicial={r.datos} importe={r.plan ? { total: conIgv(r.plan.precioPactadoSinIgv), moneda: r.plan.moneda } : undefined} alGuardar={(datos) => setR({ ...r, datos })} />
        </div>
      )}
    </>
  );
}

function PlanConsumo({ r }: { r: Resumen }) {
  const p = r.plan;
  return (
    <section className="tarjeta" aria-labelledby="fo-plan">
      <div className="tarjeta-cabeza"><h2 id="fo-plan">Plan y consumo</h2></div>
      {p ? (
        <dl className="desglose">
          <div><dt>Plan</dt><dd>{p.nombre}</dd></div>
          <div><dt>Precio</dt><dd>{monto2(p.precioPactadoSinIgv, p.moneda)} {p.ciclo === 'ANUAL' ? 'al año' : 'al mes'} sin IGV</dd></div>
          <div><dt>Estado</dt><dd>{ESTADOS_PLAN[p.estado]}</dd></div>
          <div><dt>{p.estado === 'CANCELADA' ? 'Terminó el' : 'Próxima renovación'}</dt><dd>{fechaLarga(p.finPeriodo)}</dd></div>
        </dl>
      ) : <p className="nota">Tu organización no tiene una suscripción.</p>}
      <IndicadorCuota cuota={r.consumo} />
      <p><a href="/plan" onClick={(e) => { e.preventDefault(); navegar('/plan'); }}>Cambiar de plan o cancelar en Plan y suscripción</a></p>
    </section>
  );
}

function Comprobantes({ lista }: { lista: ComprobanteOrg[] }) {
  const [aviso, setAviso] = useState('');

  async function descargar(c: ComprobanteOrg, formato: FormatoComprobante) {
    setAviso('');
    try {
      const { archivo, nombre } = await api.archivoComprobanteOrg(c.id, formato);
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setAviso(`No se descargó el ${formato.toUpperCase()} de ${c.numeroCompleto}: ${mensajeDe(e, 'inténtalo de nuevo')}`);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="fo-comprobantes">
      <div className="tarjeta-cabeza"><h2 id="fo-comprobantes">Comprobantes</h2></div>
      <p className="sec">Cada pago emite su factura o su boleta electrónica; un reembolso emite su nota de crédito.</p>
      {aviso ? <div className="nota error" role="alert">{aviso}</div> : null}
      {lista.length === 0 ? <p className="nota">Aún no tienes comprobantes.</p> : (
        <table className="tabla-popups tabla-comprobantes" aria-labelledby="fo-comprobantes">
          <thead><tr><th scope="col">Comprobante</th><th scope="col">Fecha</th><th scope="col" className="num">Monto</th><th scope="col">Estado SUNAT</th><th scope="col">Descargas</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <th scope="row" data-etiqueta="Comprobante"><b>{c.numeroCompleto}</b><br /><span className="sec">{TIPOS[c.tipo]}{c.referencia ? ` · corrige ${c.referencia}` : ''}</span></th>
                <td data-etiqueta="Fecha">{fecha(c.emitidoEn)}</td>
                <td className="num" data-etiqueta="Monto">{monto2(c.total, c.moneda)}</td>
                <td data-etiqueta="Estado SUNAT"><span className={`chip ${ESTADOS[c.estado].chip}`}>{ESTADOS[c.estado].nombre}</span></td>
                <td data-etiqueta="Descargas">
                  <div className="popup-acciones">
                    <button type="button" className="boton" disabled={!c.conPdf} aria-label={`PDF de ${c.numeroCompleto}`} onClick={() => void descargar(c, 'pdf')}>PDF</button>
                    <button type="button" className="boton" disabled={!c.conXml} aria-label={`XML de ${c.numeroCompleto}`} onClick={() => void descargar(c, 'xml')}>XML</button>
                    {c.conCdr ? <button type="button" className="boton" aria-label={`CDR de SUNAT de ${c.numeroCompleto}`} onClick={() => void descargar(c, 'cdr')}>CDR</button> : null}
                  </div>
                  {!c.conPdf || !c.conXml ? <span className="sec">Archivos en preparación</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MedioPago({ medio, alCambiar }: { medio: MedioPagoOrg | null; alCambiar: (m: MedioPagoOrg) => void }) {
  const id = useId();
  const [tarjeta, setTarjeta] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cambiar() {
    setError('');
    setListo('');
    setOcupado(true);
    try {
      const m = await api.cambiarMedioPago(tarjeta);
      alCambiar(m);
      setTarjeta('');
      setListo(`Listo: los próximos cobros usan la tarjeta terminada en ${m.ultimos4Digitos}.`);
    } catch (e) {
      setError(e instanceof ErrorApi && e.detalles?.length ? e.detalles.map((d) => String(d.mensaje)).join('. ') : mensajeDe(e, 'No se cambió la tarjeta'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="fo-medio">
      <div className="tarjeta-cabeza"><h2 id="fo-medio">Medio de pago</h2></div>
      {!medio ? <p className="nota">Sin suscripción no hay un medio de pago registrado.</p> : (
        <>
          <dl className="desglose">
            <div><dt>Pasarela</dt><dd>{PASARELAS[medio.pasarela] ?? medio.pasarela}</dd></div>
            <div><dt>Tarjeta</dt><dd>{medio.ultimos4Digitos ? `Terminada en ${medio.ultimos4Digitos}` : 'No se guarda en Aptio SCORM'}</dd></div>
          </dl>
          {listo ? <div className="nota validado" role="status">{listo}</div> : null}
          {medio.editable ? (
            <form className="fo-tarjeta" aria-label="Cambiar la tarjeta" noValidate onSubmit={(e) => { e.preventDefault(); void cambiar(); }}>
              <p className="campo">
                <label htmlFor={`${id}-tarjeta`}>Tarjeta de prueba nueva</label>
                <input id={`${id}-tarjeta`} type="text" inputMode="numeric" autoComplete="off" maxLength={23} value={tarjeta} onChange={(e) => setTarjeta(e.target.value)}
                  aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`} aria-invalid={error ? true : undefined} />
                <span id={`${id}-ayuda`} className="sec">Pasarela de pruebas, no cobra: 4111 1111 1111 1111 aprueba los cobros y 4000 0000 0000 0002 los rechaza. No se pide el código de seguridad y solo se guardan los 4 últimos dígitos.</span>
                {error ? <span id={`${id}-error`} className="sec texto-error" role="alert">{error}</span> : null}
              </p>
              <div className="acciones-form"><button className="boton primario" type="submit" disabled={ocupado}>Cambiar la tarjeta</button></div>
            </form>
          ) : <p className="nota aviso">{medio.aviso}</p>}
        </>
      )}
    </section>
  );
}

type Campo = 'razonSocial' | 'ruc' | 'dni' | 'direccion' | 'correoFacturacion' | 'tipoComprobantePreferido';
type Importe = { total: number; moneda: 'PEN' | 'USD' };
const formulario = (d: DatosFacturacionOrg) => ({ razonSocial: d.razonSocial, ruc: d.ruc ?? '', dni: d.dni ?? '', direccion: d.direccion ?? '', correoFacturacion: d.correoFacturacion, tipoComprobantePreferido: d.tipoComprobantePreferido });

function DatosFacturacion({ inicial, importe, alGuardar }: { inicial: DatosFacturacionOrg; importe: Importe | undefined; alGuardar: (d: DatosFacturacionOrg) => void }) {
  const id = useId();
  const [v, setV] = useState(() => formulario(inicial));
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [listo, setListo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const factura = v.tipoComprobantePreferido === 'FACTURA';
  const exigeDni = !factura && !!importe && importe.total > (importe.moneda === 'USD' ? 200 : 700);

  async function guardar() {
    setListo('');
    const entrada = { ...v, ruc: v.ruc.trim() || null, dni: factura ? null : v.dni.trim() || null, direccion: v.direccion.trim() || null };
    const r = validarDatosFacturacion(entrada, importe);
    if (!r.ok) {
      setErrores(Object.fromEntries(r.errores.map((e) => [e.campo, e.mensaje])));
      document.getElementById(`${id}-${r.errores[0]!.campo}`)?.focus();
      return;
    }
    setErrores({});
    setOcupado(true);
    try {
      const d = await api.guardarDatosFacturacion(r.datos);
      alGuardar(d);
      setV(formulario(d));
      setListo('Se guardaron tus datos de facturación: rigen para los próximos comprobantes y los ya emitidos no cambian.');
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles?.length) setErrores(Object.fromEntries(e.detalles.map((d) => [String(d.campo), String(d.mensaje)])));
      else setErrores({ razonSocial: mensajeDe(e, 'No se guardaron los datos de facturación') });
    } finally {
      setOcupado(false);
    }
  }

  const props = (c: Campo, ayuda = false) => ({
    id: `${id}-${c}`,
    'aria-invalid': errores[c] ? true : undefined,
    'aria-describedby': [ayuda ? `${id}-${c}-ayuda` : '', errores[c] ? `${id}-${c}-error` : ''].filter(Boolean).join(' ') || undefined,
  });
  const errorDe = (c: Campo) => (errores[c] ? <span id={`${id}-${c}-error`} className="sec texto-error">{errores[c]}</span> : null);
  const hay = Object.values(errores).filter(Boolean);

  return (
    <section className="tarjeta" aria-labelledby="fo-datos">
      <div className="tarjeta-cabeza"><h2 id="fo-datos">Datos de facturación</h2></div>
      <p className="sec">{inicial.origen === 'ALTA' ? 'Son los datos de tu alta: aún no los has editado. ' : ''}Los cambios rigen para los próximos comprobantes; los ya emitidos no cambian.</p>
      {listo ? <div className="nota validado" role="status">{listo}</div> : null}
      {hay.length ? <div className="nota error" role="alert">Revisa {hay.length === 1 ? 'el campo marcado' : `los ${hay.length} campos marcados`}.</div> : null}
      <form className="formulario-ajustes" aria-label="Datos de facturación" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <fieldset className="plan-rasgos" id={`${id}-tipoComprobantePreferido`} tabIndex={-1} aria-describedby={errores.tipoComprobantePreferido ? `${id}-tipoComprobantePreferido-error` : undefined}>
          <legend>Comprobante que prefieres</legend>
          <label className="casilla"><input type="radio" name={`${id}-tipo`} value="FACTURA" checked={factura} onChange={() => setV({ ...v, tipoComprobantePreferido: 'FACTURA' })} /> Factura (con RUC)</label>
          <label className="casilla"><input type="radio" name={`${id}-tipo`} value="BOLETA" checked={!factura} onChange={() => setV({ ...v, tipoComprobantePreferido: 'BOLETA' })} /> Boleta</label>
          {errorDe('tipoComprobantePreferido')}
        </fieldset>
        <div className="plan-campos">
          <p className="campo">
            <label htmlFor={`${id}-razonSocial`}>Razón social o nombre</label>
            <input type="text" autoComplete="organization" maxLength={LIMITES_FACTURACION.razonSocial} value={v.razonSocial} onChange={(e) => setV({ ...v, razonSocial: e.target.value })} aria-required="true" {...props('razonSocial')} />
            {errorDe('razonSocial')}
          </p>
          <p className="campo">
            <label htmlFor={`${id}-ruc`}>RUC{factura ? '' : ' (opcional)'}</label>
            <input type="text" inputMode="numeric" autoComplete="off" maxLength={11} value={v.ruc} onChange={(e) => setV({ ...v, ruc: e.target.value })} aria-required={factura ? 'true' : undefined} {...props('ruc', true)} />
            <span id={`${id}-ruc-ayuda`} className="sec">{factura ? '11 dígitos: la factura lo exige.' : 'Con boleta puedes dejarlo vacío.'}</span>
            {errorDe('ruc')}
          </p>
          {!factura ? (
            <p className="campo">
              <label htmlFor={`${id}-dni`}>DNI del comprador{exigeDni ? '' : ' (opcional)'}</label>
              <input type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={v.dni} onChange={(e) => setV({ ...v, dni: e.target.value })} aria-required={exigeDni ? 'true' : undefined} {...props('dni', true)} />
              <span id={`${id}-dni-ayuda`} className="sec">{exigeDni ? 'Tu plan supera S/ 700 con IGV: SUNAT pide el DNI de 8 dígitos en la boleta.' : '8 dígitos. Las boletas de más de S/ 700 lo exigen.'}</span>
              {errorDe('dni')}
            </p>
          ) : null}
          <p className="campo">
            <label htmlFor={`${id}-direccion`}>Dirección (opcional)</label>
            <input type="text" autoComplete="street-address" maxLength={LIMITES_FACTURACION.direccion} value={v.direccion} onChange={(e) => setV({ ...v, direccion: e.target.value })} {...props('direccion')} />
            {errorDe('direccion')}
          </p>
          <p className="campo">
            <label htmlFor={`${id}-correoFacturacion`}>Correo de facturación</label>
            <input type="email" autoComplete="email" maxLength={LIMITES_FACTURACION.correo} value={v.correoFacturacion} onChange={(e) => setV({ ...v, correoFacturacion: e.target.value })} aria-required="true" {...props('correoFacturacion', true)} />
            <span id={`${id}-correoFacturacion-ayuda`} className="sec">Ahí llegan el PDF y el XML de cada comprobante.</span>
            {errorDe('correoFacturacion')}
          </p>
        </div>
        <div className="acciones-form"><button className="boton primario" type="submit" disabled={ocupado}>Guardar los datos</button></div>
      </form>
    </section>
  );
}
