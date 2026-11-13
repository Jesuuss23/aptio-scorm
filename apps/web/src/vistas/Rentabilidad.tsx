// HU-1302 · Empresa › Rentabilidad (PNT-22): por ahora la sección «Costo de IA» con lo que registra cada llamada a un
// proveedor (CP-096): total del periodo, promedio por SCORM y desgloses por proyecto, cliente y proveedor/tarea.
// Montos en dólares hasta que HU-1303 traiga el tipo de cambio; la calculadora de rentabilidad llega con esa historia.
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, type Cliente, ErrorApi, type ResumenCostos } from '../api';
import { NOMBRE_TAREA, usd } from '../formato';
import { navegar } from '../ruta';
import { type Periodo, PERIODOS, rangoPeriodo } from './costos-periodo';

export function Rentabilidad() {
  return (
    <>
      <Cabecera titulo="Rentabilidad" subtitulo="Cuánto cuesta producir cada SCORM. Los montos de IA salen del consumo registrado en cada llamada a un proveedor." />
      <CostoIA />
    </>
  );
}

function CostoIA() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumen, setResumen] = useState<{ clave: string; datos: ResumenCostos } | null>(null);
  const [error, setError] = useState('');
  const clave = `${periodo}|${clienteId}`;

  useEffect(() => {
    api.clientes().then(setClientes, () => undefined);
  }, []);

  useEffect(() => {
    let vigente = true;
    api.costos({ ...rangoPeriodo(periodo, new Date()), clienteId: clienteId || undefined }).then(
      (datos) => { if (vigente) { setResumen({ clave: `${periodo}|${clienteId}`, datos }); setError(''); } },
      (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el costo de IA'); },
    );
    return () => { vigente = false; };
  }, [periodo, clienteId]);

  const r = resumen?.datos;
  const cargando = resumen?.clave !== clave && !error;
  const nombrePeriodo = PERIODOS.find((p) => p.valor === periodo)!.nombre.toLowerCase();
  return (
    <section className="tarjeta costos" role="region" aria-labelledby="costos-titulo">
      <div className="costos-cabecera">
        <h2 id="costos-titulo">Costo de IA</h2>
        <div className="costos-filtros">
          <div className="opciones" role="group" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button key={p.valor} type="button" className="opcion" aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>
                {p.nombre}
              </button>
            ))}
          </div>
          <label className="campo">
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {cargando ? <p className="sec" role="status">Calculando el costo de IA…</p> : null}
      {r ? (
        <div className="costos-cuerpo" aria-busy={cargando}>
          <dl className="costos-cifras" aria-label="Resumen del periodo">
            <div>
              <dt>Total del periodo</dt>
              <dd className="num">{usd(r.totalUsd)}</dd>
            </div>
            <div>
              <dt>Promedio por SCORM</dt>
              <dd className="num">{usd(r.promedioPorScormUsd)}</dd>
              <dd className="costos-nota">{r.criterioPromedio === 'exportados' ? 'Sobre los proyectos con paquete exportado' : 'Aún sin paquetes exportados: sobre los proyectos con gasto'}</dd>
            </div>
            <div>
              <dt>SCORM contados</dt>
              <dd className="num">{r.scormContados}</dd>
            </div>
          </dl>
          {r.porProveedorTarea.length === 0 ? (
            <p className="sec">No hay consumo de IA registrado en {periodo === 'todo' ? 'ningún periodo' : nombrePeriodo}{clienteId ? ' para este cliente' : ''}.</p>
          ) : (
            <>
              <div className="tabla-costos">
                <table aria-label="Por proyecto">
                  <caption>Por proyecto</caption>
                  <thead><tr><th scope="col">Proyecto</th><th scope="col">Cliente</th><th scope="col" className="d">Llamadas</th><th scope="col">Paquete</th><th scope="col" className="d">Costo</th></tr></thead>
                  <tbody>
                    {r.porProyecto.map((p) => (
                      <tr key={p.proyectoId}>
                        <td><a href={`/proyectos/${p.proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${p.proyectoId}`); }}>{p.nombre}</a></td>
                        <td>{p.cliente}</td>
                        <td className="d num">{p.llamadas}</td>
                        <td>{p.exportado ? <span className="chip validado">Exportado</span> : <span className="chip">Sin exportar</span>}</td>
                        <td className="d num">{usd(p.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tabla-costos">
                <table aria-label="Por cliente">
                  <caption>Por cliente</caption>
                  <thead><tr><th scope="col">Cliente</th><th scope="col" className="d">Proyectos</th><th scope="col" className="d">Sin proyecto</th><th scope="col" className="d">Total</th></tr></thead>
                  <tbody>
                    {r.porCliente.map((c) => (
                      <tr key={c.clienteId}>
                        <td>{c.nombre}</td>
                        <td className="d num">{usd(c.proyectosUsd)}</td>
                        <td className="d num">{usd(c.sinProyectoUsd)}</td>
                        <td className="d num">{usd(c.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="sec">«Sin proyecto» es lo que se hizo para el cliente fuera de un proyecto, como la propuesta del kit desde un curso anterior.</p>
              </div>
              <div className="tabla-costos">
                <table aria-label="Por proveedor y tarea">
                  <caption>Por proveedor y tarea</caption>
                  <thead><tr><th scope="col">Proveedor</th><th scope="col">Tarea</th><th scope="col" className="d">Llamadas</th><th scope="col" className="d">Costo</th></tr></thead>
                  <tbody>
                    {r.porProveedorTarea.map((f) => (
                      <tr key={`${f.proveedor}|${f.tarea}`}>
                        <td>{f.proveedor}</td>
                        <td>{NOMBRE_TAREA[f.tarea] ? <>{NOMBRE_TAREA[f.tarea]} <span className="sec">{f.tarea}</span></> : f.tarea}</td>
                        <td className="d num">{f.llamadas}</td>
                        <td className="d num">{usd(f.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="sec">Montos en dólares, como los cobra cada proveedor.</p>
        </div>
      ) : null}
    </section>
  );
}
