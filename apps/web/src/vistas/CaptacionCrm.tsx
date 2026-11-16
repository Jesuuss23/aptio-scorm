// HU-1602 · Captación › Leads y CRM: las tarjetas de Conexiones, Mapeo de campos y Webhook (REQ-075, PNT-34, RN-17-2).
// Las claves de HubSpot, Pipedrive y Zoho viven en el entorno del servidor: aquí solo se ve si están. El webhook lleva su
// clave HMAC-SHA256, que se copia y se regenera aquí, y «Enviar prueba» manda el evento lead.prueba firmado (CP-130).
import { useEffect, useState } from 'react';
import { api, type CambioCrm, type ConexionCrm, ErrorApi, type EstadoCrm } from '../api';

type Aviso = { tipo: 'ok' | 'error'; texto: string };
const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const CON_MAPEO = ['hubspot', 'pipedrive', 'zoho'] as const;

function estadoClave(c: ConexionCrm): { clase: string; texto: string; ayuda: string } {
  if (c.tipo === 'webhook') {
    return c.configurada ? { clase: 'validado', texto: 'Con URL y clave', ayuda: 'POST con firma HMAC' } : { clase: 'aviso', texto: 'Falta la URL', ayuda: 'Escribe su URL en la tarjeta Webhook' };
  }
  return c.configurada
    ? { clase: 'validado', texto: 'Clave configurada', ayuda: c.descripcion }
    : { clase: 'aviso', texto: 'Falta la clave', ayuda: `Define ${c.faltan.join(', ')} en el entorno del servidor` };
}

