// HU-0205 · Glosario y pronunciación del cliente: términos que no se traducen y cómo los dice la voz (CP-027).
import { useEffect, useState } from 'react';
import { api, EDITAN_GLOSARIO, ErrorApi, type MuestraVoz, type Rol, type TerminoGlosario, type TerminoPronunciacion } from '../api';

const NOMBRE_IDIOMA = { es: 'Español', en: 'Inglés' } as const;

function mensajes(e: unknown, porDefecto: string): string[] {
  if (e instanceof ErrorApi && e.detalles.length) return e.detalles.map((d) => String(d.error ?? d.mensaje ?? ''));
  return [e instanceof ErrorApi ? e.message : porDefecto];
}

function Errores({ lista }: { lista: string[] }) {
  if (!lista.length) return null;
  return (
    <div className="nota error" role="alert">
      <ul>{lista.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

export function Glosario({ clienteId, rol, conIngles }: { clienteId: string; rol: Rol; conIngles: boolean }) {
  const puedeEditar = EDITAN_GLOSARIO.includes(rol);
  return (
    <section className="tarjeta kit" aria-label="Glosario y pronunciación">
      <h2>Glosario y pronunciación</h2>
      <div className="kit-columnas">
        <Pronunciacion clienteId={clienteId} puedeEditar={puedeEditar} conIngles={conIngles} />
        <TerminosGlosario clienteId={clienteId} puedeEditar={puedeEditar} />
      </div>
    </section>
  );
}

/** Diccionario de pronunciación y muestra de voz con el diccionario guardado. */
function Pronunciacion({ clienteId, puedeEditar, conIngles }: { clienteId: string; puedeEditar: boolean; conIngles: boolean }) {
  const [guardados, setGuardados] = useState<TerminoPronunciacion[] | null>(null);
  const [filas, setFilas] = useState<TerminoPronunciacion[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [frase, setFrase] = useState('');
  const [idiomaMuestra, setIdiomaMuestra] = useState<'es' | 'en'>('es');
  const [muestra, setMuestra] = useState<MuestraVoz | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const idiomas: ('es' | 'en')[] = conIngles ? ['es', 'en'] : ['es'];

  useEffect(() => {
    api.pronunciacion(clienteId).then(
      (l) => {
        setGuardados(l);
        setFilas(l);
      },
      (e: unknown) => setErrores(mensajes(e, 'No se pudo cargar el diccionario')),
    );
  }, [clienteId]);

  const cambiado = JSON.stringify(filas) !== JSON.stringify(guardados ?? []);
  const fila = (i: number, cambio: Partial<TerminoPronunciacion>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  async function guardar() {
    setGuardando(true);
    setErrores([]);
    setAviso('');
    try {
      const l = await api.guardarPronunciacion(clienteId, filas.filter((f) => f.escrito.trim() || f.pronunciado.trim()));
      setGuardados(l);
      setFilas(l);
      setAviso('Diccionario guardado. Las narraciones que usan estos términos quedan por regenerar.');
    } catch (e) {
      setErrores(mensajes(e, 'No se pudo guardar el diccionario'));
    }
    setGuardando(false);
  }

  async function escuchar() {
    setEscuchando(true);
    setErrores([]);
    try {
      setMuestra(await api.muestraVoz({ texto: frase, idioma: idiomaMuestra, clienteId }));
    } catch (e) {
      setMuestra(null);
      setErrores(mensajes(e, 'No se pudo generar la muestra'));
    }
    setEscuchando(false);
  }

  return (
    <section className="kit-bloque glosario-bloque" aria-label="Pronunciación">
      <h3>Pronunciación</h3>
      <p className="sec">Cómo dice la voz las siglas y nombres propios del cliente. Se aplica a toda narración nueva.</p>
      <Errores lista={errores} />
      {aviso ? <div className="nota" role="status">{aviso}</div> : null}
      {guardados === null ? <p className="sec">Cargando…</p> : (
        <div className="tabla-terminos">
          <table>
            <thead>
              <tr><th>Idioma</th><th>Se escribe</th><th>Se pronuncia</th>{puedeEditar ? <th><span className="sr">Acciones</span></th> : null}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>
                    {puedeEditar && idiomas.length > 1 ? (
                      <select value={f.idioma} aria-label={`Idioma de la fila ${i + 1}`} onChange={(e) => fila(i, { idioma: e.target.value as 'es' | 'en' })}>
                        {idiomas.map((x) => <option key={x} value={x}>{NOMBRE_IDIOMA[x]}</option>)}
                      </select>
                    ) : NOMBRE_IDIOMA[f.idioma]}
                  </td>
                  <td>{puedeEditar ? <input value={f.escrito} aria-label={`Se escribe, fila ${i + 1}`} onChange={(e) => fila(i, { escrito: e.target.value })} /> : f.escrito}</td>
                  <td>{puedeEditar ? <input value={f.pronunciado} aria-label={`Se pronuncia, fila ${i + 1}`} onChange={(e) => fila(i, { pronunciado: e.target.value })} /> : f.pronunciado}</td>
                  {puedeEditar ? (
                    <td><button className="boton" type="button" aria-label={`Quitar fila ${i + 1}`} onClick={() => setFilas(filas.filter((_, j) => j !== i))}>Quitar</button></td>
                  ) : null}
                </tr>
              ))}
              {!filas.length ? <tr><td colSpan={4} className="sec">Sin términos todavía.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      {puedeEditar && guardados !== null ? (
        <div className="acciones-form">
          <button className="boton" type="button" onClick={() => setFilas([...filas, { idioma: 'es', escrito: '', pronunciado: '' }])}>Agregar término</button>
          <button className="boton primario" type="button" disabled={guardando || !cambiado} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar pronunciación'}
          </button>
        </div>
      ) : null}

      <div className="kit-fila muestra-voz">
        <label className="campo">
          Frase de prueba
          <input value={frase} maxLength={600} placeholder="Aplica el LOTO antes de abrir el tablero." onChange={(e) => setFrase(e.target.value)} />
        </label>
        {idiomas.length > 1 ? (
          <label className="campo">
            Idioma
            <select value={idiomaMuestra} onChange={(e) => setIdiomaMuestra(e.target.value as 'es' | 'en')}>
              {idiomas.map((x) => <option key={x} value={x}>{NOMBRE_IDIOMA[x]}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="acciones-form">
        <button className="boton" type="button" disabled={escuchando || !frase.trim()} onClick={() => void escuchar()}>
          {escuchando ? 'Generando…' : 'Escuchar muestra'}
        </button>
        {cambiado ? <span className="sec">La muestra usa el diccionario guardado: guarda tus cambios para escucharlos.</span> : null}
      </div>
      {muestra ? (
        <div className="kit-bloque" role="status" aria-label="Muestra de voz">
          <p>La voz dirá: «{muestra.dicho}»</p>
          {muestra.simulada ? <p className="sec">Modo simulado: el audio es silencio. Con la voz de Google configurada suena la frase real.</p> : null}
          <audio controls src={muestra.audioUrl}>
            <track kind="captions" />
          </audio>
          <p className="sec">Voz {muestra.voz}{muestra.aplicados.length ? ` · aplica ${muestra.aplicados.join(', ')}` : ' · sin términos del diccionario'}</p>
        </div>
      ) : null}
    </section>
  );
}

/** Glosario para la traducción al inglés: cada término se traduce como se indica o no se traduce (RN-08-1). */
function TerminosGlosario({ clienteId, puedeEditar }: { clienteId: string; puedeEditar: boolean }) {
  const [guardados, setGuardados] = useState<TerminoGlosario[] | null>(null);
  const [filas, setFilas] = useState<TerminoGlosario[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.glosario(clienteId).then(
      (l) => {
        setGuardados(l);
        setFilas(l);
      },
      (e: unknown) => setErrores(mensajes(e, 'No se pudo cargar el glosario')),
    );
  }, [clienteId]);

  const cambiado = JSON.stringify(filas) !== JSON.stringify(guardados ?? []);
  const fila = (i: number, cambio: Partial<TerminoGlosario>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  async function guardar() {
    setGuardando(true);
    setErrores([]);
    setAviso('');
    try {
      const l = await api.guardarGlosario(clienteId, filas.filter((f) => f.termino.trim()));
      setGuardados(l);
      setFilas(l);
      setAviso('Glosario guardado. Las traducciones que usan estos términos vuelven a pendientes.');
    } catch (e) {
      setErrores(mensajes(e, 'No se pudo guardar el glosario'));
    }
    setGuardando(false);
  }

  return (
    <section className="kit-bloque glosario-bloque" aria-label="Glosario">
      <h3>Glosario</h3>
      <p className="sec">La IA traduce al inglés con estos términos y respeta los que no se traducen.</p>
      <Errores lista={errores} />
      {aviso ? <div className="nota" role="status">{aviso}</div> : null}
      {guardados === null ? <p className="sec">Cargando…</p> : (
        <div className="tabla-terminos">
          <table>
            <thead>
              <tr><th>Término</th><th>En inglés</th><th>No traducir</th>{puedeEditar ? <th><span className="sr">Acciones</span></th> : null}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>{puedeEditar ? <input value={f.termino} aria-label={`Término, fila ${i + 1}`} onChange={(e) => fila(i, { termino: e.target.value })} /> : f.termino}</td>
                  <td>
                    {puedeEditar ? (
                      <input
                        value={f.noTraducir ? f.termino : (f.traduccion ?? '')}
                        disabled={f.noTraducir}
                        aria-label={`En inglés, fila ${i + 1}`}
                        onChange={(e) => fila(i, { traduccion: e.target.value })}
                      />
                    ) : f.noTraducir ? `${f.termino} (no se traduce)` : f.traduccion}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={f.noTraducir}
                      disabled={!puedeEditar}
                      aria-label={`No traducir, fila ${i + 1}`}
                      onChange={(e) => fila(i, { noTraducir: e.target.checked, traduccion: e.target.checked ? null : f.traduccion })}
                    />
                  </td>
                  {puedeEditar ? (
                    <td><button className="boton" type="button" aria-label={`Quitar término ${i + 1}`} onClick={() => setFilas(filas.filter((_, j) => j !== i))}>Quitar</button></td>
                  ) : null}
                </tr>
              ))}
              {!filas.length ? <tr><td colSpan={4} className="sec">Sin términos todavía.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      {puedeEditar && guardados !== null ? (
        <div className="acciones-form">
          <button className="boton" type="button" onClick={() => setFilas([...filas, { termino: '', traduccion: '', noTraducir: false }])}>Agregar término</button>
          <button className="boton primario" type="button" disabled={guardando || !cambiado} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar glosario'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
