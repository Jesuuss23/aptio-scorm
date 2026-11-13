// HU-1502 · Sitio web › Páginas (PNT-25, M16): las páginas del sitio comercial con su estado (borrador, programada,
// publicada). Nueva página, Publicar, Programar con fecha y hora de Lima, Pasar a borrador y Borrar (solo borradores).
// Solo el superadmin (ADR-011). HU-1503 · «Editar» abre el editor de bloques (PNT-26). SEO y landings de sector llegan
// con sus historias.
// HU-1505 · En producción, publicar con datos ficticios visibles da 409: se muestra la lista con «Ocultar todos los
// ficticios», que los oculta y vuelve a publicar en un clic (CP-116). En pruebas se publica con aviso (CP-117).
// HU-1506 · Debajo de la tabla, las tarjetas «Menú principal» y «Pie de página» (CP-118).
import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { type Coleccion, COLECCIONES_CONTENIDO } from '@aptio/schema/sitio-contenido';
import { navegar } from '../ruta';
import { type AccionPagina, api, ErrorApi, type PaginaSitio, type PaginaSitioCambio } from '../api';
import { NavegacionSitio } from './SitioNavegacion';
import { ESTADO_PAGINA, fechaHoraLima, limaAIso, MENSAJE_RUTA, minimoProgramable, NOMBRE_IDIOMA, RUTA_SITIO } from './sitio-paginas';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error' | 'aviso'; texto: string } | null;
type Bloqueo = { pagina: PaginaSitio; detalles: { id: string; coleccion: string; nombre: string }[]; mensaje: string } | null;
type Abierto = { id: string; modo: 'programar' | 'borrar' } | null;

