// HU-1406 · CP-106 · «Créditos y licencias» en Entrega (PNT-13): los recursos generados del curso con su proveedor,
// modelo y licencia (REQ-062), y el texto de los créditos tal como saldrá en el paquete (CP-107). Al abrir un recurso se
// pide su ficha a la API (`GET /recursos/{id}`, que respeta el alcance del revisor del cliente).
import { useEffect, useRef, useState } from 'react';
import { api, type Creditos, ErrorApi, type Recurso } from '../api';
import { esDeIa, NOMBRE_TIPO_RECURSO, recursosDelCurso } from './entrega';

interface Props {
  proyectoId: string;
  documento: Record<string, unknown>;
  /** undefined: todavía se valida (o el rol no valida); null: ningún recurso es de IA. */
  creditos: Creditos | null | undefined;
  /** El revisor del cliente no valida: no ve la vista previa de los créditos. */
  conVistaPrevia: boolean;
}

export function CreditosLicencias({ proyectoId, documento, creditos, conVistaPrevia }: Props) {
  const [recursos, setRecursos] = useState<Recurso[] | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Recurso | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let vigente = true;
    api.recursosGenerados(proyectoId).then(
      (r) => { if (vigente) setRecursos(r); },
      (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los recursos'); },
    );
    return () => { vigente = false; };
  }, [proyectoId]);

  const abrir = async (id: string) => {
    try {
      setAbierto(await api.recurso(id));
      dialogo.current?.showModal();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo abrir el recurso');
    }
  };
  const lista = recursos ? recursosDelCurso(documento, recursos) : null;

  return (
    <section className="tarjeta kit-bloque creditos-licencias" aria-label="Créditos y licencias">
      <h2>Créditos y licencias</h2>
      <p className="sec">Cada recurso generado guarda con qué proveedor, modelo y licencia se hizo. El paquete muestra en «Créditos» lo que se generó con IA.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {conVistaPrevia ? (
        creditos === undefined ? <p className="sec" role="status">Preparando los créditos…</p> : creditos ? (
          <div className="nota creditos-vista" role="group" aria-label="Así saldrán los créditos">
            <p className="sec">Así saldrán los créditos en el paquete:</p>
            <p className="creditos-aviso"><b>{creditos.aviso}</b></p>
            <table aria-label="Recursos generados con IA">
              <thead><tr><th scope="col">Qué</th><th scope="col">Proveedor</th><th scope="col">Modelo</th><th scope="col">Licencia</th></tr></thead>
              <tbody>{creditos.filas.map((f) => <tr key={`${f.que}|${f.proveedor}|${f.modelo}|${f.licencia}`}><th scope="row">{f.que}</th><td>{f.proveedor}</td><td>{f.modelo}</td><td>{f.licencia}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="nota">Ningún recurso del curso se generó con IA: el paquete no lleva créditos.</p>
      ) : null}
      {lista === null ? (error ? null : <p className="sec" role="status">Cargando recursos…</p>) : lista.length ? (
        <div className="tabla-entrega">
          <table aria-label="Recursos generados del curso">
            <thead><tr><th scope="col">Recurso</th><th scope="col">Tipo</th><th scope="col">Proveedor</th><th scope="col">Licencia</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} data-recurso={r.id}>
                  <td>{r.nombre}</td>
                  <td>{NOMBRE_TIPO_RECURSO[r.tipo] ?? r.tipo}</td>
                  <td>{r.proveedor ?? '—'}</td>
                  <td>{r.licencia ?? '—'}</td>
                  <td><button className="boton" type="button" onClick={() => void abrir(r.id)} aria-label={`Abrir ${r.nombre}`}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="sec">El curso todavía no tiene recursos generados.</p>}
      <dialog ref={dialogo} className="confirmar-exportar dialogo-recurso" aria-labelledby="dialogo-recurso-titulo" onClose={() => setAbierto(null)}>
        {abierto ? (
          <>
            <h2 id="dialogo-recurso-titulo">{abierto.nombre}</h2>
            <dl className="ficha-recurso">
              <dt>Tipo</dt><dd>{NOMBRE_TIPO_RECURSO[abierto.tipo] ?? abierto.tipo}</dd>
              <dt>Proveedor</dt><dd>{abierto.proveedor ?? '—'}</dd>
              <dt>Modelo</dt><dd>{abierto.modelo ?? '—'}</dd>
              <dt>Licencia</dt><dd>{abierto.licencia ?? '—'}</dd>
              <dt>En los créditos</dt><dd>{esDeIa(abierto) ? 'Sí: se generó con IA' : 'No: lo armó la plataforma, sin IA'}</dd>
            </dl>
            <div className="acciones-form">
              {abierto.url ? <a className="boton" href={abierto.url} target="_blank" rel="noreferrer">Ver archivo</a> : null}
              <button className="boton primario" type="button" autoFocus onClick={() => dialogo.current?.close()}>Cerrar</button>
            </div>
          </>
        ) : null}
      </dialog>
    </section>
  );
}
