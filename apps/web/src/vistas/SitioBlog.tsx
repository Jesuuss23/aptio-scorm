// HU-1511 · Sitio web › Blog (REQ-070, PNT-28, RN-16-8). Los artículos se escriben y publican en WordPress; aquí se
// conecta el WordPress (URL, frecuencia, «Sincronizar ahora» y el estado o el error de la última lectura, CP-156), se
// ordenan y se muestran u ocultan las categorías, se muestra u oculta cada artículo (CP-155) y se eligen las opciones de
// la sección Blog. Los cambios valen al instante en el sitio, sin «Publicar cambios»: el blog no va en la versión.
import { aplicarCambiosBlog, CONEXION_BLOG_POR_DEFECTO, FRECUENCIAS_BLOG, LIMITES_BLOG } from '@aptio/schema/sitio-blog';
import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, type ArticuloBlog, type BlogSitio, type CambiosBlogSitio, type CategoriaBlog, ErrorApi } from '../api';
import { fechaHoraLima } from './sitio-paginas';

type Aviso = { tipo: 'ok' | 'error' | 'aviso'; texto: string } | null;
const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const NOMBRE_FRECUENCIA: Record<number, string> = { 15: 'Cada 15 minutos', 30: 'Cada 30 minutos', 60: 'Cada hora' };
const AL_INSTANTE = 'El sitio se actualiza en unos segundos, sin publicar.';
/** Cuánto se espera el resultado de «Sincronizar ahora» antes de dejarlo corriendo de fondo. */
const ESPERA_SINCRONIZAR = { pasos: 15, cadaMs: 2000 };