export function SitioPaginas() {
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [nueva, setNueva] = useState(false);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [ocupado, setOcupado] = useState(false);
  const [bloqueo, setBloqueo] = useState<Bloqueo>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    api.paginasSitio().then(setPaginas, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las páginas')));
  }, []);

  const reemplazar = (p: PaginaSitio) => setPaginas((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));

  async function cambiar(p: PaginaSitio, datos: PaginaSitioCambio, ok: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    setBloqueo(null);
    try {
      const r = await api.cambiarPaginaSitio(p.id, datos);
      reemplazar(r);
      setAviso(r.avisoFicticios
        ? { tipo: 'aviso', texto: `${ok} Aviso: hay ${r.avisoFicticios === 1 ? '1 dato ficticio visible' : `${r.avisoFicticios} datos ficticios visibles`}; en pruebas se publica igual, pero en producción quedaría bloqueado.` }
        : { tipo: 'ok', texto: ok });
      setAbierto(null);
      return true;
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'FICTICIOS_VISIBLES') {
        setBloqueo({ pagina: p, mensaje: e.message, detalles: e.detalles as { id: string; coleccion: string; nombre: string }[] });
      } else {
        setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo cambiar la página') });
      }
      return false;
    } finally {
      setOcupado(false);
    }
  }

  /** CP-116 · Oculta todos los ficticios visibles y vuelve a publicar la página que estaba bloqueada. */
  async function ocultarYPublicar(b: NonNullable<Bloqueo>) {
    setOcupado(true);
    try {
      await api.ocultarFicticios();
    } catch (e) {
      setOcupado(false);
      return setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron ocultar los ficticios') });
    }
    setOcupado(false);
    await accion(b.pagina, 'publicar');
  }

  const accion = (p: PaginaSitio, a: AccionPagina) =>
    cambiar(p, { accion: a }, a === 'publicar' ? `«${p.titulo}» está publicada en ${p.ruta}.` : `«${p.titulo}» volvió a borrador: el sitio ya no la muestra.`);

  async function borrar(p: PaginaSitio) {
    setOcupado(true);
    setAviso(null);
    try {
      await api.borrarPaginaSitio(p.id);
      setPaginas((l) => (l ?? []).filter((x) => x.id !== p.id));
      setAviso({ tipo: 'ok', texto: `«${p.titulo}» se borró.` });
      setAbierto(null);
      titulo.current?.focus();
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo borrar la página') });
    } finally {
      setOcupado(false);
    }
  }

  const botonNueva = <button type="button" className="boton primario" onClick={() => { setNueva(true); setAviso(null); }} disabled={nueva}>Nueva página</button>;
  return (
    <>
      <Cabecera titulo="Páginas" subtitulo="Páginas del sitio comercial. Un borrador o una página programada no se ven en el sitio ni entran al sitemap; una programada se publica sola a su hora." accion={botonNueva} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {nueva ? (
        <NuevaPagina
          alCancelar={() => setNueva(false)}
          alCrear={(p) => {
            setPaginas((l) => [...(l ?? []), p].sort((a, b) => a.ruta.localeCompare(b.ruta) || a.idioma.localeCompare(b.idioma)));
            setNueva(false);
            setAviso({ tipo: 'ok', texto: `«${p.titulo}» se creó como borrador.` });
          }}
        />
      ) : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : aviso.tipo === 'aviso' ? 'aviso' : 'error'}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</div> : null}
      {bloqueo ? (
        <div className="nota error" role="alert" aria-labelledby="bloqueo-titulo">
          <p id="bloqueo-titulo"><b>«{bloqueo.pagina.titulo}» no se publicó.</b> {bloqueo.mensaje}</p>
          <ul aria-label="Datos ficticios visibles">
            {bloqueo.detalles.map((d) => <li key={d.id}>{d.nombre} <span>({COLECCIONES_CONTENIDO[d.coleccion as Coleccion]?.nombre ?? d.coleccion})</span></li>)}
          </ul>
          <div className="acciones-fila">
            <button type="button" className="boton primario" disabled={ocupado} onClick={() => void ocultarYPublicar(bloqueo)}>Ocultar todos los ficticios</button>
            <button type="button" className="boton" onClick={() => setBloqueo(null)}>Cerrar</button>
          </div>
        </div>
      ) : null}
      {!paginas ? (!error ? <p className="sec" role="status">Cargando las páginas…</p> : null) : (
        <section className="tarjeta" aria-labelledby="sitio-paginas-titulo">
          <h2 id="sitio-paginas-titulo" ref={titulo} tabIndex={-1}>Páginas del sitio</h2>
          {paginas.length === 0 ? <p className="nota">Aún no hay páginas. Crea la primera con «Nueva página».</p> : (
            <div className="tabla-costos">
              <table aria-label="Páginas del sitio">
                <thead>
                  <tr>
                    <th scope="col">Página</th>
                    <th scope="col">Idioma</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Fecha</th>
                    <th scope="col"><span className="sr">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginas.map((p) => (
                    <FilaPagina
                      key={p.id} pagina={p} abierto={abierto?.id === p.id ? abierto.modo : null} ocupado={ocupado}
                      alAbrir={(modo) => { setAbierto(modo ? { id: p.id, modo } : null); setAviso(null); }}
                      alAccion={(a) => void accion(p, a)}
                      alProgramar={(iso) => cambiar(p, { accion: 'programar', publicarEn: iso }, `«${p.titulo}» se publicará el ${fechaHoraLima(iso)}.`)}
                      alBorrar={() => void borrar(p)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <NavegacionSitio />
    </>
  );
}

function FilaPagina({ pagina: p, abierto, ocupado, alAbrir, alAccion, alProgramar, alBorrar }: {
  pagina: PaginaSitio; abierto: 'programar' | 'borrar' | null; ocupado: boolean;
  alAbrir: (modo: 'programar' | 'borrar' | null) => void; alAccion: (a: AccionPagina) => void;
  alProgramar: (iso: string) => Promise<boolean>; alBorrar: () => void;
}) {
  const estado = ESTADO_PAGINA[p.estado];
  const fecha = p.estado === 'PROGRAMADA' && p.publicarEn ? `Se publica el ${fechaHoraLima(p.publicarEn)}`
    : p.estado === 'PUBLICADA' && p.publicadaEn ? `Publicada el ${fechaHoraLima(p.publicadaEn)}` : '—';
  return (
    <>
      <tr>
        <th scope="row"><b>{p.titulo}</b><span className="sec"> {p.ruta}</span></th>
        <td>{NOMBRE_IDIOMA[p.idioma]}</td>
        <td><span className={`chip ${estado.chip}`}>{estado.texto}</span></td>
        <td>{fecha}</td>
        <td>
          <div className="acciones-fila">
            <button type="button" className="boton" onClick={() => navegar(`/sitio/paginas/${p.id}`)} aria-label={`Editar ${p.titulo}`}>Editar</button>
            {p.estado !== 'PUBLICADA' ? <button type="button" className="boton" disabled={ocupado} onClick={() => alAccion('publicar')} aria-label={`Publicar ${p.titulo}`}>Publicar</button> : null}
            <button type="button" className="boton" disabled={ocupado} aria-expanded={abierto === 'programar'} onClick={() => alAbrir(abierto === 'programar' ? null : 'programar')} aria-label={`Programar ${p.titulo}`}>Programar</button>
            {p.estado !== 'BORRADOR' ? <button type="button" className="boton" disabled={ocupado} onClick={() => alAccion('borrador')} aria-label={`Pasar a borrador ${p.titulo}`}>Pasar a borrador</button> : null}
            {p.estado === 'BORRADOR' ? <button type="button" className="boton" disabled={ocupado} aria-expanded={abierto === 'borrar'} onClick={() => alAbrir(abierto === 'borrar' ? null : 'borrar')} aria-label={`Borrar ${p.titulo}`}>Borrar</button> : null}
          </div>
        </td>
      </tr>
      {abierto === 'programar' ? (
        <tr><td colSpan={5}><Programar pagina={p} ocupado={ocupado} alCancelar={() => alAbrir(null)} alProgramar={alProgramar} /></td></tr>
      ) : null}
      {abierto === 'borrar' ? (
        <tr>
          <td colSpan={5}>
            <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${p.titulo}`}>
              <span>¿Borrar «{p.titulo}» ({p.ruta})? No se puede deshacer.</span>
              <button type="button" className="boton peligro" disabled={ocupado} onClick={alBorrar}>Sí, borrar</button>
              <button type="button" className="boton" onClick={() => alAbrir(null)}>Cancelar</button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Programar({ pagina, ocupado, alCancelar, alProgramar }: { pagina: PaginaSitio; ocupado: boolean; alCancelar: () => void; alProgramar: (iso: string) => Promise<boolean> }) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);
  const id = `programar-${pagina.id}`;

  function enviar(e: FormEvent) {
    e.preventDefault();
    const iso = limaAIso(valor);
    if (!iso) return setError('Elige la fecha y la hora de publicación.');
    if (new Date(iso).getTime() <= Date.now()) return setError('La fecha de publicación tiene que ser futura.');
    setError('');
    void alProgramar(iso);
  }

  return (
    <form className="mediciones-form" onSubmit={enviar} aria-label={`Programar ${pagina.titulo}`} noValidate>
      <label className="campo" htmlFor={id}>
        Publicar el (hora de Lima)
        <input id={id} ref={campo} type="datetime-local" min={minimoProgramable()} value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      </label>
      <button type="submit" className="boton primario" disabled={ocupado}>Programar publicación</button>
      <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      {error ? <p className="nota error" id={`${id}-error`} role="alert">{error}</p> : null}
    </form>
  );
}

function NuevaPagina({ alCancelar, alCrear }: { alCancelar: () => void; alCrear: (p: PaginaSitio) => void }) {
  const [ruta, setRuta] = useState('/');
  const [titulo, setTitulo] = useState('');
  const [idioma, setIdioma] = useState<'es' | 'en'>('es');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const primero = useRef<HTMLInputElement>(null);
  useEffect(() => primero.current?.focus(), []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return setError('Escribe el título de la página.');
    if (!RUTA_SITIO.test(ruta)) return setError(MENSAJE_RUTA);
    setError('');
    setEnviando(true);
    try {
      alCrear(await api.crearPaginaSitio({ ruta, titulo: titulo.trim(), idioma }));
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo crear la página'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="nueva-pagina-titulo">
      <h2 id="nueva-pagina-titulo">Nueva página</h2>
      <p className="sec">Se crea como borrador: no se ve en el sitio hasta que la publiques o la programes.</p>
      <form className="mediciones-form" onSubmit={enviar} aria-label="Nueva página" noValidate>
        <label className="campo">
          Título
          <input ref={primero} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
        </label>
        <label className="campo">
          Ruta
          <input value={ruta} onChange={(e) => setRuta(e.target.value)} maxLength={200} spellCheck={false} autoCapitalize="none" />
        </label>
        <label className="campo">
          Idioma
          <select value={idioma} onChange={(e) => setIdioma(e.target.value as 'es' | 'en')}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </label>
        <button type="submit" className="boton primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear borrador'}</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </form>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
    </section>
  );
}