export function TarjetasCrm({ alAvisar }: { alAvisar: (a: Aviso) => void }) {
  const [crm, setCrm] = useState<EstadoCrm | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void api.crm().then(setCrm, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las conexiones')));
  }, []);

  async function hacer<T>(accion: () => Promise<T>, ok: (r: T) => string, fallo: string): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await accion();
      if (r && typeof r === 'object' && 'conexiones' in r) setCrm(r as unknown as EstadoCrm);
      alAvisar({ tipo: 'ok', texto: ok(r) });
      return true;
    } catch (e) {
      alAvisar({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }
  const cambiar = (c: CambioCrm, ok: string, fallo: string) => hacer(() => api.cambiarCrm(c), () => ok, fallo);

  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!crm) return <p className="sec" role="status">Cargando las conexiones…</p>;
  const webhook = crm.conexiones.find((c) => c.tipo === 'webhook')!;

  return (
    <div className="crm-tarjetas">
      <section className="tarjeta" aria-labelledby="crm-conexiones-titulo">
        <div className="tarjeta-cabeza"><h2 id="crm-conexiones-titulo">Conexiones</h2></div>
        <p className="sec">Cada lead nuevo, cada contacto nuevo y cada cambio de etapa se envían a las conexiones activas. Activar una no envía los leads anteriores.</p>
        <ul className="crm-conexiones" aria-label="Conexiones de CRM">
          {crm.conexiones.map((c) => {
            const e = estadoClave(c);
            return (
              <li key={c.tipo}>
                <span className="crm-conexion-nombre"><b>{c.nombre}</b><span className="sec leads-linea">{e.ayuda}</span></span>
                <span className={`chip ${e.clase}`}>{e.texto}</span>
                <button type="button" role="switch" className="interruptor" aria-checked={c.activa} disabled={ocupado} aria-label={`Activar ${c.nombre}`}
                  onClick={() => void cambiar({ tipo: c.tipo, activa: !c.activa }, `${c.nombre} quedó ${c.activa ? 'desactivado' : 'activado'}.`, `No se pudo ${c.activa ? 'desactivar' : 'activar'} ${c.nombre}`)}><span aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      </section>
      <Mapeo crm={crm} ocupado={ocupado} alGuardar={(c, ok) => cambiar(c, ok, 'No se guardó el mapeo')} />
      <Webhook
        key={`${webhook.url ?? ''}|${webhook.secreto ?? ''}`} webhook={webhook} crm={crm} ocupado={ocupado}
        alGuardarUrl={(url) => cambiar({ tipo: 'webhook', url }, url ? 'Se guardó la URL del webhook.' : 'Se quitó la URL del webhook.', 'No se guardó la URL')}
        alRegenerar={() => hacer(() => api.regenerarSecretoCrm(), () => 'Se generó una clave nueva: actualízala en el receptor. La anterior ya no vale.', 'No se regeneró la clave')}
        alProbar={() => {
          setOcupado(true);
          return api.probarCrm('webhook').then(
            (r) => alAvisar(r.ok ? { tipo: 'ok', texto: `${r.mensaje}.` } : { tipo: 'error', texto: `La prueba no llegó: ${r.mensaje}` }),
            (e: unknown) => alAvisar({ tipo: 'error', texto: `No se envió la prueba: ${mensajeDe(e, 'inténtalo de nuevo')}` }),
          ).finally(() => setOcupado(false));
        }}
        alCopiar={(ok) => alAvisar(ok ? { tipo: 'ok', texto: 'Se copió la clave del webhook.' } : { tipo: 'error', texto: 'No se pudo copiar: selecciona la clave y cópiala a mano.' })}
      />
    </div>
  );
}

function Mapeo({ crm, ocupado, alGuardar }: { crm: EstadoCrm; ocupado: boolean; alGuardar: (c: CambioCrm, ok: string) => Promise<boolean> }) {
  const [tipo, setTipo] = useState<(typeof CON_MAPEO)[number]>('hubspot');
  const conexion = crm.conexiones.find((c) => c.tipo === tipo)!;
  return (
    <section className="tarjeta" aria-labelledby="crm-mapeo-titulo">
      <div className="tarjeta-cabeza"><h2 id="crm-mapeo-titulo">Mapeo de campos · {conexion.nombre}</h2></div>
      <div className="crm-selector">
        <label htmlFor="crm-mapeo-tipo">CRM</label>
        <select id="crm-mapeo-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          {CON_MAPEO.map((t) => <option key={t} value={t}>{crm.conexiones.find((c) => c.tipo === t)!.nombre}</option>)}
        </select>
      </div>
      <FormMapeo key={`${tipo}|${JSON.stringify(conexion.mapeo)}`} conexion={conexion} campos={crm.campos} ocupado={ocupado} alGuardar={alGuardar} />
      <p className="sec leads-pie">Si el CRM no recibe un lead, se reintenta 3 veces (a los 30 s, 2 min y 8 min) y queda marcado con el error. Un campo sin propiedad no se envía.</p>
    </section>
  );
}

function FormMapeo({ conexion, campos, ocupado, alGuardar }: { conexion: ConexionCrm; campos: EstadoCrm['campos']; ocupado: boolean; alGuardar: (c: CambioCrm, ok: string) => Promise<boolean> }) {
  const [mapeo, setMapeo] = useState<Record<string, string>>(conexion.mapeo ?? {});
  const guardar = (m: Record<string, string>, ok: string) => void alGuardar({ tipo: conexion.tipo, mapeo: m }, ok);
  return (
    <form aria-label={`Mapeo de campos de ${conexion.nombre}`} onSubmit={(e) => { e.preventDefault(); guardar(mapeo, `Se guardó el mapeo de ${conexion.nombre}.`); }}>
      <div className="tabla-costos">
        <table className="tabla-mapeo">
          <thead><tr><th scope="col">Campo del sitio</th><th scope="col">Propiedad en {conexion.nombre}</th></tr></thead>
          <tbody>
            {campos.map((c) => (
              <tr key={c.campo}>
                <th scope="row">{c.etiqueta}</th>
                <td>
                  <input type="text" value={mapeo[c.campo] ?? ''} readOnly={c.campo === 'correo'} aria-label={`Propiedad de ${c.etiqueta} en ${conexion.nombre}`} autoComplete="off" spellCheck={false}
                    placeholder={c.campo === 'correo' ? undefined : 'No se envía'} onChange={(e) => setMapeo((m) => ({ ...m, [c.campo]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar mapeo</button>
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar(conexion.mapeoPorDefecto ?? {}, `${conexion.nombre} volvió al mapeo de por defecto.`)}>Volver al de por defecto</button>
      </div>
    </form>
  );
}

interface PropsWebhook {
  webhook: ConexionCrm; crm: EstadoCrm; ocupado: boolean;
  alGuardarUrl: (url: string | null) => Promise<boolean>; alRegenerar: () => Promise<boolean>; alProbar: () => Promise<void>; alCopiar: (ok: boolean) => void;
}

function Webhook({ webhook, crm, ocupado, alGuardarUrl, alRegenerar, alProbar, alCopiar }: PropsWebhook) {
  const [url, setUrl] = useState(webhook.url ?? '');
  const [confirmar, setConfirmar] = useState(false);
  const secreto = webhook.secreto;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(secreto ?? '');
      alCopiar(true);
    } catch {
      alCopiar(false);
    }
  }
  return (
    <section className="tarjeta" aria-labelledby="crm-webhook-titulo">
      <div className="tarjeta-cabeza"><h2 id="crm-webhook-titulo">Webhook</h2></div>
      <p className="sec">Envía cada lead por POST en JSON a tu sistema, firmado con HMAC-SHA256.</p>
      <form className="crm-webhook-url" aria-label="Dirección del webhook" onSubmit={(e) => { e.preventDefault(); void alGuardarUrl(url.trim() || null); }}>
        <label>
          URL del webhook
          <input type="url" inputMode="url" value={url} placeholder="https://" autoComplete="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <button type="submit" className="boton" disabled={ocupado || url.trim() === (webhook.url ?? '')}>Guardar URL</button>
      </form>
      <div className="crm-clave">
        <span id="crm-clave-etiqueta" className="crm-clave-etiqueta">Clave para verificar la firma</span>
        {secreto ? <code className="seo-ruta crm-secreto">{secreto}</code> : <span className="sec">Se genera al activar el webhook o con «Regenerar».</span>}
        <div className="acciones-fila">
          <button type="button" className="boton" disabled={!secreto} onClick={() => void copiar()}>Copiar</button>
          {confirmar ? (
            <>
              <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void alRegenerar().then(() => setConfirmar(false))}>Sí, regenerar</button>
              <button type="button" className="boton" onClick={() => setConfirmar(false)}>Cancelar</button>
            </>
          ) : <button type="button" className="boton" disabled={ocupado} onClick={() => setConfirmar(true)}>Regenerar</button>}
          <button type="button" className="boton primario" disabled={ocupado || !webhook.url || !secreto} onClick={() => void alProbar()}>Enviar prueba</button>
        </div>
        {confirmar ? <p className="nota" role="status">La clave anterior deja de valer en el siguiente envío: actualízala en tu sistema.</p> : null}
      </div>
      <h3 className="crm-guia-titulo">Cómo verificar la firma</h3>
      <ol className="crm-guia">
        <li>Lee la cabecera <code>{crm.cabeceraFirma}</code>, que trae <code>t=&lt;segundos&gt;,v1=&lt;firma&gt;</code>.</li>
        <li>Calcula el HMAC-SHA256 en hexadecimal de <code>t</code>, un punto y el cuerpo tal como llegó, con esta clave, y compáralo con <code>v1</code>.</li>
        <li>Rechaza las firmas de más de {Math.round(crm.toleranciaSegundos / 60)} minutos y las entregas repetidas (cabecera <code>X-Aptio-Entrega</code>). El evento va en <code>X-Aptio-Evento</code>.</li>
      </ol>
    </section>
  );
}
