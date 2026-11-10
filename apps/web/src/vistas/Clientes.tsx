// M02 · Lista y alta de clientes (HU-0201). El kit de marca se configura desde el detalle del cliente.
import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type Cliente, EDITAN_CLIENTES, ErrorApi, OPCIONES_LMS, type Rol } from '../api';
import { navegar } from '../ruta';

export function Clientes({ rol }: { rol: Rol }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const puedeCrear = EDITAN_CLIENTES.includes(rol);

  useEffect(() => {
    const t = setTimeout(() => {
      api.clientes(buscar).then(setClientes, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
    }, 200);
    return () => clearTimeout(t);
  }, [buscar]);

  return (
    <>
      <Cabecera
        titulo="Clientes y kits"
        subtitulo="Cada cliente tiene su kit de marca, su glosario y sus proyectos."
        accion={
          puedeCrear && !creando ? (
            <button type="button" className="boton primario" onClick={() => setCreando(true)}>
              Nuevo cliente
            </button>
          ) : undefined
        }
      />
      {creando ? (
        <NuevoCliente
          alCancelar={() => setCreando(false)}
          alCrear={(c) => {
            setCreando(false);
            setClientes((lista) => [...(lista ?? []), c].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
          }}
        />
      ) : null}
      <label className="campo buscador">
        Buscar
        <input type="search" placeholder="Nombre del cliente" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </label>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {clientes === null ? (
        <p className="sec" role="status">Cargando clientes…</p>
      ) : clientes.length === 0 ? (
        <section className="tarjeta vacio">
          <h2>{buscar ? 'Ningún cliente coincide' : 'Aún no hay clientes'}</h2>
          <p className="sec">{buscar ? 'Prueba con otra parte del nombre.' : 'Registra el primero solo con su nombre; lo demás puede esperar.'}</p>
        </section>
      ) : (
        <ul className="rejilla-clientes" aria-label="Clientes">
          {clientes.map((c) => (
            <li key={c.id}>
              <a
                className="tarjeta tarjeta-cliente"
                href={`/clientes/${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navegar(`/clientes/${c.id}`);
                }}
              >
                <h2>{c.nombre}</h2>
                <span className="sec">{c.lmsHabitual ?? 'LMS por definir'}</span>
                <span className="fila-chips">
                  {c.idiomas.map((i) => (
                    <span key={i} className="chip">{i.toUpperCase()}</span>
                  ))}
                  {c.tieneKit ? <span className="chip validado">Kit listo</span> : <span className="chip aviso">Sin kit</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NuevoCliente({ alCrear, alCancelar }: { alCrear: (c: Cliente) => void; alCancelar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [lms, setLms] = useState('');
  const [ingles, setIngles] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      alCrear(await api.crearCliente({ nombre, ...(lms ? { lmsHabitual: lms } : {}), idiomas: ingles ? ['es', 'en'] : ['es'] }));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo crear el cliente');
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta formulario" onSubmit={enviar} aria-label="Nuevo cliente">
      <h2>Nuevo cliente</h2>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <label className="campo">
        Nombre
        <input autoFocus required minLength={2} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="campo">
        LMS habitual (opcional)
        <select value={lms} onChange={(e) => setLms(e.target.value)}>
          <option value="">Aún no se sabe</option>
          {OPCIONES_LMS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label className="casilla">
        <input type="checkbox" checked={ingles} onChange={(e) => setIngles(e.target.checked)} /> También en inglés
      </label>
      <div className="acciones-form">
        <button className="boton primario" type="submit" disabled={enviando || nombre.trim().length < 2}>
          {enviando ? 'Creando…' : 'Crear cliente'}
        </button>
        <button className="boton" type="button" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
