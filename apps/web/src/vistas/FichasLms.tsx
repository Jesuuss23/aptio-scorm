// HU-1204 · Fichas de compatibilidad LMS del cliente (CP-094): qué LMS usa, su versión, su límite de subida y el informe
// del modo diagnóstico del paquete, pegado tal cual. El límite de la ficha más nueva es el que usa la validación (HU-1201).
// El informe es un dato del soporte: se guarda y se resume, nunca se ejecuta ni se muestra como HTML.
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ErrorApi, EXPORTAN, type FichaCompatibilidad, type FichaCompatibilidadEntrada, type Rol } from '../api';
import { leerInforme, resumenInforme } from './fichas';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

export function FichasLms({ clienteId, rol }: { clienteId: string; rol: Rol }) {
  const puedeCrear = EXPORTAN.includes(rol);
  const [fichas, setFichas] = useState<FichaCompatibilidad[] | null>(null);
  const [error, setError] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  // El formulario solo existe con el diálogo abierto: así empieza vacío cada vez y sus campos no se cruzan con los del cliente.
  const [abierto, setAbierto] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (abierto && !dialogo.current?.open) dialogo.current?.showModal();
  }, [abierto]);

  useEffect(() => {
    api.fichasLms(clienteId).then(setFichas, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las fichas'));
  }, [clienteId]);

  function abrir() {
    setErrorForm('');
    setAviso('');
    setAbierto(true);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const { informe, error: errorInforme } = leerInforme(String(d.get('informe') ?? ''));
    if (errorInforme) {
      setErrorForm(errorInforme);
      return;
    }
    const limite = String(d.get('limite') ?? '').trim();
    const datos: FichaCompatibilidadEntrada = { lmsNombre: String(d.get('lms') ?? '').trim() };
    const version = String(d.get('version') ?? '').trim();
    const notas = String(d.get('notas') ?? '').trim();
    if (version) datos.lmsVersion = version;
    if (limite) datos.limiteSubidaMb = Number(limite);
    if (notas) datos.notas = notas;
    if (informe) datos.resultadoDiagnostico = informe;
    setGuardando(true);
    setErrorForm('');
    try {
      const f = await api.crearFichaLms(clienteId, datos);
      setFichas((l) => [f, ...(l ?? [])]);
      dialogo.current?.close();
      setAviso(`Ficha de ${f.lmsNombre} guardada`);
    } catch (err) {
      setErrorForm(err instanceof ErrorApi ? err.message : 'No se pudo guardar la ficha');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta kit" aria-label="Fichas de compatibilidad LMS">
      <div className="fichas-cabecera">
        <h2>Fichas de compatibilidad LMS</h2>
        {puedeCrear ? <button className="boton" type="button" onClick={abrir}>Nueva ficha</button> : null}
      </div>
      <p className="sec">Lo que se sabe del LMS del cliente. El límite de subida de la ficha más nueva es el que usa la verificación antes de exportar.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
      {fichas === null && !error ? <p className="sec" role="status">Cargando…</p> : null}
      {fichas && !fichas.length ? <p className="sec">Todavía no hay fichas. Cuando el cliente pruebe un paquete, pega aquí el informe del modo diagnóstico.</p> : null}
      {fichas?.length ? (
        <div className="tabla-entrega">
          <table aria-label="Fichas de compatibilidad">
            <thead>
              <tr><th scope="col">LMS</th><th scope="col">Versión</th><th scope="col">Límite de subida</th><th scope="col">Diagnóstico</th><th scope="col">Fecha</th></tr>
            </thead>
            <tbody>
              {fichas.map((f) => (
                <tr key={f.id} data-ficha={f.id}>
                  <td>
                    {f.lmsNombre}
                    {f.notas ? <div className="sec">{f.notas}</div> : null}
                  </td>
                  <td>{f.lmsVersion ?? '—'}</td>
                  <td>{f.limiteSubidaMb === null ? '—' : `${f.limiteSubidaMb} MB`}</td>
                  <td>{resumenInforme(f.resultadoDiagnostico)}</td>
                  <td>{fecha(f.actualizadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {puedeCrear ? (
        <dialog ref={dialogo} className="confirmar-exportar dialogo-ficha" aria-labelledby="ficha-titulo" onClose={() => setAbierto(false)}>
          {abierto ? <form className="formulario" onSubmit={guardar} aria-label="Nueva ficha de compatibilidad">
            <h2 id="ficha-titulo">Nueva ficha de compatibilidad</h2>
            {errorForm ? <div className="nota error" role="alert">{errorForm}</div> : null}
            <label className="campo">
              LMS
              <input name="lms" required minLength={2} maxLength={80} placeholder="Moodle, Blackboard, Chamilo, Canvas…" />
            </label>
            <label className="campo">
              Versión
              <input name="version" maxLength={40} placeholder="4.5" />
            </label>
            <label className="campo">
              Límite de subida (MB)
              <input name="limite" type="number" min={1} max={100000} step={1} />
            </label>
            <label className="campo">
              Notas
              <textarea name="notas" rows={2} maxLength={2000} />
            </label>
            <label className="campo">
              Informe del modo diagnóstico (JSON)
              <textarea name="informe" rows={6} className="informe-diagnostico" spellCheck={false} placeholder="Pega aquí lo que copió «Copiar informe»" />
            </label>
            <div className="acciones-form">
              <button className="boton" type="button" onClick={() => dialogo.current?.close()}>Cancelar</button>
              <button className="boton primario" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ficha'}</button>
            </div>
          </form> : null}
        </dialog>
      ) : null}
    </section>
  );
}