function Nota({ aviso }: { aviso: Aviso }) {
  return aviso ? <p className={`nota ${aviso.tipo === 'ok' ? 'validado' : aviso.tipo === 'aviso' ? 'aviso' : 'error'}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</p> : null;
}

function estadoConexion(b: BlogSitio): { clase: string; texto: string } {
  if (!b.url) return { clase: 'aviso', texto: 'Sin conectar' };
  if (b.error) return { clase: 'error', texto: 'Con error' };
  if (b.sincronizadoEn) return { clase: 'validado', texto: 'Conectado' };
  return { clase: 'aviso', texto: 'Sin sincronizar' };
}

export function SitioBlog() {
  const [blog, setBlog] = useState<BlogSitio | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    api.blogSitio().then(setBlog, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el blog')));
    return () => { vivo.current = false; };
  }, []);

  /** Un cambio de la copia (orden o visibilidad): la respuesta trae el blog entero. */
  async function hacer(accion: () => Promise<BlogSitio>, ok: string, falla: string) {
    setOcupado(true);
    try {
      setBlog(await accion());
      setAviso({ tipo: 'ok', texto: ok });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, falla) });
    } finally {
      setOcupado(false);
    }
  }

  /** «Sincronizar ahora»: lo pide y espera el resultado unos segundos (el worker lee WordPress de fondo). */
  async function sincronizar() {
    if (!blog) return;
    const antes = blog.intentoEn;
    setSincronizando(true);
    setAviso({ tipo: 'aviso', texto: 'Sincronizando con WordPress…' });
    try {
      await api.sincronizarBlog();
      for (let i = 0; i < ESPERA_SINCRONIZAR.pasos && vivo.current; i++) {
        await new Promise((r) => setTimeout(r, ESPERA_SINCRONIZAR.cadaMs));
        const b = await api.blogSitio();
        if (b.intentoEn !== antes) {
          setBlog(b);
          setAviso(b.error
            ? { tipo: 'error', texto: `No se pudo sincronizar: ${b.error}. El sitio sigue mostrando la copia anterior.` }
            : { tipo: 'ok', texto: `Sincronizado: ${b.articulos.length} ${b.articulos.length === 1 ? 'artículo publicado' : 'artículos publicados'} en WordPress. ${AL_INSTANTE}` });
          return;
        }
      }
      setAviso({ tipo: 'aviso', texto: 'La sincronización sigue en curso. Vuelve a abrir esta vista en un momento para ver el resultado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo pedir la sincronización') });
    } finally {
      setSincronizando(false);
    }
  }

  const accion = (
    <button type="button" className="boton primario" disabled={!blog?.url || sincronizando || ocupado} onClick={() => void sincronizar()}>
      {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
    </button>
  );

  return (
    <>
      <Cabecera titulo="Blog" subtitulo="Los artículos se escriben y publican en WordPress. Aquí eliges qué categorías y artículos se muestran en la sección Blog de cada página." accion={accion} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!blog ? (!error ? <p className="sec" role="status">Cargando el blog…</p> : null) : (
        <>
          <Nota aviso={aviso} />
          <div className="columnas blog-sitio">
            <TarjetaArticulos blog={blog} ocupado={ocupado}
              alMostrar={(a, visible) => void hacer(() => api.mostrarArticuloBlog(a.id, visible), `«${a.titulo}» ${visible ? 'se muestra' : 'quedó oculto'}. ${AL_INSTANTE}`, 'No se pudo cambiar el artículo')} />
            <div className="blog-lateral">
              <TarjetaConexion blog={blog} alGuardar={setBlog} />
              <TarjetaCategorias blog={blog} ocupado={ocupado}
                alMostrar={(c, visible) => void hacer(() => api.mostrarCategoriaBlog(c.id, visible), `La categoría «${c.nombre}» ${visible ? 'se muestra' : 'quedó oculta, con sus artículos que no estén en otra categoría visible'}. ${AL_INSTANTE}`, 'No se pudo cambiar la categoría')}
                alOrdenar={(orden, c) => void hacer(() => api.ordenarCategoriasBlog(orden), `«${c.nombre}» quedó en la posición ${orden.indexOf(c.id) + 1}. ${AL_INSTANTE}`, 'No se pudo ordenar')} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TarjetaArticulos({ blog, ocupado, alMostrar }: { blog: BlogSitio; ocupado: boolean; alMostrar: (a: ArticuloBlog, visible: boolean) => void }) {
  const porId = new Map(blog.categorias.map((c) => [c.id, c]));
  const categoriaOculta = (a: ArticuloBlog) => a.categorias.length > 0 && a.categorias.every((id) => porId.get(id)?.visible === false);
  const visibles = blog.articulos.filter((a) => a.visible && !categoriaOculta(a)).length;
  return (
    <section className="tarjeta blog-articulos" aria-labelledby="blog-articulos-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="blog-articulos-titulo">Artículos de WordPress</h2>
        <span className="chip">{visibles} visibles de {blog.articulos.length}</span>
      </div>
      {blog.articulos.length === 0 ? (
        <p className="nota">{blog.url ? 'Aún no hay artículos. Usa «Sincronizar ahora» o espera la próxima sincronización.' : 'Conecta tu WordPress para traer sus artículos publicados.'}</p>
      ) : (
        <div className="tabla-costos">
          <table aria-label="Artículos de WordPress">
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col">Categorías</th>
                <th scope="col" className="blog-meta">Autor</th>
                <th scope="col" className="blog-meta">Publicado</th>
                <th scope="col">Mostrar</th>
              </tr>
            </thead>
            <tbody>
              {blog.articulos.map((a) => {
                const oculta = categoriaOculta(a);
                return (
                  <tr key={a.id} className={a.visible && !oculta ? '' : 'oculto'}>
                    <th scope="row">
                      <b>{a.titulo}</b>
                      <a className="blog-editar" href={a.editar} target="_blank" rel="noopener noreferrer">Editar en WordPress<span className="sr">: {a.titulo} (se abre en otra pestaña)</span></a>
                    </th>
                    <td>
                      <span className="blog-chips">{a.categorias.map((id) => porId.get(id)).filter((c): c is CategoriaBlog => Boolean(c)).map((c) => <span key={c.id} className="chip">{c.nombre}</span>)}</span>
                      {oculta ? <span className="sec blog-nota">Categoría oculta</span> : null}
                    </td>
                    <td className="sec blog-meta">{a.autor ?? '—'}</td>
                    <td className="sec blog-meta">{fecha(a.fecha)}</td>
                    <td>
                      <button type="button" role="switch" className="interruptor" aria-checked={a.visible} disabled={ocupado} onClick={() => alMostrar(a, !a.visible)} aria-label={`Mostrar ${a.titulo}`}><span aria-hidden="true" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TarjetaConexion({ blog, alGuardar }: { blog: BlogSitio; alGuardar: (b: BlogSitio) => void }) {
  const [url, setUrl] = useState(blog.url ?? '');
  const [frecuencia, setFrecuencia] = useState(blog.frecuenciaMin);
  const [porPagina, setPorPagina] = useState(String(blog.porPagina));
  const [mostrarImagen, setMostrarImagen] = useState(blog.mostrarImagen);
  const [mostrarAutor, setMostrarAutor] = useState(blog.mostrarAutor);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoConexion(blog);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const cambios: CambiosBlogSitio = {};
    if (url.trim() !== (blog.url ?? '')) cambios.url = url.trim() || null;
    if (frecuencia !== blog.frecuenciaMin) cambios.frecuenciaMin = frecuencia;
    if (Number(porPagina) !== blog.porPagina) cambios.porPagina = Number(porPagina);
    if (mostrarImagen !== blog.mostrarImagen) cambios.mostrarImagen = mostrarImagen;
    if (mostrarAutor !== blog.mostrarAutor) cambios.mostrarAutor = mostrarAutor;
    if (!Object.keys(cambios).length) return setAviso({ tipo: 'aviso', texto: 'No hay cambios que guardar.' });
    const r = aplicarCambiosBlog({ ...CONEXION_BLOG_POR_DEFECTO, ...blog }, cambios);
    if (!r.ok) return setAviso({ tipo: 'error', texto: r.errores.map((x) => x.mensaje).join('. ') });
    setOcupado(true);
    try {
      const b = await api.guardarBlogSitio(cambios);
      alGuardar(b);
      setUrl(b.url ?? '');
      const otra = cambios.url !== undefined;
      setAviso({ tipo: 'ok', texto: otra ? (b.url ? 'Se guardó la conexión. La primera sincronización empieza en unos segundos.' : 'Se desconectó el blog. La sección Blog deja de mostrarse en el sitio.') : `Se guardó. ${AL_INSTANTE}` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar la conexión') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="blog-conexion-titulo">
      <div className="tarjeta-cabeza"><h2 id="blog-conexion-titulo">Conexión</h2><span className={`chip ${estado.clase}`}>{estado.texto}</span></div>
      <form className="formulario-ajustes" onSubmit={(e) => void enviar(e)} aria-label="Conexión con WordPress" noValidate>
        <label className="campo" htmlFor="blog-url">URL de WordPress
          <input id="blog-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://blog.tuempresa.com" autoComplete="off" spellCheck={false} aria-describedby="blog-url-ayuda" />
        </label>
        <p className="sec" id="blog-url-ayuda">Se leen solo los artículos publicados y sin clave, desde la API REST de WordPress (/wp-json/wp/v2/posts).</p>
        <label className="campo" htmlFor="blog-frecuencia">Sincronización
          <select id="blog-frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(Number(e.target.value))}>
            {FRECUENCIAS_BLOG.map((f) => <option key={f} value={f}>{NOMBRE_FRECUENCIA[f]}</option>)}
          </select>
        </label>
        <label className="campo" htmlFor="blog-por-pagina">Artículos por filtro en la sección
          <input id="blog-por-pagina" type="number" inputMode="numeric" min={LIMITES_BLOG.porPaginaMin} max={LIMITES_BLOG.porPaginaMax} value={porPagina} onChange={(e) => setPorPagina(e.target.value)} />
        </label>
        <div className="fila-interruptor">
          <span id="blog-imagen-etiqueta">Mostrar imagen</span>
          <button type="button" role="switch" className="interruptor" aria-checked={mostrarImagen} aria-labelledby="blog-imagen-etiqueta" onClick={() => setMostrarImagen((v) => !v)}><span aria-hidden="true" /></button>
        </div>
        <div className="fila-interruptor">
          <span id="blog-autor-etiqueta">Mostrar autor</span>
          <button type="button" role="switch" className="interruptor" aria-checked={mostrarAutor} aria-labelledby="blog-autor-etiqueta" onClick={() => setMostrarAutor((v) => !v)}><span aria-hidden="true" /></button>
        </div>
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={ocupado}>Guardar</button></div>
      </form>
      <div className="blog-estado">
        {blog.error ? (
          <p className="nota error">Última sincronización con error{blog.intentoEn ? ` (${fechaHoraLima(blog.intentoEn)})` : ''}: {blog.error}. El sitio sigue mostrando la copia anterior.</p>
        ) : null}
        <p className="sec">{blog.sincronizadoEn ? `Última sincronización: ${fechaHoraLima(blog.sincronizadoEn)}.` : blog.url ? 'Aún no se sincroniza.' : 'Sin WordPress conectado, la sección Blog no se muestra.'}</p>
      </div>
      <Nota aviso={aviso} />
    </section>
  );
}

function TarjetaCategorias({ blog, ocupado, alMostrar, alOrdenar }: {
  blog: BlogSitio; ocupado: boolean; alMostrar: (c: CategoriaBlog, visible: boolean) => void; alOrdenar: (orden: number[], c: CategoriaBlog) => void;
}) {
  const ids = blog.categorias.map((c) => c.id);
  const mover = (c: CategoriaBlog, paso: -1 | 1) => {
    const i = ids.indexOf(c.id);
    const orden = [...ids];
    [orden[i], orden[i + paso]] = [orden[i + paso]!, orden[i]!];
    alOrdenar(orden, c);
  };
  return (
    <section className="tarjeta" aria-labelledby="blog-categorias-titulo">
      <div className="tarjeta-cabeza"><h2 id="blog-categorias-titulo">Categorías</h2></div>
      <p className="sec">Las visibles aparecen como filtro en la sección Blog, en este orden. Ocultar una categoría oculta sus artículos, salvo los que estén también en otra visible.</p>
      {blog.categorias.length === 0 ? <p className="nota">Las categorías llegan con la primera sincronización.</p> : (
        <ul className="lista-bloques" aria-label="Categorías del blog">
          {blog.categorias.map((c, i) => (
            <li key={c.id} className={`bloque-fila${c.visible ? '' : ' oculto'}`}>
              <div className="bloque-orden">
                <button type="button" className="boton icono" disabled={ocupado || i === 0} onClick={() => mover(c, -1)} aria-label={`Subir ${c.nombre}`}>↑</button>
                <button type="button" className="boton icono" disabled={ocupado || i === blog.categorias.length - 1} onClick={() => mover(c, 1)} aria-label={`Bajar ${c.nombre}`}>↓</button>
              </div>
              <span className="bloque-texto blog-categoria"><b>{c.nombre}</b></span>
              <span className="chip">{c.articulos}<span className="sr"> {c.articulos === 1 ? 'artículo' : 'artículos'}</span></span>
              <button type="button" role="switch" className="interruptor" aria-checked={c.visible} disabled={ocupado} onClick={() => alMostrar(c, !c.visible)} aria-label={`Mostrar categoría ${c.nombre}`}><span aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
