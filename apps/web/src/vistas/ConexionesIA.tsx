// HU-1304 · Empresa › Conexiones IA (PNT-23): por cada tarea de la lista cerrada, proveedor y modelo (Azure
// «próximamente»; Imagen, Boca y Transcripción fijos), clave «Sí/No» (nunca la clave, RN-13-3), costo estimado por
// SCORM, gasto del mes de Lima y límite mensual editable, con «Probar». El cambio aplica al siguiente trabajo (CP-099)
// y el aviso arriba lista las tareas que llegaron a su límite (CP-100).
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, type ConexionIA, type ConexionesIA as Resumen, ErrorApi, type PruebaConexion } from '../api';
import { usd } from '../formato';
import { leerLimite } from './conexiones-ia';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);

export function ConexionesIA({ alCambiar }: { alCambiar?: () => void }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.conexionesIA().then(setResumen, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las conexiones')));
  }, []);

  const actualizar = (c: ConexionIA) => {
    setResumen((r) => {
      if (!r) return r;
      const conexiones = r.conexiones.map((x) => (x.tarea === c.tarea ? c : x));
      const limites = conexiones.flatMap((x) => (x.limiteGastoMensualUsd === null ? [] : [x.limiteGastoMensualUsd]));
      return { ...r, conexiones, limiteTotalUsd: limites.length ? limites.reduce((a, b) => a + b, 0) : null };
    });
    alCambiar?.();
  };

  const alTope = resumen?.conexiones.filter((c) => c.limiteAlcanzado) ?? [];
  return (
    <>
      <Cabecera
        titulo="Conexiones IA"
        subtitulo="Las IA que ya usas, trabajando juntas por API y pagadas por uso. Cambia de proveedor en cada tarea sin rehacer nada: aplica a lo próximo que se genere."
      />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {alTope.length ? (
        <div className="nota error" role="alert">
          <b>{alTope.length === 1 ? 'Una tarea llegó a su límite de gasto del mes' : `${alTope.length} tareas llegaron a su límite de gasto del mes`}:</b>{' '}
          {alTope.map((c) => c.nombre).join(', ')}. Sus trabajos se detienen antes de llamar al proveedor; sube el límite y continúa la generación en Producción.
        </div>
      ) : null}
      {resumen?.modo === 'simulado' ? (
        <div className="nota aviso" role="status">Modo simulado: «Probar» y las generaciones no llaman a ningún proveedor ni cuestan.</div>
      ) : null}
      {!resumen ? (!error ? <p className="sec" role="status">Cargando las conexiones…</p> : null) : (
        <section className="tarjeta conexiones" aria-labelledby="conexiones-titulo">
          <h2 id="conexiones-titulo">Proveedor por tarea · gasto de {nombreMes(resumen.mes)}</h2>
          <div className="tabla-costos">
            <table aria-label="Conexiones por tarea">
              <caption>Conexiones por tarea</caption>
              <thead>
                <tr>
                  <th scope="col">Tarea</th>
                  <th scope="col">Proveedor y modelo</th>
                  <th scope="col">Clave</th>
                  <th scope="col" className="d">Costo estimado por SCORM</th>
                  <th scope="col" className="d">Gasto del mes</th>
                  <th scope="col">Límite mensual (US$)</th>
                  <th scope="col"><span className="sr">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {resumen.conexiones.map((c) => <Fila key={`${c.tarea}-${c.actualizadoEn ?? ''}`} c={c} alGuardar={actualizar} />)}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>Total estimado por SCORM de 30 pantallas, ES + EN</th>
                  <td className="d num">{usd(resumen.conexiones.reduce((n, c) => n + c.costoEstimadoScormUsd, 0))}</td>
                  <td className="d num">{usd(resumen.gastoMesUsd)}</td>
                  <td colSpan={2} className="num">{resumen.limiteTotalUsd === null ? 'Sin límites' : `Suma de límites: ${usd(resumen.limiteTotalUsd)}`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="nota aviso">
            Los costos por SCORM son estimaciones para decidir; se confirman en el piloto con el consumo real de cada API. Las claves viven en las variables de entorno del servidor: aquí solo se ve si existen.
          </div>
        </section>
      )}
    </>
  );
}

