// HU-1708 · Ventas › Suscripciones (REQ-088, CP-150, RN-18-8). El estado de cobro de cada organización: activa, con el
// pago pendiente (con los intentos de los días 0, 1, 3 y 7), suspendida desde el día 10 o cancelada; el filtro por
// estado y «Reintentar ahora», que pone en cola un intento fuera del calendario (con la pasarela de pruebas cobra con la
// tarjeta guardada; con Stripe o Culqi manda otra vez el enlace). Solo el superadmin (ADR-011), con auditoría.
import { DIAS_INTENTOS } from '@aptio/schema/cobranza';
import { monto2 } from '@aptio/schema/suscripciones';
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type EstadoSuscripcion, type SuscripcionVenta } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const ESTADOS: Record<EstadoSuscripcion, { nombre: string; chip: string }> = {
  ACTIVA: { nombre: 'Activa', chip: 'validado' }, PAGO_PENDIENTE: { nombre: 'Pago pendiente', chip: 'aviso' }, SUSPENDIDA: { nombre: 'Suspendida', chip: 'error' }, CANCELADA: { nombre: 'Cancelada', chip: '' },
};
const fecha = (iso: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(iso));

/** «Intento 2 de 4 · siguiente: 13 dic 2026» o «Suspendida el 20 dic 2026». */
function cobro(s: SuscripcionVenta): string {
  const r = s.renovacion;
  if (!r) return s.estado === 'CANCELADA' ? 'Sin renovación' : `Renueva el ${fecha(s.finPeriodo)}`;
  if (s.estado === 'SUSPENDIDA') return `Suspendida el ${fecha(r.suspensionEn)}`;
  return `Intento ${r.intentos} de ${DIAS_INTENTOS.length}${r.proximoIntento ? ` · ${r.intentos < DIAS_INTENTOS.length ? 'siguiente' : 'suspensión'}: ${fecha(r.proximoIntento)}` : ''}`;
}

export function VentasSuscripciones() {
  const [estado, setEstado] = useState<EstadoSuscripcion | ''>('');
  const [lista, setLista] = useState<SuscripcionVenta[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState('');

  const cargar = (filtro: EstadoSuscripcion | '' = estado) => api.suscripcionesVentas(filtro || undefined)
    .then((r) => { setLista(r.suscripciones); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las suscripciones')));
  useEffect(() => { void cargar(''); }, []);

  async function reintentar(s: SuscripcionVenta) {
    setOcupado(s.id);
    setAviso(null);
    try {
      await api.reintentarRenovacion(s.id);
      setAviso({ tipo: 'ok', texto: `Listo: el intento de cobro de ${s.organizacion.nombre} quedó en cola. ${s.pasarela === 'pruebas' ? 'La pasarela de pruebas cobra con la tarjeta guardada.' : 'Le enviamos otra vez el enlace para pagar.'}` });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se pudo reintentar el cobro de ${s.organizacion.nombre}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setOcupado('');
    }
  }

  return (
    <>
      <Cabecera titulo="Suscripciones" subtitulo="El estado de cobro de cada organización: renovación, reintentos y suspensión a solo lectura." />
      <section className="tarjeta facturacion-panel" aria-labelledby="titulo-suscripciones">
        <div className="tarjeta-cabeza">
          <h2 id="titulo-suscripciones">Organizaciones</h2>
          <div className="facturacion-filtro">
            <p className="campo">
              <label htmlFor="filtro-suscripcion">Estado</label>
              <select id="filtro-suscripcion" value={estado} onChange={(e) => { const v = e.target.value as EstadoSuscripcion | ''; setEstado(v); setAviso(null); void cargar(v); }}>
                <option value="">Todos</option>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
              </select>
            </p>
            <button type="button" className="boton" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
          </div>
        </div>
        <p className="sec">Al terminar el período se intenta cobrar el día 0 y se reintenta los días 1, 3 y 7. Sin pago, el día 10 la cuenta queda en solo lectura hasta que pague.</p>
        {error ? <div className="nota error" role="alert">{error}</div> : null}
        {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
        {!lista ? (!error ? <p className="sec" role="status">Cargando las suscripciones…</p> : null) : lista.length === 0 ? <p className="nota">No hay suscripciones{estado ? ` en estado ${ESTADOS[estado].nombre.toLowerCase()}` : ''}.</p> : (
          <table className="tabla-popups tabla-comprobantes" aria-label="Suscripciones">
            <thead><tr><th scope="col">Organización</th><th scope="col">Plan</th><th scope="col">Estado</th><th scope="col">Cobro</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id}>
                  <th scope="row" data-etiqueta="Organización"><b>{s.organizacion.nombre}</b><br /><span className="sec">{s.pasarela}{s.ultimos4Digitos ? ` · tarjeta •••• ${s.ultimos4Digitos}` : ''}</span></th>
                  <td data-etiqueta="Plan">{s.plan.nombre}<br /><span className="sec">{s.ciclo === 'ANUAL' ? 'Anual' : 'Mensual'}</span></td>
                  <td data-etiqueta="Estado"><span className={`chip ${ESTADOS[s.estado].chip}`}>{ESTADOS[s.estado].nombre}</span></td>
                  <td data-etiqueta="Cobro">
                    {s.renovacion ? <>{monto2(s.renovacion.total, s.renovacion.moneda)}<br /></> : null}
                    <span className="sec">{cobro(s)}</span>
                    {s.renovacion?.motivoRechazo ? <><br /><span className="sec">Último rechazo: {s.renovacion.motivoRechazo}</span></> : null}
                  </td>
                  <td data-etiqueta="Acciones">
                    {s.reintentable ? (
                      <button type="button" className="boton primario" disabled={Boolean(ocupado)} onClick={() => void reintentar(s)}>
                        {ocupado === s.id ? 'Reintentando…' : 'Reintentar ahora'}<span className="sr"> el cobro de {s.organizacion.nombre}</span>
                      </button>
                    ) : <span className="sec">Sin acciones</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
