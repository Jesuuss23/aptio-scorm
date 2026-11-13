// HU-1403 · Empresa › Operación (M15, observabilidad mínima): errores por proveedor en 24 h y 7 días, colas pendientes,
// tiempo y costo por etapa (30 días) y las copias de seguridad de 14 días con «Respaldar ahora». Solo administración.
import { Cabecera } from '@aptio/ui';
import { nombreProveedor } from '@aptio/schema/operacion';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Operacion } from '../api';
import { usd } from '../formato';
import { bytes, duracion, ESTADO_RESPALDO, fechaLima } from './operacion';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);

export function OperacionVista() {
  const [datos, setDatos] = useState<Operacion | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [errorRespaldo, setErrorRespaldo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    api.operacion().then((d) => {
      setDatos(d);
      setError('');
    }, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar la operación')));
  }, [vuelta]);

  async function respaldar() {
    setOcupado(true);
    setAviso('');
    setErrorRespaldo('');
    try {
      await api.respaldar();
      setAviso('Copia de seguridad en cola: aparece aquí en unos minutos.');
      setVuelta((v) => v + 1);
    } catch (e) {
      setErrorRespaldo(mensajeDe(e, 'No se pudo pedir la copia de seguridad'));
    } finally {
      setOcupado(false);
    }
  }

  const accion = <button type="button" className="boton" onClick={() => setVuelta((v) => v + 1)}>Actualizar</button>;
  return (
    <>
      <Cabecera titulo="Operación" subtitulo="Errores por proveedor, colas, tiempo y costo por etapa, y las copias de seguridad diarias." accion={accion} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!datos ? (!error ? <p className="sec" role="status">Cargando la operación…</p> : null) : (
        <div className="operacion">
          <section className="tarjeta" aria-labelledby="op-errores">
            <h2 id="op-errores">Errores por proveedor</h2>
            <p className="sec">Últimas 24 horas y últimos 7 días (desde el {fechaLima(datos.errores.desde7d)}). Lo detenido por el límite de gasto no cuenta como error.</p>
            {datos.errores.porProveedor.length === 0 ? <p className="nota">Sin trabajos en los últimos 7 días.</p> : (
              <div className="tabla-costos">
                <table aria-label="Errores por proveedor">
                  <thead>
                    <tr>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="d">Últimas 24 h</th>
                      <th scope="col" className="d">7 días</th>
                      <th scope="col" className="d">Trabajos en 7 días</th>
                      <th scope="col">Último error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.errores.porProveedor.map((f) => (
                      <tr key={f.proveedor}>
                        <th scope="row">{nombreProveedor(f.proveedor)}</th>
                        <td className={`d num${f.errores24h ? ' con-error' : ''}`}>{f.errores24h}</td>
                        <td className={`d num${f.errores7d ? ' con-error' : ''}`}>{f.errores7d}</td>
                        <td className="d num">{f.trabajos7d}</td>
                        <td>
                          {f.ultimoError ? <><span className="sec">{fechaLima(f.ultimoError.en)}</span> {f.ultimoError.mensaje}</> : <span className="sec">—</span>}
                          {f.detenidosPorLimite7d ? <span className="chip aviso">{f.detenidosPorLimite7d} detenidos por el límite</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tarjeta" aria-labelledby="op-colas">
            <h2 id="op-colas">Colas</h2>
            {datos.colas === null ? <div className="nota error" role="alert">Las colas no responden: revisa que Redis y el worker estén en marcha.</div> : (
              <div className="tabla-costos">
                <table aria-label="Colas de trabajo">
                  <thead>
                    <tr><th scope="col">Cola</th><th scope="col" className="d">Pendientes</th><th scope="col" className="d">En curso</th><th scope="col" className="d">Fallidos</th></tr>
                  </thead>
                  <tbody>
                    {datos.colas.map((c) => (
                      <tr key={c.nombre}>
                        <th scope="row">{c.nombre}</th>
                        <td className="d num">{c.pendientes}</td>
                        <td className="d num">{c.activos}</td>
                        <td className={`d num${c.fallidos ? ' con-error' : ''}`}>{c.fallidos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tarjeta" aria-labelledby="op-etapas">
            <h2 id="op-etapas">Tiempo y costo por etapa</h2>
            <p className="sec">Generaciones de los últimos 30 días (desde el {fechaLima(datos.etapas.desde)}), solo las etapas que terminaron bien.</p>
            <div className="tabla-costos">
              <table aria-label="Tiempo y costo por etapa">
                <thead>
                  <tr>
                    <th scope="col">Etapa</th><th scope="col" className="d">Veces</th><th scope="col" className="d">Tiempo promedio</th>
                    <th scope="col" className="d">Costo promedio</th><th scope="col" className="d">Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.etapas.porEtapa.map((e, i) => (
                    <tr key={e.etapa}>
                      <th scope="row"><span className="num sec">{String(i + 1).padStart(2, '0')}</span> {e.nombre}</th>
                      <td className="d num">{e.ejecuciones}</td>
                      <td className="d num">{duracion(e.duracionPromedioMs)}</td>
                      <td className="d num">{e.ejecuciones ? usd(e.costoPromedioUsd) : '—'}</td>
                      <td className="d num">{usd(e.costoTotalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tarjeta" aria-labelledby="op-respaldos">
            <div className="fila-titulo">
              <h2 id="op-respaldos">Copias de seguridad</h2>
              <button type="button" className="boton primario" disabled={ocupado || datos.respaldos.enCurso} onClick={() => void respaldar()}>
                {ocupado ? 'Pidiendo…' : 'Respaldar ahora'}
              </button>
            </div>
            <p className="sec">
              Base de datos y archivos, todos los días a las 03:00 (hora de Lima). Se guardan {datos.respaldos.retencionDias} días.{' '}
              {datos.respaldos.ultimoExitoso ? <>Última copia exitosa: <b>{fechaLima(datos.respaldos.ultimoExitoso)}</b>.</> : <b>Todavía no hay una copia exitosa.</b>}
            </p>
            {errorRespaldo ? <div className="nota error" role="alert">{errorRespaldo}</div> : null}
            <p className="sec" role="status">{aviso}</p>
            {datos.respaldos.lista.length === 0 ? <p className="nota">Sin copias en los últimos {datos.respaldos.retencionDias} días.</p> : (
              <div className="tabla-costos">
                <table aria-label="Copias de seguridad">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Origen</th>
                      <th scope="col" className="d">Tamaño</th><th scope="col" className="d">Duración</th><th scope="col" className="d">Archivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.respaldos.lista.map((r) => (
                      <tr key={r.id}>
                        <th scope="row">{fechaLima(r.fecha)}</th>
                        <td>
                          <span className={`chip ${ESTADO_RESPALDO[r.estado].chip}`}>{ESTADO_RESPALDO[r.estado].texto}</span>
                          {r.error ? <span className="ayuda error"> {r.error}</span> : null}
                        </td>
                        <td>{r.origen === 'manual' ? 'Manual' : 'Programada'}</td>
                        <td className="d num">{bytes(r.tamanoBytes)}</td>
                        <td className="d num">{duracion(r.duracionMs)}</td>
                        <td className="d num">{r.objetos ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
