// HU-1601 · Captación › Leads y CRM (PNT-34, REQ-074, RN-17-1): los contactos que llegan del sitio con su origen, la
// página de entrada y el UTM del primer contacto, la etapa del embudo (se cambia en la misma fila) y «Exportar CSV» con
// los filtros aplicados. HU-1602 (REQ-075, RN-17-2): la columna «CRM» con «Reintentar» y las tarjetas de Conexiones,
// Mapeo de campos y Webhook. Solo el superadmin (ADR-011).
import { ETAPAS_LEAD, etiquetaEtapa, etiquetaOrigen, ETIQUETA_ETAPA, ETIQUETA_ORIGEN, ORIGENES_LEAD, PARAMETROS_UTM, resumenUtm, CAMPO_UTM } from '@aptio/schema/leads';
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type FiltroLeads, type LeadSitio, type ListaLeads } from '../api';
import { TarjetasCrm } from './CaptacionCrm';

const POR_PAGINA = 25;
const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const fechaLima = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const horaLima = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

export function CaptacionLeads() {
  const [filtro, setFiltro] = useState<FiltroLeads>({});
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<ListaLeads | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [exportando, setExportando] = useState(false);

  const cargar = (f: FiltroLeads, p: number) =>
    api.leads({ ...f, pagina: p, porPagina: POR_PAGINA }).then((l) => { setLista(l); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los leads')));
  useEffect(() => { void cargar(filtro, pagina); }, [filtro, pagina]);

  const filtrar = (cambio: FiltroLeads) => {
    setFiltro((f) => ({ ...f, ...cambio }));
    setPagina(1);
    setAviso(null);
  };

  async function cambiarEtapa(l: LeadSitio, etapa: string) {
    setAviso(null);
    try {
      const nuevo = await api.cambiarEtapaLead(l.id, etapa);
      setLista((x) => (x ? { ...x, leads: x.leads.map((y) => (y.id === nuevo.id ? nuevo : y)) } : x));
      setAviso({ tipo: 'ok', texto: `${l.nombre || l.correo} pasó a la etapa «${etiquetaEtapa(etapa)}».` });
      // Con un filtro por etapa, la fila ya no corresponde: se vuelve a pedir la página.
      if (filtro.etapa && filtro.etapa !== etapa) await cargar(filtro, pagina);
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se cambió la etapa: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    }
  }

  async function reintentar(l: LeadSitio) {
    setAviso(null);
    try {
      const { encolados } = await api.sincronizarLead(l.id);
      await cargar(filtro, pagina);
      setAviso({ tipo: 'ok', texto: encolados.length ? `${l.nombre || l.correo} volvió a la cola de envío.` : `${l.nombre || l.correo} ya estaba enviado a todas las conexiones activas.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se reintentó el envío: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    }
  }

  async function exportar() {
    setExportando(true);
    setAviso(null);
    try {
      const { archivo, nombre } = await api.exportarLeads(filtro);
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAviso({ tipo: 'ok', texto: `Se descargó ${nombre}${lista ? ` con ${lista.total === 1 ? '1 lead' : `${lista.total} leads`}` : ''}.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se pudo exportar: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setExportando(false);
    }
  }

  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.porPagina)) : 1;
  const hayFiltro = Boolean(filtro.origen || filtro.etapa);

  return (
    <>
      <Cabecera titulo="Leads y CRM" subtitulo="Contactos que llegan del sitio, su origen y su sincronización con el CRM."
        accion={<button type="button" className="boton" disabled={exportando || !lista} onClick={() => void exportar()}>{exportando ? 'Exportando…' : 'Exportar CSV'}</button>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      <section className="tarjeta" aria-labelledby="leads-titulo">
        <div className="leads-cabeza">
          <h2 id="leads-titulo">Leads</h2>
          <form className="leads-filtros" aria-label="Filtrar leads" onSubmit={(e) => e.preventDefault()}>
            <label>
              Origen
              <select value={filtro.origen ?? ''} onChange={(e) => filtrar({ origen: e.target.value || undefined })}>
                <option value="">Todos</option>
                {ORIGENES_LEAD.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}
              </select>
            </label>
            <label>
              Etapa
              <select value={filtro.etapa ?? ''} onChange={(e) => filtrar({ etapa: e.target.value || undefined })}>
                <option value="">Todas</option>
                {ETAPAS_LEAD.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
              </select>
            </label>
          </form>
        </div>
        {!lista ? (!error ? <p className="sec" role="status">Cargando los leads…</p> : null) : lista.total === 0 ? (
          <p className="nota">{hayFiltro ? 'No hay leads con estos filtros.' : 'Aún no llegan leads. Agrega el bloque «Formulario de contacto» a una página del sitio y publícala.'}</p>
        ) : (
          <>
            <p className="sec" role="status">{lista.total === 1 ? '1 lead' : `${lista.total} leads`}{hayFiltro ? ' con estos filtros' : ''}{paginas > 1 ? ` · página ${lista.pagina} de ${paginas}` : ''}</p>
            <div className="tabla-costos">
              <table aria-label="Leads del sitio" className="tabla-leads">
                <thead>
                  <tr>
                    <th scope="col">Contacto</th>
                    <th scope="col">Origen</th>
                    <th scope="col">Entrada</th>
                    <th scope="col">Etapa</th>
                    <th scope="col">CRM</th>
                    <th scope="col">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.leads.map((l) => <FilaLead key={l.id} lead={l} alCambiarEtapa={(e) => void cambiarEtapa(l, e)} alReintentar={() => void reintentar(l)} />)}
                </tbody>
              </table>
            </div>
            {paginas > 1 ? (
              <nav className="acciones-fila" aria-label="Páginas de leads">
                <button type="button" className="boton" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                <button type="button" className="boton" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
              </nav>
            ) : null}
          </>
        )}
        <p className="sec leads-pie">Cada correo es un solo lead: el origen, la entrada y el UTM son los de su primer contacto. Si vuelve a escribir, se suma a su historial.</p>
      </section>
      <TarjetasCrm alAvisar={setAviso} />
    </>
  );
}

const CLASE_CRM: Record<string, string> = { sincronizado: 'validado', pendiente: 'aviso', error: 'error', sin_envio: '' };

function FilaLead({ lead: l, alCambiarEtapa, alReintentar }: { lead: LeadSitio; alCambiarEtapa: (etapa: string) => void; alReintentar: () => void }) {
  const nombre = l.nombre || l.correo;
  const utm = PARAMETROS_UTM.filter((p) => l[CAMPO_UTM[p]]);
  return (
    <tr>
      <th scope="row">
        <b>{nombre}</b>
        {l.totalContactos > 1 ? <span className="chip leads-contactos">{l.totalContactos} contactos</span> : null}
        <span className="sec leads-linea">{[l.empresa, l.correo].filter(Boolean).join(' · ')}</span>
      </th>
      <td>
        <span className={`chip ${l.origen === 'asistente_ia' ? 'ia' : ''}`}>{etiquetaOrigen(l.origen)}</span>
        {l.via !== l.origen ? <span className="sec leads-linea">vía {etiquetaOrigen(l.via)}</span> : null}
      </td>
      <td>
        <span className="seo-ruta">{l.paginaEntrada}</span>
        <span className="sec leads-linea">{resumenUtm(l)}</span>
        {utm.length ? (
          <ul className="leads-utm" aria-label={`UTM de ${nombre}`}>
            {utm.map((p) => <li key={p}><span className="chip">{p}: {l[CAMPO_UTM[p]]}</span></li>)}
          </ul>
        ) : null}
      </td>
      <td>
        <select aria-label={`Etapa de ${nombre}`} value={l.etapa} onChange={(e) => alCambiarEtapa(e.target.value)}>
          {ETAPAS_LEAD.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
        </select>
      </td>
      <td className="leads-crm">
        <span className={`chip ${CLASE_CRM[l.crm.estado] ?? ''}`}>{l.crm.texto}</span>
        {l.crm.estado === 'error' || l.crm.estado === 'pendiente' ? <button type="button" className="boton chico" aria-label={`Reintentar el envío de ${nombre}`} onClick={alReintentar}>Reintentar</button> : null}
      </td>
      <td>{fechaLima(l.creadoEn)}<span className="sec leads-linea">{horaLima(l.creadoEn)}</span></td>
    </tr>
  );
}