function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, 15)).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function Fila({ c, alGuardar }: { c: ConexionIA; alGuardar: (c: ConexionIA) => void }) {
  const [proveedor, setProveedor] = useState(c.proveedor);
  const [modelo, setModelo] = useState(c.modelo);
  const [vozEs, setVozEs] = useState(c.voces?.es ?? '');
  const [vozEn, setVozEn] = useState(c.voces?.en ?? '');
  const [limite, setLimite] = useState(c.limiteGastoMensualUsd === null ? '' : String(c.limiteGastoMensualUsd));
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'prueba'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const leido = leerLimite(limite);
  const cambio = proveedor !== c.proveedor || modelo !== c.modelo || vozEs !== (c.voces?.es ?? '') || vozEn !== (c.voces?.en ?? '')
    || !('valor' in leido) || leido.valor !== c.limiteGastoMensualUsd;

  async function guardar() {
    if (!('valor' in leido)) {
      setEstado({ tipo: 'error', texto: leido.error });
      return;
    }
    setOcupado(true);
    setEstado(null);
    try {
      const guardada = await api.guardarConexionIA(c.tarea, {
        ...(proveedor !== c.proveedor ? { proveedor } : {}),
        ...(c.modelos.length && modelo !== c.modelo ? { modelo } : {}),
        ...(c.voces ? { voces: { ...(vozEs.trim() ? { es: vozEs.trim() } : {}), ...(vozEn.trim() ? { en: vozEn.trim() } : {}) } } : {}),
        limiteGastoMensualUsd: leido.valor,
      });
      alGuardar(guardada);
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDe(e, 'No se pudo guardar la conexión') });
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setEstado(null);
    try {
      const r: PruebaConexion = await api.probarConexionIA(c.tarea);
      setEstado({ tipo: r.ok ? 'ok' : 'error', texto: `${r.ok ? '✓' : '✗'} ${r.mensaje} · ${r.latenciaMs} ms` });
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDe(e, 'No se pudo probar la conexión') });
    } finally {
      setOcupado(false);
    }
  }

  const nombreProveedor = c.opciones.find((o) => o.proveedor === proveedor)?.nombre ?? proveedor;
  return (
    <tr className={c.limiteAlcanzado ? 'al-tope' : undefined}>
      <th scope="row">
        {c.nombre}
        {c.limiteAlcanzado ? <span className="chip error">Al límite</span> : null}
      </th>
      <td>
        <div className="conexion-campos">
          {c.fijo ? (
            <span>{nombreProveedor}</span>
          ) : (
            <select aria-label={`Proveedor para ${c.nombre}`} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
              {c.opciones.map((o) => (
                <option key={o.proveedor} value={o.proveedor} disabled={o.proximamente}>{o.nombre}{o.proximamente ? ' (próximamente)' : ''}</option>
              ))}
            </select>
          )}
          {c.modelos.length ? (
            <select aria-label={`Modelo para ${c.nombre}`} value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {c.modelos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : c.voces ? (
            <>
              <input aria-label={`Voz en español para ${c.nombre}`} placeholder={proveedor === 'elevenlabs' ? 'voice_id en español' : 'Voz del kit'} value={vozEs} onChange={(e) => setVozEs(e.target.value)} />
              <input aria-label={`Voz en inglés para ${c.nombre}`} placeholder={proveedor === 'elevenlabs' ? 'voice_id en inglés' : 'Voz del kit'} value={vozEn} onChange={(e) => setVozEn(e.target.value)} />
            </>
          ) : null}
        </div>
      </td>
      <td>{c.claveConfigurada ? <span className="chip validado">Sí</span> : <span className="chip aviso">No</span>}</td>
      <td className="d num">{usd(c.costoEstimadoScormUsd)}</td>
      <td className="d num">{usd(c.gastoMesUsd)}</td>
      <td>
        <input
          className="limite" inputMode="decimal" aria-label={`Límite mensual en US$ para ${c.nombre}`} placeholder="Sin límite"
          aria-invalid={!('valor' in leido) || undefined} value={limite} onChange={(e) => setLimite(e.target.value)}
        />
      </td>
      <td>
        <div className="conexion-acciones">
          <button type="button" className="boton primario chico" disabled={ocupado || !cambio} onClick={() => void guardar()} aria-label={`Guardar ${c.nombre}`}>Guardar</button>
          <button type="button" className="boton chico" disabled={ocupado} onClick={() => void probar()} aria-label={`Probar ${c.nombre}`}>Probar</button>
        </div>
        <p className={`conexion-estado ${estado?.tipo ?? ''}`} role="status">{estado?.texto ?? ''}</p>
      </td>
    </tr>
  );
}
