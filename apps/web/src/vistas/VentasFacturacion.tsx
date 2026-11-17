// HU-1707 · Ventas › Facturación (PNT-37, REQ-087, CP-148, CP-149, RN-18-4, RN-18-5, RN-18-9). Dos pestañas:
// «Comprobantes», la tabla con el filtro por estado SUNAT, la descarga del PDF y el XML y «Corregir y reenviar» para
// un observado (o pendiente), que vuelve a enviar el mismo número al OSE; y «Datos fiscales», el emisor, las series, el
// proveedor OSE, el ambiente y la detracción, con el aviso de que esta última está por validar con el contador. Los
// secretos del OSE viven en variables de entorno, nunca aquí. Solo el superadmin (ADR-011).
// HU-1709: la tercera pestaña, «Cupones» (`VentasCupones.tsx`).
import { LIMITES_FISCALES, validarDatosFiscales, validarReceptor } from '@aptio/schema/comprobantes';
import { monto2 } from '@aptio/schema/suscripciones';
import { Cabecera } from '@aptio/ui';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Cupones } from './VentasCupones';
import { api, type ComprobanteVenta, type DatosFiscalesConProveedores, type DatosFiscalesVenta, ErrorApi, type EstadoComprobante } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
const PESTANAS = [{ id: 'comprobantes', nombre: 'Comprobantes' }, { id: 'datos', nombre: 'Datos fiscales' }, { id: 'cupones', nombre: 'Cupones' }] as const;
type Pestana = (typeof PESTANAS)[number]['id'];
const ESTADOS: Record<EstadoComprobante, { nombre: string; chip: string }> = {
  PENDIENTE: { nombre: 'Pendiente', chip: '' }, ACEPTADO: { nombre: 'Aceptado', chip: 'validado' }, OBSERVADO: { nombre: 'Observado', chip: 'aviso' }, RECHAZADO: { nombre: 'Rechazado', chip: 'error' },
};
const TIPOS: Record<ComprobanteVenta['tipo'], string> = { FACTURA: 'Factura', BOLETA: 'Boleta', NOTA_CREDITO: 'Nota de crédito' };
const fecha = (iso: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(iso));

export function VentasFacturacion() {
  const [pestana, setPestana] = useState<Pestana>('comprobantes');
  const pestanas = useRef<HTMLDivElement>(null);

  function tecla(e: KeyboardEvent<HTMLButtonElement>) {
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const n = PESTANAS.length;
    const destino = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (destino < 0) return;
    e.preventDefault();
    setPestana(PESTANAS[destino]!.id);
    pestanas.current?.querySelector<HTMLButtonElement>(`#pestana-${PESTANAS[destino]!.id}`)?.focus();
  }

  return (
    <>
      <Cabecera titulo="Facturación" subtitulo="Facturas, boletas y notas de crédito electrónicas de cada cobro, con su estado ante SUNAT, los datos fiscales del emisor y los cupones." />
      <div className="opciones" role="tablist" aria-label="Facturación" ref={pestanas}>
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" id={`pestana-${p.id}`} className="opcion" aria-selected={pestana === p.id} aria-controls={`panel-${p.id}`}
            tabIndex={pestana === p.id ? 0 : -1} onClick={() => setPestana(p.id)} onKeyDown={tecla}>{p.nombre}</button>
        ))}
      </div>
      <section className="tarjeta facturacion-panel" role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`pestana-${pestana}`}>
        {pestana === 'comprobantes' ? <Comprobantes /> : pestana === 'datos' ? <DatosFiscales /> : <Cupones />}
      </section>
    </>
  );
}

