// HU-0301 · Lista de proyectos con estado, avance y costo de IA; filtros por cliente, estado y nombre (CP-029).
import { Cabecera } from '@aptio/ui';
import { ESTADOS_PROYECTO, NOMBRE_ESTADO } from '@aptio/schema/proyecto';
import { useEffect, useState } from 'react';
import { api, type Cliente, CREAN_PROYECTOS, ErrorApi, type Proyecto, type Rol } from '../api';
import { usd } from '../formato';
import { navegar } from '../ruta';

const CHIP_ESTADO: Record<string, string> = { GENERANDO: 'ia', REVISION: 'aviso', ENTREGADO: 'validado' };

export function Proyectos({ rol }: { rol: Rol }) {
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [estado, setEstado] = useState('');
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');
  const puedeCrear = CREAN_PROYECTOS.includes(rol);
  const filtrando = Boolean(clienteId || estado || buscar);

  useEffect(() => {
    api.clientes().then(setClientes, () => setClientes([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.proyectos({ clienteId, estado, buscar: buscar.trim() }).then(setProyectos, (e: unknown) =>
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los proyectos'));
    }, 200);
    return () => clearTimeout(t);
  }, [clienteId, estado, buscar]);

  const ir = (ruta: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    navegar(ruta);
  };

  return (
    <>
      <Cabecera
        titulo="Proyectos"
        subtitulo="Cada proyecto es un SCORM: se genera, se revisa, se ajusta y se entrega."
        accion={puedeCrear ? <a className="boton primario" href="/nuevo" onClick={ir('/nuevo')}>Nuevo SCORM</a> : undefined}
      />
      <div className="filtros" role="search" aria-label="Filtrar proyectos">
        <label className="campo">
          Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="campo">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Activos</option>
            {ESTADOS_PROYECTO.map((x) => <option key={x} value={x}>{NOMBRE_ESTADO[x]}</option>)}
          </select>
        </label>
        <label className="campo">
          Buscar
          <input type="search" placeholder="Nombre del proyecto" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {proyectos === null ? (
        <p className="sec" role="status">Cargando proyectos…</p>
      ) : proyectos.length === 0 ? (
        <section className="tarjeta vacio">
          <h2>{filtrando ? 'Ningún proyecto coincide' : 'Aún no hay proyectos'}</h2>
          {filtrando ? (
            <p className="sec">Prueba con otro cliente, estado o nombre.</p>
          ) : (
            <>
              <p className="sec">Crea el primero solo con el cliente y el nombre; los datos técnicos pueden esperar.</p>
              <p className="acciones-form">
                {puedeCrear ? <a className="boton primario" href="/nuevo" onClick={ir('/nuevo')}>Nuevo SCORM</a> : null}
                {!clientes.length ? <a className="boton" href="/clientes" onClick={ir('/clientes')}>Crear el primer cliente y su kit</a> : null}
              </p>
            </>
          )}
        </section>
      ) : (
        <ul className="rejilla-clientes" aria-label="Proyectos">
          {proyectos.map((p) => {
            const avance = p.avance.total ? Math.round((p.avance.aprobadas / p.avance.total) * 100) : 0;
            return (
              <li key={p.id}>
                <a className="tarjeta tarjeta-cliente" href={`/proyectos/${p.id}`} onClick={ir(`/proyectos/${p.id}`)} aria-label={p.nombre}>
                  <span className="fila-titulo">
                    <h2>{p.nombre}</h2>
                    <span className={`chip ${CHIP_ESTADO[p.estado] ?? ''}`}>{NOMBRE_ESTADO[p.estado]}</span>
                  </span>
                  <span className="sec">
                    {p.clienteNombre} · {p.pantallasObjetivo ?? '—'} pantallas · {p.idiomas.map((i) => i.toUpperCase()).join(' + ')} · {p.datosTecnicos.lms || 'LMS por definir'}
                  </span>
                  <span className="barra" role="progressbar" aria-label="Pantallas aprobadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance}>
                    <i style={{ width: `${avance}%` }} />
                  </span>
                  <span className="sec">
                    {p.avance.total ? `${p.avance.aprobadas} de ${p.avance.total} pantallas aprobadas` : 'Sin generar'} · IA {usd(p.costoIaUsd)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
