// HU-1506 · Sitio web › Páginas: tarjetas «Menú principal» y «Pie de página» (PNT-25, REQ-066). Cada enlace tiene texto
// y ruta editables con «Guardar», flechas para subir y bajar entre hermanos (el foco sigue al enlace movido), un
// interruptor para mostrar u ocultar y borrar con confirmación. El pie tiene columnas con sus enlaces: ocultar una
// columna oculta todos sus enlaces. Lo nuevo entra oculto (RN-16-2). La línea «En el sitio» muestra lo que ve el
// visitante en la cabecera y en el menú de celular, que usan la misma lista (CP-118).
import { moverBloque } from '@aptio/schema/sitio-bloques';
import { navegacionPublica, validarRuta, validarTextoEnlace } from '@aptio/schema/sitio-navegacion';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { api, type EnlaceSitio, ErrorApi, type NavegacionSitio as Navegacion } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Nuevo = { zona: 'menu' | 'pie'; padreId: string | null } | null;
const claveNuevo = (n: NonNullable<Nuevo>) => `${n.zona}-${n.padreId ?? 'raiz'}`;

export function NavegacionSitio({ alCambiar }: { alCambiar?: () => void } = {}) {
  const [nav, setNav] = useState<Navegacion | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<Nuevo>(null);
  const foco = useRef<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.navegacionSitio().then(setNav, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el menú y el pie')));
  }, []);

  // Tras mover, el foco sigue al enlace movido (la flecha que se usó o, si quedó en un extremo, la otra).
  useEffect(() => {
    const destino = foco.current;
    if (!destino || !contenedor.current) return;
    foco.current = null;
    const [id, paso] = destino.split(':');
    const orden = contenedor.current.querySelector<HTMLElement>(`[data-enlace="${id}"] > .bloque-orden`);
    const preferido = orden?.querySelector<HTMLButtonElement>(`[data-paso="${paso}"]`);
    const otro = orden?.querySelector<HTMLButtonElement>(`[data-paso="${paso === 'subir' ? 'bajar' : 'subir'}"]`);
    (preferido && !preferido.disabled ? preferido : otro)?.focus();
  }, [nav]);

  async function hacer<T>(accion: () => Promise<T>, defecto: string): Promise<T | undefined> {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await accion();
      setNav(await api.navegacionSitio());
      alCambiar?.();
      return r;
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, defecto) });
      return undefined;
    } finally {
      setOcupado(false);
    }
  }

  async function mover(e: EnlaceSitio, hermanos: EnlaceSitio[], paso: -1 | 1) {
    const ids = moverBloque(hermanos.map((x) => x.id), e.id, paso);
    foco.current = `${e.id}:${paso === -1 ? 'subir' : 'bajar'}`;
    const nuevos = await hacer(() => api.ordenarEnlaces(e.zona, e.padreId, ids), 'No se pudo cambiar el orden');
    if (!nuevos) return void (foco.current = null);
    setAnuncio(`«${e.texto}» quedó en la posición ${nuevos.findIndex((x) => x.id === e.id) + 1} de ${nuevos.length}.`);
  }

  async function alternar(e: EnlaceSitio) {
    const r = await hacer(() => api.cambiarEnlace(e.id, { visible: !e.visible }), 'No se pudo cambiar la visibilidad');
    if (!r) return;
    const columna = e.zona === 'pie' && e.padreId === null;
    setAnuncio(`«${e.texto}» ${r.visible ? 'se muestra' : columna ? 'quedó oculta con todos sus enlaces' : 'quedó oculto; no se borra'}.`);
  }

  async function guardar(e: EnlaceSitio, texto: string, ruta: string | null): Promise<boolean> {
    const r = await hacer(() => api.cambiarEnlace(e.id, { texto, ruta }), 'No se pudo guardar el enlace');
    if (r) setAviso({ tipo: 'ok', texto: `«${r.texto}» se guardó.` });
    return Boolean(r);
  }

  async function agregar(n: NonNullable<Nuevo>, texto: string, ruta: string | null): Promise<boolean> {
    const r = await hacer(() => api.agregarEnlace({ zona: n.zona, texto, ...(n.padreId ? { padreId: n.padreId } : {}), ...(ruta ? { ruta } : {}) }), 'No se pudo agregar');
    if (!r) return false;
    setNuevo(null);
    setAviso({ tipo: 'ok', texto: `«${r.texto}» se agregó al final, oculto. Actívalo cuando esté listo.` });
    return true;
  }

  async function borrar(e: EnlaceSitio) {
    const r = await hacer(async () => { await api.borrarEnlace(e.id); return true; }, 'No se pudo borrar');
    if (!r) return;
    setBorrando(null);
    setAviso({ tipo: 'ok', texto: `«${e.texto}» se borró.` });
  }

  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!nav) return <p className="sec" role="status">Cargando el menú y el pie…</p>;
  const publico = navegacionPublica([...nav.menu, ...nav.pie, ...nav.pie.flatMap((c) => c.enlaces)]);

  const fila = (e: EnlaceSitio, hermanos: EnlaceSitio[], i: number, extra?: ReactNode) => {
    const columna = e.zona === 'pie' && e.padreId === null;
    const nombre = columna ? `columna ${e.texto}` : e.texto;
    return (
      <li key={e.id} data-enlace={e.id} className={`bloque-fila elemento-fila${e.visible ? '' : ' oculto'}`}>
        <div className="bloque-orden">
          <button type="button" className="boton icono" data-paso="subir" disabled={ocupado || i === 0} onClick={() => void mover(e, hermanos, -1)} aria-label={`Subir ${nombre}`}>↑</button>
          <button type="button" className="boton icono" data-paso="bajar" disabled={ocupado || i === hermanos.length - 1} onClick={() => void mover(e, hermanos, 1)} aria-label={`Bajar ${nombre}`}>↓</button>
        </div>
        <FormularioEnlace
          key={`${e.id}-${e.actualizadoEn}`} id={e.id} texto={e.texto} ruta={e.ruta} rutaOpcional={columna} ocupado={ocupado}
          etiqueta={`Editar ${nombre}`} alGuardar={(t, r) => guardar(e, t, r)}
        />
        <div className="elemento-acciones">
          {e.externo ? <span className="chip">Externo</span> : null}
          <button type="button" role="switch" className="interruptor" aria-checked={e.visible} disabled={ocupado} onClick={() => void alternar(e)} aria-label={`Mostrar ${nombre}`}><span aria-hidden="true" /></button>
          <span className="sec">{e.visible ? 'Visible' : 'Oculto'}</span>
          <button type="button" className="boton" disabled={ocupado} aria-expanded={borrando === e.id} onClick={() => setBorrando(borrando === e.id ? null : e.id)} aria-label={`Borrar ${nombre}`}>Borrar</button>
        </div>
        {borrando === e.id ? (
          <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${nombre}`}>
            <span>{columna ? `¿Borrar la columna «${e.texto}» con sus ${(e as Navegacion['pie'][number]).enlaces?.length ?? 0} enlaces?` : `¿Borrar «${e.texto}»?`} Para que no se vea basta con ocultarlo.</span>
            <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void borrar(e)}>Sí, borrar</button>
            <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
          </div>
        ) : null}
        {extra}
      </li>
    );
  };

  const formularioNuevo = (n: NonNullable<Nuevo>, etiqueta: string) =>
    nuevo && claveNuevo(nuevo) === claveNuevo(n) ? (
      <FormularioEnlace
        id={`nuevo-${claveNuevo(n)}`} texto="" ruta="" rutaOpcional={n.zona === 'pie' && n.padreId === null} ocupado={ocupado} etiqueta={etiqueta}
        alGuardar={(t, r) => agregar(n, t, r)} alCancelar={() => setNuevo(null)}
      />
    ) : null;

  const botonAgregar = (n: NonNullable<Nuevo>, texto: string, etiqueta: string) => (
    <button type="button" className="boton" disabled={ocupado || Boolean(nuevo && claveNuevo(nuevo) === claveNuevo(n))} onClick={() => { setNuevo(n); setAviso(null); }} aria-label={etiqueta}>{texto}</button>
  );

  return (
    <div className="navegacion-sitio" ref={contenedor}>
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      <p className="sr" aria-live="polite">{anuncio}</p>
      <section className="tarjeta" aria-labelledby="menu-principal-titulo">
        <div className="tarjeta-cabeza">
          <h2 id="menu-principal-titulo">Menú principal</h2>
          <span className="chip">{nav.menu.filter((e) => e.visible).length} visibles</span>
        </div>
        <p className="sec">Enlaces de la cabecera. El menú de celular usa la misma lista y el mismo orden.</p>
        {nav.menu.length === 0 ? <p className="nota">Aún no hay enlaces en el menú.</p> : (
          <ol className="lista-bloques" aria-label="Enlaces del menú principal">{nav.menu.map((e, i) => fila(e, nav.menu, i))}</ol>
        )}
        {formularioNuevo({ zona: 'menu', padreId: null }, 'Nuevo enlace del menú')}
        <div className="acciones-fila">{botonAgregar({ zona: 'menu', padreId: null }, 'Agregar enlace', 'Agregar enlace al menú')}</div>
        <p className="vista-navegacion" aria-label="En el sitio: menú principal">
          <b>En el sitio:</b> {publico.menu.length ? publico.menu.map((e) => e.texto).join(' · ') : 'el menú está vacío'}
        </p>
      </section>
      <section className="tarjeta" aria-labelledby="pie-pagina-titulo">
        <div className="tarjeta-cabeza">
          <h2 id="pie-pagina-titulo">Pie de página</h2>
          <span className="chip">{nav.pie.filter((c) => c.visible).length} columnas visibles</span>
        </div>
        <p className="sec">Columnas del pie con sus enlaces. Ocultar una columna oculta todos sus enlaces.</p>
        {nav.pie.length === 0 ? <p className="nota">Aún no hay columnas en el pie.</p> : (
          <ol className="lista-bloques" aria-label="Columnas del pie de página">
            {nav.pie.map((c, i) => fila(c, nav.pie, i, (
              <div className="columna-pie">
                {!c.visible && c.enlaces.length ? <p className="sec">La columna está oculta: ninguno de sus enlaces se ve en el sitio.</p> : null}
                {c.enlaces.length ? (
                  <ol className="lista-bloques" aria-label={`Enlaces de la columna ${c.texto}`}>{c.enlaces.map((e, j) => fila(e, c.enlaces, j))}</ol>
                ) : <p className="sec">Esta columna aún no tiene enlaces; no se ve en el sitio hasta tener uno visible.</p>}
                {formularioNuevo({ zona: 'pie', padreId: c.id }, `Nuevo enlace de la columna ${c.texto}`)}
                <div className="acciones-fila">{botonAgregar({ zona: 'pie', padreId: c.id }, 'Agregar enlace', `Agregar enlace a la columna ${c.texto}`)}</div>
              </div>
            )))}
          </ol>
        )}
        {formularioNuevo({ zona: 'pie', padreId: null }, 'Nueva columna del pie')}
        <div className="acciones-fila">{botonAgregar({ zona: 'pie', padreId: null }, 'Agregar columna', 'Agregar columna al pie')}</div>
        <p className="vista-navegacion" aria-label="En el sitio: pie de página">
          <b>En el sitio:</b> {publico.pie.length ? publico.pie.map((c) => `${c.titulo} (${c.enlaces.map((e) => e.texto).join(', ')})`).join(' · ') : 'el pie no muestra columnas'}
        </p>
      </section>
    </div>
  );
}

function FormularioEnlace({ id, texto: textoInicial, ruta: rutaInicial, rutaOpcional, ocupado, etiqueta, alGuardar, alCancelar }: {
  id: string; texto: string; ruta: string | null; rutaOpcional: boolean; ocupado: boolean; etiqueta: string;
  alGuardar: (texto: string, ruta: string | null) => Promise<boolean>; alCancelar?: () => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [ruta, setRuta] = useState(rutaInicial ?? '');
  const [error, setError] = useState('');
  const primero = useRef<HTMLInputElement>(null);
  const esNuevo = Boolean(alCancelar);
  useEffect(() => { if (esNuevo) primero.current?.focus(); }, [esNuevo]);
  const cambiado = texto !== textoInicial || ruta !== (rutaInicial ?? '');
  const base = `enlace-${id}`;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = validarTextoEnlace(texto);
    if (!t.ok) return setError(t.mensaje);
    const sinRuta = rutaOpcional && ruta.trim() === '';
    const r = sinRuta ? null : validarRuta(ruta);
    if (r && !r.ok) return setError(r.mensaje);
    setError('');
    await alGuardar(t.texto, r ? r.ruta : null);
  }

  return (
    <form className="elemento-campos" onSubmit={enviar} aria-label={etiqueta} noValidate>
      <label className="campo" htmlFor={`${base}-texto`}>
        {rutaOpcional ? 'Título' : 'Texto'}
        <input id={`${base}-texto`} ref={primero} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={60} />
      </label>
      <label className="campo" htmlFor={`${base}-ruta`}>
        Ruta{rutaOpcional ? ' (opcional)' : ''}
        <input id={`${base}-ruta`} value={ruta} onChange={(e) => setRuta(e.target.value)} maxLength={300} spellCheck={false} autoCapitalize="none" placeholder="/precios o https://" />
      </label>
      <div className="elemento-acciones elemento-guardar">
        <button type="submit" className="boton primario" disabled={ocupado || (!esNuevo && !cambiado)}>{esNuevo ? 'Agregar' : 'Guardar'}</button>
        {alCancelar ? <button type="button" className="boton" onClick={alCancelar}>Cancelar</button> : null}
        {error ? <p className="nota error" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
