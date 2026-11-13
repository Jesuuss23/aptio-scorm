// HU-0506 · Panel «Comentarios» de una pantalla en Revisión (REQ-058, CP-055): la lista en orden cronológico con el
// distintivo «Cliente» y su estado, el formulario «Comentar» (1 a 1000 caracteres) para todos, y «Resolver» o «Reabrir»
// solo para el equipo. Comentar no cambia el estado de aprobación de la pantalla.
import { type FormEvent, useState } from 'react';
import { api, type Comentario, ErrorApi, MAX_COMENTARIO } from '../api';
import { comentariosDe } from './comentarios';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });

export function PanelComentarios({ cursoId, pantallaId, comentarios, resuelven, alCambiar }: {
  cursoId: string; pantallaId: string; comentarios: Comentario[]; resuelven: boolean; alCambiar: () => Promise<unknown>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const lista = comentariosDe(comentarios, pantallaId);
  const largo = texto.trim().length;

  async function hacer(accion: () => Promise<string>) {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const mensaje = await accion();
      await alCambiar();
      setAviso(mensaje);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el comentario');
    } finally {
      setOcupado(false);
    }
  }

  function comentar(e: FormEvent) {
    e.preventDefault();
    if (!largo) {
      setError('Escribe el comentario');
      return;
    }
    if (largo > MAX_COMENTARIO) {
      setError(`El comentario admite hasta ${MAX_COMENTARIO} caracteres`);
      return;
    }
    void hacer(async () => {
      await api.comentar(cursoId, pantallaId, texto.trim());
      setTexto('');
      return 'Comentario publicado.';
    });
  }

  const idCampo = `comentario-${pantallaId}`;
  return (
    <section className="tarjeta kit-bloque comentarios" aria-labelledby="comentarios-titulo">
      <h2 id="comentarios-titulo">Comentarios</h2>
      {lista.length === 0 ? <p className="sec">Aún no hay comentarios en esta pantalla.</p> : (
        <ol className="comentarios-lista" aria-label="Comentarios de la pantalla">
          {lista.map((c) => (
            <li key={c.id} className={c.resuelto ? 'resuelto' : undefined}>
              <div className="comentario-cabeza">
                <b>{c.autor.nombre}</b>
                {c.autor.rol === 'REVISOR_CLIENTE' ? <span className="chip ia">Cliente</span> : null}
                <span className={`chip ${c.resuelto ? 'validado' : 'aviso'}`}>{c.resuelto ? 'Resuelto' : 'Abierto'}</span>
                <span className="sec">{fecha(c.creadoEn)}</span>
              </div>
              <p className="comentario-texto">{c.texto}</p>
              {c.resuelto && c.resueltoPor ? <p className="ayuda">Resuelto por {c.resueltoPor}{c.resueltoEn ? ` · ${fecha(c.resueltoEn)}` : ''}</p> : null}
              {resuelven ? (
                <button
                  type="button" className="boton chico" disabled={ocupado}
                  aria-label={`${c.resuelto ? 'Reabrir' : 'Resolver'} el comentario de ${c.autor.nombre}`}
                  onClick={() => void hacer(async () => {
                    await api.resolverComentario(c.id, !c.resuelto);
                    return c.resuelto ? 'Comentario reabierto.' : 'Comentario resuelto.';
                  })}
                >
                  {c.resuelto ? 'Reabrir' : 'Resolver'}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <form className="comentario-form" onSubmit={comentar} noValidate>
        <label className="campo" htmlFor={idCampo}>Comentar esta pantalla</label>
        <textarea
          id={idCampo} rows={3} value={texto} aria-describedby={`${idCampo}-ayuda`} aria-invalid={largo > MAX_COMENTARIO || undefined}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="acciones-form">
          <button type="submit" className="boton primario" disabled={ocupado}>Comentar</button>
          <span id={`${idCampo}-ayuda`} className={`ayuda${largo > MAX_COMENTARIO ? ' error' : ''}`}>{largo} / {MAX_COMENTARIO} caracteres</span>
        </div>
      </form>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <p className="sec" role="status">{aviso}</p>
    </section>
  );
}
