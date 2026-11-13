// HU-1503 · Sitio web › Editor de página (PNT-26, REQ-066): los bloques de una página en su orden, con flechas para
// subir y bajar (dedo, ratón y teclado), un interruptor para mostrar u ocultar, agregar del catálogo cerrado y borrar.
// Un bloque nuevo va al final y oculto (RN-16-2); ocultarlo no borra sus datos (CP-112). Solo el superadmin (ADR-011).
// La vista previa y el SEO llegan con la HU-1507 y las historias de cada bloque.
import { CATALOGO_BLOQUES, contarVisibles, fuenteBloque, moverBloque, nombreBloque, TIPOS_BLOQUE } from '@aptio/schema/sitio-bloques';
import { Cabecera } from '@aptio/ui';
import { useEffect, useRef, useState } from 'react';
import { api, type BloqueSitio, ErrorApi, type PaginaSitio } from '../api';
import { navegar } from '../ruta';
import { ESTADO_PAGINA, NOMBRE_IDIOMA } from './sitio-paginas';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

export function EditorPaginaSitio({ paginaId }: { paginaId: string }) {
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [bloques, setBloques] = useState<BloqueSitio[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [tipo, setTipo] = useState<string>(TIPOS_BLOQUE[0]!);
  const [borrando, setBorrando] = useState<string | null>(null);
  const foco = useRef<string | null>(null);
  const lista = useRef<HTMLOListElement>(null);

  useEffect(() => {
    api.paginasSitio().then(setPaginas, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las páginas')));
    api.bloquesPagina(paginaId).then(setBloques, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los bloques')));
  }, [paginaId]);

  // Tras mover, el foco sigue al bloque movido (la flecha que se usó o, si quedó en un extremo, la otra).
  useEffect(() => {
    const destino = foco.current;
    if (!destino || !lista.current) return;
    foco.current = null;
    const [id, paso] = destino.split(':');
    const fila = lista.current.querySelector<HTMLElement>(`[data-bloque="${id}"]`);
    const preferido = fila?.querySelector<HTMLButtonElement>(`[data-paso="${paso}"]`);
    const otro = fila?.querySelector<HTMLButtonElement>(`[data-paso="${paso === 'subir' ? 'bajar' : 'subir'}"]`);
    (preferido && !preferido.disabled ? preferido : otro)?.focus();
  }, [bloques]);

  const pagina = paginas?.find((p) => p.id === paginaId) ?? null;

  async function hacer<T>(accion: () => Promise<T>, defecto: string): Promise<T | undefined> {
    setOcupado(true);
    setAviso(null);
    try {
      return await accion();
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, defecto) });
      return undefined;
    } finally {
      setOcupado(false);
    }
  }

  async function mover(b: BloqueSitio, paso: -1 | 1) {
    if (!bloques) return;
    const ids = moverBloque(bloques.map((x) => x.id), b.id, paso);
    const nuevos = await hacer(() => api.ordenarBloques(paginaId, ids), 'No se pudo cambiar el orden');
    if (!nuevos) return;
    foco.current = `${b.id}:${paso === -1 ? 'subir' : 'bajar'}`;
    setBloques(nuevos);
    setAnuncio(`«${nombreBloque(b.tipo)}» quedó en la posición ${nuevos.findIndex((x) => x.id === b.id) + 1} de ${nuevos.length}.`);
  }

  async function alternar(b: BloqueSitio) {
    const cambiado = await hacer(() => api.mostrarBloque(paginaId, b.id, !b.visible), 'No se pudo cambiar la visibilidad');
    if (!cambiado) return;
    setBloques((l) => (l ?? []).map((x) => (x.id === b.id ? cambiado : x)));
    setAnuncio(`«${nombreBloque(b.tipo)}» ${cambiado.visible ? 'se muestra' : 'quedó oculto; sus datos se conservan'}.`);
  }

  async function agregar() {
    const nuevo = await hacer(() => api.agregarBloque(paginaId, tipo), 'No se pudo agregar el bloque');
    if (!nuevo) return;
    setBloques((l) => [...(l ?? []), nuevo]);
    setAviso({ tipo: 'ok', texto: `«${nombreBloque(nuevo.tipo)}» se agregó al final, oculto. Actívalo cuando esté listo.` });
  }

  async function borrar(b: BloqueSitio) {
    const ok = await hacer(async () => { await api.borrarBloque(paginaId, b.id); return true; }, 'No se pudo borrar el bloque');
    if (!ok) return;
    setBorrando(null);
    setBloques((l) => (l ?? []).filter((x) => x.id !== b.id).map((x, orden) => ({ ...x, orden })));
    setAviso({ tipo: 'ok', texto: `«${nombreBloque(b.tipo)}» se borró de la página.` });
  }

  const selector = paginas && paginas.length > 0 ? (
    <label className="campo selector-pagina">
      Página a editar
      <select value={paginaId} onChange={(e) => navegar(`/sitio/paginas/${e.target.value}`)}>
        {paginas.map((p) => <option key={p.id} value={p.id}>{p.titulo} ({p.ruta}{p.idioma === 'en' ? ', inglés' : ''})</option>)}
      </select>
    </label>
  ) : undefined;

  const subtitulo = pagina
    ? `Bloques y visibilidad de «${pagina.titulo}» (${pagina.ruta}). Un bloque nuevo entra oculto; ocultarlo no borra sus datos.`
    : 'Bloques y visibilidad de la página. Un bloque nuevo entra oculto; ocultarlo no borra sus datos.';

  return (
    <>
      <Cabecera titulo="Editor de página" subtitulo={subtitulo} accion={selector} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      <p className="sr" role="status" aria-live="polite">{anuncio}</p>
      {!bloques ? (!error ? <p className="sec" role="status">Cargando los bloques…</p> : null) : (
        <div className="editor-pagina">
          <section className="tarjeta" aria-labelledby="bloques-titulo">
            <div className="tarjeta-cabeza">
              <h2 id="bloques-titulo">Bloques</h2>
              <span className="chip">{contarVisibles(bloques)} visibles</span>
            </div>
            {bloques.length === 0 ? <p className="nota">Esta página aún no tiene bloques. Agrega uno para empezar.</p> : (
              <ol className="lista-bloques" ref={lista} aria-label="Bloques de la página">
                {bloques.map((b, i) => {
                  const nombre = nombreBloque(b.tipo);
                  const fuente = fuenteBloque(b.tipo);
                  return (
                    <li key={b.id} data-bloque={b.id} className={`bloque-fila${b.visible ? '' : ' oculto'}`}>
                      <div className="bloque-orden">
                        <button type="button" className="boton icono" data-paso="subir" disabled={ocupado || i === 0} onClick={() => void mover(b, -1)} aria-label={`Subir ${nombre}`}>↑</button>
                        <button type="button" className="boton icono" data-paso="bajar" disabled={ocupado || i === bloques.length - 1} onClick={() => void mover(b, 1)} aria-label={`Bajar ${nombre}`}>↓</button>
                      </div>
                      <div className="bloque-texto">
                        <b>{nombre}</b>
                        <span className="sec">{fuente ? `Datos: ${fuente}` : 'Sin datos externos'}{b.visible ? '' : ' · Oculto'}</span>
                      </div>
                      <button
                        type="button" role="switch" className="interruptor" aria-checked={b.visible} disabled={ocupado}
                        onClick={() => void alternar(b)} aria-label={`Mostrar bloque ${nombre}`}
                      ><span aria-hidden="true" /></button>
                      <button type="button" className="boton" disabled={ocupado} aria-expanded={borrando === b.id} onClick={() => setBorrando(borrando === b.id ? null : b.id)} aria-label={`Borrar ${nombre}`}>Borrar</button>
                      {borrando === b.id ? (
                        <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${nombre}`}>
                          <span>¿Borrar «{nombre}»? Se pierden sus datos. Para dejar de mostrarlo basta con ocultarlo.</span>
                          <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void borrar(b)}>Sí, borrar</button>
                          <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
            <form className="mediciones-form" onSubmit={(e) => { e.preventDefault(); void agregar(); }} aria-label="Agregar bloque">
              <label className="campo">
                Tipo de bloque
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_BLOQUE.map((t) => <option key={t} value={t}>{CATALOGO_BLOQUES[t].nombre}</option>)}
                </select>
              </label>
              <button type="submit" className="boton primario" disabled={ocupado}>Agregar bloque</button>
            </form>
          </section>
          <aside className="tarjeta" aria-labelledby="pagina-datos-titulo">
            <h2 id="pagina-datos-titulo">Página</h2>
            {pagina ? (
              <dl className="datos-pagina">
                <dt>Estado</dt><dd><span className={`chip ${ESTADO_PAGINA[pagina.estado].chip}`}>{ESTADO_PAGINA[pagina.estado].texto}</span></dd>
                <dt>Nombre</dt><dd>{pagina.titulo}</dd>
                <dt>Ruta</dt><dd>{pagina.ruta}</dd>
                <dt>Idioma</dt><dd>{NOMBRE_IDIOMA[pagina.idioma]}</dd>
              </dl>
            ) : null}
            <p className="nota">Si la página está publicada, los cambios de bloques se ven en el sitio al momento. Si está en borrador o programada, el sitio no muestra nada de ella.</p>
            <button type="button" className="boton" onClick={() => navegar('/sitio/paginas')}>Volver a Páginas</button>
          </aside>
        </div>
      )}
    </>
  );
}