function Comprobantes() {
  const [estado, setEstado] = useState<EstadoComprobante | ''>('');
  const [lista, setLista] = useState<ComprobanteVenta[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [corrigiendo, setCorrigiendo] = useState<ComprobanteVenta | null>(null);

  const cargar = (filtro: EstadoComprobante | '' = estado) => api.comprobantes(filtro || undefined)
    .then((r) => { setLista(r.comprobantes); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los comprobantes')));
  useEffect(() => { void cargar(''); }, []);

  async function descargar(c: ComprobanteVenta, formato: 'pdf' | 'xml') {
    setAviso(null);
    try {
      const { archivo, nombre } = await api.archivoComprobante(c.id, formato);
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se descargó el ${formato.toUpperCase()} de ${c.numeroCompleto}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    }
  }

  return (
    <>
      <div className="tarjeta-cabeza">
        <h2>Comprobantes</h2>
        <div className="facturacion-filtro">
          <p className="campo">
            <label htmlFor="filtro-estado">Estado SUNAT</label>
            <select id="filtro-estado" value={estado} onChange={(e) => { const v = e.target.value as EstadoComprobante | ''; setEstado(v); setAviso(null); void cargar(v); }}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
          </p>
          <button type="button" className="boton" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
        </div>
      </div>
      <p className="sec">Cada cobro aprobado emite su factura (con RUC) o su boleta; un reembolso emite la nota de crédito. Un comprobante observado se corrige y se reenvía con el mismo número.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {corrigiendo ? (
        <CorregirReenviar key={corrigiendo.id} c={corrigiendo} alCancelar={() => setCorrigiendo(null)} alReenviar={async (r) => {
          try {
            const hecho = await api.reenviarComprobante(corrigiendo.id, r);
            setCorrigiendo(null);
            setAviso({ tipo: 'ok', texto: `Se reenvió ${hecho.numeroCompleto}: queda pendiente hasta que responda el OSE.` });
            await cargar();
            return [];
          } catch (e) {
            if (e instanceof ErrorApi && e.detalles?.length) return e.detalles.map((d) => String(d.mensaje));
            return [mensajeDe(e, 'No se pudo reenviar')];
          }
        }} />
      ) : null}
      {!lista ? (!error ? <p className="sec" role="status">Cargando los comprobantes…</p> : null) : lista.length === 0 ? <p className="nota">No hay comprobantes{estado ? ` en estado ${ESTADOS[estado].nombre.toLowerCase()}` : ''}.</p> : (
        <table className="tabla-popups tabla-comprobantes" aria-label="Comprobantes">
          <thead><tr><th scope="col">Comprobante</th><th scope="col">Cliente</th><th scope="col" className="num">Total</th><th scope="col">Estado SUNAT</th><th scope="col">Archivos y acciones</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <th scope="row" data-etiqueta="Comprobante"><b>{c.numeroCompleto}</b><br /><span className="sec">{TIPOS[c.tipo]} · {fecha(c.emitidoEn)}{c.referencia ? ` · corrige ${c.referencia}` : ''}</span></th>
                <td data-etiqueta="Cliente">{c.razonSocial}<br /><span className="sec">{c.ruc ? `RUC ${c.ruc}` : 'Sin documento'} · {c.correoFacturacion}</span></td>
                <td className="num" data-etiqueta="Total">{monto2(c.total, c.moneda)}<br /><span className="sec">IGV {monto2(c.igv, c.moneda)}{c.detraccion !== null ? ` · detracción ${monto2(c.detraccion, 'PEN')}` : ''}</span></td>
                <td data-etiqueta="Estado SUNAT"><span className={`chip ${ESTADOS[c.estado].chip}`}>{ESTADOS[c.estado].nombre}</span>{c.motivo ? <><br /><span className="sec">{c.motivo}</span></> : null}</td>
                <td data-etiqueta="Archivos y acciones">
                  <div className="popup-acciones">
                    {c.conArchivos ? (
                      <>
                        <button type="button" className="boton" onClick={() => void descargar(c, 'pdf')}>PDF<span className="sr"> de {c.numeroCompleto}</span></button>
                        <button type="button" className="boton" onClick={() => void descargar(c, 'xml')}>XML<span className="sr"> de {c.numeroCompleto}</span></button>
                      </>
                    ) : <span className="sec">Archivos en preparación</span>}
                    {c.reenviable ? <button type="button" className="boton primario" onClick={() => { setAviso(null); setCorrigiendo(c); }}>Corregir y reenviar<span className="sr"> {c.numeroCompleto}</span></button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function CorregirReenviar({ c, alReenviar, alCancelar }: { c: ComprobanteVenta; alReenviar: (r: { ruc: string | null; razonSocial: string; direccion: string | null; correoFacturacion: string }) => Promise<string[]>; alCancelar: () => void }) {
  const [ruc, setRuc] = useState(c.ruc ?? '');
  const [razonSocial, setRazonSocial] = useState(c.razonSocial);
  const [direccion, setDireccion] = useState(c.direccion ?? '');
  const [correo, setCorreo] = useState(c.correoFacturacion);
  const [errores, setErrores] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  const id = `corregir-${c.id}`;
  return (
    <section className="tarjeta corregir-comprobante" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`} tabIndex={-1} ref={titulo}>Corregir y reenviar {c.numeroCompleto}</h3>
      {c.motivo ? <p className="nota aviso">El OSE respondió: {c.motivo}</p> : null}
      <form noValidate aria-label={`Receptor de ${c.numeroCompleto}`} onSubmit={(e) => {
        e.preventDefault();
        const r = { ruc: ruc.trim() || null, razonSocial: razonSocial.trim(), direccion: direccion.trim() || null, correoFacturacion: correo.trim() };
        const errs = validarReceptor(r, c.tipo).map((x) => x.mensaje);
        setErrores(errs);
        if (errs.length) return;
        setOcupado(true);
        void alReenviar(r).then((e2) => { setErrores(e2); setOcupado(false); });
      }}>
        {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        <div className="plan-campos">
          <p className="campo"><label htmlFor={`${id}-ruc`}>RUC{c.tipo === 'FACTURA' ? '' : ' (opcional)'}</label><input id={`${id}-ruc`} type="text" inputMode="numeric" autoComplete="off" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value)} /></p>
          <p className="campo"><label htmlFor={`${id}-razon`}>Razón social o nombre</label><input id={`${id}-razon`} type="text" maxLength={LIMITES_FISCALES.razonSocial} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} /></p>
          <p className="campo"><label htmlFor={`${id}-direccion`}>Dirección (opcional)</label><input id={`${id}-direccion`} type="text" maxLength={LIMITES_FISCALES.direccion} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></p>
          <p className="campo"><label htmlFor={`${id}-correo`}>Correo de facturación</label><input id={`${id}-correo`} type="email" maxLength={LIMITES_FISCALES.correo} value={correo} onChange={(e) => setCorreo(e.target.value)} /></p>
        </div>
        <div className="acciones-fila">
          <button type="submit" className="boton primario" disabled={ocupado}>Reenviar al OSE</button>
          <button type="button" className="boton" disabled={ocupado} onClick={alCancelar}>Cancelar</button>
        </div>
      </form>
    </section>
  );
}

function DatosFiscales() {
  const [datos, setDatos] = useState<DatosFiscalesConProveedores | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.datosFiscales().then(setDatos, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los datos fiscales'))); }, []);
  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!datos) return <p className="sec" role="status">Cargando los datos fiscales…</p>;
  return <FormularioFiscal key={datos.actualizadoEn} inicial={datos} alGuardar={setDatos} />;
}

function FormularioFiscal({ inicial, alGuardar }: { inicial: DatosFiscalesConProveedores; alGuardar: (d: DatosFiscalesConProveedores) => void }) {
  const [v, setV] = useState<Omit<DatosFiscalesVenta, 'detraccionTasa' | 'detraccionUmbralPen' | 'rucEmisor'> & { rucEmisor: string; detraccionTasa: string; detraccionUmbralPen: string }>({
    ...inicial, rucEmisor: inicial.rucEmisor ?? '', detraccionTasa: String(inicial.detraccionTasa), detraccionUmbralPen: String(inicial.detraccionUmbralPen),
  });
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const campo = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const proveedor = inicial.proveedores.find((p) => p.codigo === v.proveedor);
  const series: [keyof typeof v, string][] = [['serieFactura', 'Serie de facturas'], ['serieBoleta', 'Serie de boletas'], ['serieNotaFactura', 'Notas de crédito de facturas'], ['serieNotaBoleta', 'Notas de crédito de boletas']];

  async function guardar() {
    const d: DatosFiscalesVenta = {
      ...v, rucEmisor: v.rucEmisor.trim() || null, razonSocialEmisor: v.razonSocialEmisor.trim(), direccionEmisor: v.direccionEmisor.trim(),
      serieFactura: v.serieFactura.trim().toUpperCase(), serieBoleta: v.serieBoleta.trim().toUpperCase(), serieNotaFactura: v.serieNotaFactura.trim().toUpperCase(), serieNotaBoleta: v.serieNotaBoleta.trim().toUpperCase(),
      detraccionTasa: Number(v.detraccionTasa.replace(',', '.')), detraccionUmbralPen: Number(v.detraccionUmbralPen.replace(',', '.')),
    };
    const errs = validarDatosFiscales(d, inicial.proveedores.map((p) => p.codigo)).map((x) => x.mensaje);
    setErrores(errs);
    setAviso('');
    if (errs.length) return;
    setOcupado(true);
    try {
      alGuardar(await api.guardarDatosFiscales(d));
      setAviso('Se guardaron los datos fiscales.');
    } catch (e) {
      setErrores(e instanceof ErrorApi && e.detalles?.length ? e.detalles.map((x) => String(x.mensaje)) : [mensajeDe(e, 'No se guardaron los datos fiscales')]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="formulario-ajustes" aria-label="Datos fiscales" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <div className="tarjeta-cabeza"><h2>Datos fiscales</h2></div>
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
      {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      <fieldset className="plan-rasgos">
        <legend>Emisor</legend>
        <div className="plan-campos">
          <p className="campo"><label htmlFor="fiscal-ruc">RUC del emisor</label><input id="fiscal-ruc" type="text" inputMode="numeric" maxLength={11} value={v.rucEmisor} onChange={campo('rucEmisor')} aria-describedby="fiscal-ruc-ayuda" /><span id="fiscal-ruc-ayuda" className="sec">Sin RUC, los comprobantes quedan pendientes.</span></p>
          <p className="campo"><label htmlFor="fiscal-razon">Razón social</label><input id="fiscal-razon" type="text" maxLength={LIMITES_FISCALES.razonSocial} value={v.razonSocialEmisor} onChange={campo('razonSocialEmisor')} /></p>
          <p className="campo"><label htmlFor="fiscal-direccion">Domicilio fiscal</label><input id="fiscal-direccion" type="text" maxLength={LIMITES_FISCALES.direccion} value={v.direccionEmisor} onChange={campo('direccionEmisor')} /></p>
        </div>
      </fieldset>
      <fieldset className="plan-rasgos">
        <legend>Series</legend>
        <div className="plan-campos">
          {series.map(([k, nombre]) => <p className="campo" key={k}><label htmlFor={`fiscal-${k}`}>{nombre}</label><input id={`fiscal-${k}`} type="text" maxLength={4} value={String(v[k])} onChange={campo(k)} /></p>)}
        </div>
      </fieldset>
      <fieldset className="plan-rasgos">
        <legend>Proveedor OSE</legend>
        <div className="plan-campos">
          <p className="campo">
            <label htmlFor="fiscal-proveedor">Proveedor</label>
            <select id="fiscal-proveedor" value={v.proveedor} onChange={campo('proveedor')} aria-describedby="fiscal-proveedor-ayuda">
              {inicial.proveedores.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
            <span id="fiscal-proveedor-ayuda" className="sec">{proveedor?.disponible ? 'Disponible en este entorno. Sus credenciales van en variables de entorno, nunca aquí.' : 'No está disponible en este entorno: los comprobantes quedan pendientes.'}</span>
          </p>
          <p className="campo">
            <label htmlFor="fiscal-ambiente">Ambiente</label>
            <select id="fiscal-ambiente" value={v.ambiente} onChange={campo('ambiente')}>
              <option value="pruebas">Pruebas (sin valor tributario)</option>
              <option value="produccion">Producción</option>
            </select>
          </p>
        </div>
      </fieldset>
      <fieldset className="plan-rasgos">
        <legend>Detracción</legend>
        <p className="nota aviso" id="fiscal-detraccion-aviso"><b>Por validar con el contador.</b> La tasa y el umbral de la detracción del servicio aún no están confirmados: mantenla desactivada hasta que el contador los valide.</p>
        <label className="casilla"><input type="checkbox" checked={v.detraccionActiva} onChange={(e) => setV({ ...v, detraccionActiva: e.target.checked })} aria-describedby="fiscal-detraccion-aviso" /> Aplicar la detracción en las facturas en soles desde el umbral</label>
        <div className="plan-campos">
          <p className="campo"><label htmlFor="fiscal-tasa">Tasa (%)</label><input id="fiscal-tasa" type="text" inputMode="decimal" value={v.detraccionTasa} onChange={campo('detraccionTasa')} /></p>
          <p className="campo"><label htmlFor="fiscal-umbral">Umbral en soles (con IGV)</label><input id="fiscal-umbral" type="text" inputMode="decimal" value={v.detraccionUmbralPen} onChange={campo('detraccionUmbralPen')} /></p>
        </div>
      </fieldset>
      <div className="acciones-fila"><button type="submit" className="boton primario" disabled={ocupado}>Guardar los datos fiscales</button></div>
    </form>
  );
}
