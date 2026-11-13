// HU-1504 · Sitio web › Contenido (PNT-27, REQ-066): las 7 colecciones que usan los bloques (cifras, testimonios, logos,
// funcionalidades, pasos, LMS y preguntas), una pestaña por colección. Cada elemento se edita y guarda, se sube o baja
// con flechas (dedo, ratón y teclado), se muestra u oculta y se borra con confirmación. Un elemento nuevo entra oculto
// (RN-16-2, CP-115); ocultarlo lo quita de todas las páginas sin borrar sus datos (CP-114). Solo texto (RN-16-7).
// HU-1505 · Casilla «Ficticio» y distintivo por elemento, contador de ficticios visibles del sitio y aviso con «Ocultar
// todos los ficticios» (RN-16-3). Portada y Llamada final, con los ajustes del sitio (SUP-178).
import { moverBloque } from '@aptio/schema/sitio-bloques';
import { type CampoContenido, type Coleccion, COLECCIONES, COLECCIONES_CONTENIDO, camposDe, validarDatos } from '@aptio/schema/sitio-contenido';
import { Cabecera } from '@aptio/ui';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api, type ElementoSitio, ErrorApi, type FicticiosSitio } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Borrador = Record<string, string>;

const aBorrador = (c: Coleccion, datos: Record<string, string | number>): Borrador =>
  Object.fromEntries(camposDe(c).map((f) => [f.clave, datos[f.clave] === undefined ? '' : String(datos[f.clave])]));

/** Pasa el borrador del formulario a datos: números en los enteros, y vacíos como '' para quitar opcionales. */
const aDatos = (c: Coleccion, b: Borrador): Record<string, string | number> =>
  Object.fromEntries(camposDe(c).map((f) => [f.clave, f.tipo === 'entero' && b[f.clave]!.trim() !== '' ? Number(b[f.clave]) : b[f.clave]!]));

/** Título corto del elemento para etiquetas accesibles y avisos. */
const titulo = (c: Coleccion, datos: Record<string, string | number>) => String(datos[camposDe(c)[0]!.clave] ?? COLECCIONES_CONTENIDO[c].singular);

export function SitioContenido() {
  const [coleccion, setColeccion] = useState<Coleccion>('cifras');
  const [elementos, setElementos] = useState<ElementoSitio[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ficticios, setFicticios] = useState<FicticiosSitio | null>(null);
  const foco = useRef<string | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const pestanas = useRef<HTMLDivElement>(null);
  const info = COLECCIONES_CONTENIDO[coleccion];

  const refrescarFicticios = () => api.ficticiosSitio().then(setFicticios, () => undefined);
  useEffect(() => { void refrescarFicticios(); }, []);

  useEffect(() => {
    let vigente = true;
    api.elementosSitio(coleccion).then((l) => { if (vigente) setElementos(l); }, (e: unknown) => { if (vigente) setError(mensajeDe(e, 'No se pudo cargar el contenido')); });
    return () => { vigente = false; };
  }, [coleccion]);

  // Tras mover, el foco sigue al elemento movido (la flecha usada o, en un extremo, la otra).
  useEffect(() => {
    const destino = foco.current;
    if (!destino || !lista.current) return;
    foco.current = null;
    const [id, paso] = destino.split(':');
    const fila = lista.current.querySelector<HTMLElement>(`[data-elemento="${id}"]`);
    const preferido = fila?.querySelector<HTMLButtonElement>(`[data-paso="${paso}"]`);
    const otro = fila?.querySelector<HTMLButtonElement>(`[data-paso="${paso === 'subir' ? 'bajar' : 'subir'}"]`);
    (preferido && !preferido.disabled ? preferido : otro)?.focus();
  }, [elementos]);

  function elegir(c: Coleccion) {
    if (c === coleccion) return;
    setElementos(null);
    setError('');
    setColeccion(c);
    setAviso(null);
    setNuevo(false);
    setBorrando(null);
  }

  // Flechas izquierda y derecha, Inicio y Fin entre pestañas (patrón ARIA de pestañas).
  function teclaPestana(e: KeyboardEvent<HTMLButtonElement>) {
    const i = COLECCIONES.indexOf(coleccion);
    const destino = e.key === 'ArrowRight' ? (i + 1) % COLECCIONES.length : e.key === 'ArrowLeft' ? (i - 1 + COLECCIONES.length) % COLECCIONES.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? COLECCIONES.length - 1 : -1;
    if (destino < 0) return;
    e.preventDefault();
    elegir(COLECCIONES[destino]!);
    pestanas.current?.querySelector<HTMLButtonElement>(`#pestana-${COLECCIONES[destino]}`)?.focus();
  }

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

  const reemplazar = (x: ElementoSitio) => setElementos((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)));

  async function mover(x: ElementoSitio, paso: -1 | 1) {
    if (!elementos) return;
    const ids = moverBloque(elementos.map((y) => y.id), x.id, paso);
    const nuevos = await hacer(() => api.ordenarElementos(coleccion, ids), 'No se pudo cambiar el orden');
    if (!nuevos) return;
    foco.current = `${x.id}:${paso === -1 ? 'subir' : 'bajar'}`;
    setElementos(nuevos);
    setAnuncio(`«${titulo(coleccion, x.datos)}» quedó en la posición ${nuevos.findIndex((y) => y.id === x.id) + 1} de ${nuevos.length}.`);
  }

  async function alternar(x: ElementoSitio) {
    const r = await hacer(() => api.cambiarElemento(x.id, { visible: !x.visible }), 'No se pudo cambiar la visibilidad');
    if (!r) return;
    reemplazar(r);
    setAnuncio(`«${titulo(coleccion, r.datos)}» ${r.visible ? 'se muestra en el sitio' : 'quedó oculto en todas las páginas; sus datos se conservan'}.`);
    if (r.ficticio) void refrescarFicticios();
  }

  async function marcarFicticio(x: ElementoSitio, ficticio: boolean) {
    const r = await hacer(() => api.cambiarElemento(x.id, { ficticio }), 'No se pudo cambiar la marca de ficticio');
    if (!r) return;
    reemplazar(r);
    setAnuncio(`«${titulo(coleccion, r.datos)}» ${ficticio ? 'quedó marcado como ficticio' : 'ya no está marcado como ficticio'}.`);
    void refrescarFicticios();
  }

  async function ocultarFicticios() {
    const r = await hacer(() => api.ocultarFicticios(), 'No se pudieron ocultar los ficticios');
    if (!r) return;
    setFicticios(r);
    setElementos((l) => (l ?? []).map((y) => (y.ficticio ? { ...y, visible: false } : y)));
    setAviso({ tipo: 'ok', texto: r.ocultados === 1 ? 'Se ocultó 1 dato ficticio.' : `Se ocultaron ${r.ocultados} datos ficticios.` });
  }

  async function guardar(x: ElementoSitio, datos: Record<string, string | number>): Promise<boolean> {
    const r = await hacer(() => api.cambiarElemento(x.id, { datos }), 'No se pudieron guardar los cambios');
    if (!r) return false;
    reemplazar(r);
    setAviso({ tipo: 'ok', texto: `Se guardó «${titulo(coleccion, r.datos)}».` });
    return true;
  }

  async function agregar(datos: Record<string, string | number>): Promise<boolean> {
    const r = await hacer(() => api.agregarElemento(coleccion, datos), 'No se pudo agregar');
    if (!r) return false;
    setElementos((l) => [...(l ?? []), r]);
    setNuevo(false);
    setAviso({ tipo: 'ok', texto: `«${titulo(coleccion, r.datos)}» se agregó al final, oculto. Actívalo cuando esté listo.` });
    return true;
  }

  async function borrar(x: ElementoSitio) {
    const ok = await hacer(async () => { await api.borrarElemento(x.id); return true; }, 'No se pudo borrar');
    if (!ok) return;
    setBorrando(null);
    setElementos((l) => (l ?? []).filter((y) => y.id !== x.id).map((y, orden) => ({ ...y, orden })));
    setAviso({ tipo: 'ok', texto: `«${titulo(coleccion, x.datos)}» se borró.` });
    if (x.ficticio) void refrescarFicticios();
  }

  const visibles = elementos?.filter((x) => x.visible).length ?? 0;
  const nFicticios = ficticios?.ficticios.length ?? 0;
  const contador = ficticios ? <p className="contador-ficticios">Datos ficticios visibles: <b>{nFicticios}</b></p> : undefined;
  return (
    <>
      <Cabecera titulo="Contenido" subtitulo="Textos y datos que usan los bloques de todas las páginas. Un elemento nuevo entra oculto; lo oculto se guarda y no aparece en ninguna página." accion={contador} />
      {nFicticios > 0 && ficticios ? (
        <div className="nota aviso confirmar-fila" role="region" aria-label="Datos ficticios visibles">
          <span>
            {nFicticios === 1 ? 'Hay 1 dato ficticio visible.' : `Hay ${nFicticios} datos ficticios visibles.`}{' '}
            {ficticios.entorno === 'produccion'
              ? 'En producción no se puede publicar ninguna página mientras sigan visibles, y el sitio no los muestra.'
              : 'En pruebas se publica igual, con aviso; en producción quedaría bloqueado.'}
          </span>
          <button type="button" className="boton" disabled={ocupado} onClick={() => void ocultarFicticios()}>Ocultar todos los ficticios</button>
        </div>
      ) : null}
      <div className="opciones" role="tablist" aria-label="Colecciones de contenido" ref={pestanas}>
        {COLECCIONES.map((c) => (
          <button key={c} type="button" role="tab" id={`pestana-${c}`} className="opcion" aria-selected={coleccion === c} aria-controls="panel-contenido"
            tabIndex={coleccion === c ? 0 : -1} onClick={() => elegir(c)} onKeyDown={teclaPestana}>{COLECCIONES_CONTENIDO[c].nombre}</button>
        ))}
      </div>
      <p className="sr" role="status" aria-live="polite">{anuncio}</p>
      <section className="tarjeta" role="tabpanel" id="panel-contenido" aria-labelledby={`pestana-${coleccion}`}>
        <div className="tarjeta-cabeza">
          <h2>{info.nombre}</h2>
          <div className="elemento-acciones">
            {elementos ? <span className="chip">{visibles} visibles</span> : null}
            <button type="button" className="boton primario" disabled={nuevo || !elementos} onClick={() => { setNuevo(true); setAviso(null); }}>Agregar</button>
          </div>
        </div>
        {error ? <div className="nota error" role="alert">{error}</div> : null}
        {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
        {nuevo ? <FormularioElemento key={`nuevo-${coleccion}`} id="nuevo" coleccion={coleccion} ocupado={ocupado} etiqueta={`Nuevo elemento de ${info.nombre}`} alGuardar={agregar} alCancelar={() => setNuevo(false)} /> : null}
        {!elementos ? (!error ? <p className="sec" role="status">Cargando…</p> : null)
          : elementos.length === 0 && !nuevo ? <p className="nota">Aún no hay elementos en {info.nombre}. Agrega el primero con «Agregar».</p>
          : (
            <ol className="lista-bloques" ref={lista} aria-label={`Elementos de ${info.nombre}`}>
              {elementos.map((x, i) => {
                const nombre = titulo(coleccion, x.datos);
                return (
                  <li key={x.id} data-elemento={x.id} className={`bloque-fila elemento-fila${x.visible ? '' : ' oculto'}`}>
                    <div className="bloque-orden">
                      <button type="button" className="boton icono" data-paso="subir" disabled={ocupado || i === 0} onClick={() => void mover(x, -1)} aria-label={`Subir ${nombre}`}>↑</button>
                      <button type="button" className="boton icono" data-paso="bajar" disabled={ocupado || i === elementos.length - 1} onClick={() => void mover(x, 1)} aria-label={`Bajar ${nombre}`}>↓</button>
                    </div>
                    <FormularioElemento
                      key={`${x.id}-${x.actualizadoEn}`} id={x.id} coleccion={coleccion} datos={x.datos} ocupado={ocupado} etiqueta={`Editar ${nombre}`}
                      alGuardar={(d) => guardar(x, d)}
                    />
                    <div className="elemento-acciones">
                      {x.ficticio ? <span className="chip aviso">Ficticio</span> : null}
                      <label className="casilla"><input type="checkbox" checked={x.ficticio} disabled={ocupado} onChange={(ev) => void marcarFicticio(x, ev.target.checked)} aria-label={`Ficticio: ${nombre}`} /> Ficticio</label>
                      <button type="button" role="switch" className="interruptor" aria-checked={x.visible} disabled={ocupado} onClick={() => void alternar(x)} aria-label={`Mostrar ${nombre}`}><span aria-hidden="true" /></button>
                      <span className="sec">{x.visible ? 'Visible' : 'Oculto'}</span>
                      <button type="button" className="boton" disabled={ocupado} aria-expanded={borrando === x.id} onClick={() => setBorrando(borrando === x.id ? null : x.id)} aria-label={`Borrar ${nombre}`}>Borrar</button>
                    </div>
                    {borrando === x.id ? (
                      <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${nombre}`}>
                        <span>¿Borrar «{nombre}»? Se pierden sus datos. Para que no se vea basta con ocultarlo.</span>
                        <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void borrar(x)}>Sí, borrar</button>
                        <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
      </section>
    </>
  );
}

function FormularioElemento({ id: idElemento, coleccion, datos, ocupado, etiqueta, alGuardar, alCancelar }: {
  id: string; coleccion: Coleccion; datos?: Record<string, string | number>; ocupado: boolean; etiqueta: string;
  alGuardar: (datos: Record<string, string | number>) => Promise<boolean>; alCancelar?: () => void;
}) {
  const inicial = aBorrador(coleccion, datos ?? {});
  const [borrador, setBorrador] = useState<Borrador>(inicial);
  const [error, setError] = useState('');
  const primero = useRef<HTMLInputElement>(null);
  const esNuevo = !datos;
  useEffect(() => { if (esNuevo) primero.current?.focus(); }, [esNuevo]);
  const cambiado = camposDe(coleccion).some((f) => borrador[f.clave] !== inicial[f.clave]);
  const idBase = `elemento-${idElemento}`;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const d = aDatos(coleccion, borrador);
    const r = validarDatos(coleccion, esNuevo ? Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '')) : d, !esNuevo);
    if (!r.ok) return setError(r.errores.map((x) => x.mensaje).join('. '));
    setError('');
    await alGuardar(d);
  }

  return (
    <form className="elemento-campos" onSubmit={enviar} aria-label={etiqueta} noValidate>
      {camposDe(coleccion).map((f: CampoContenido, i) => {
        const id = `${idBase}-${f.clave}`;
        const comunes = { id, value: borrador[f.clave], onChange: (ev: { target: { value: string } }) => setBorrador((b) => ({ ...b, [f.clave]: ev.target.value })) };
        const ancho = f.tipo === 'parrafo' || f.tipo === 'lista';
        return (
          <label key={f.clave} className={`campo${ancho ? ' ancho' : ''}`} htmlFor={id}>
            {f.etiqueta}{f.opcional ? ' (opcional)' : ''}
            {ancho ? <textarea {...comunes} maxLength={f.max} rows={f.tipo === 'lista' ? 3 : 2} />
              : f.tipo === 'entero' ? <input {...comunes} type="number" min={f.min} max={f.max} inputMode="numeric" />
              : <input {...comunes} ref={i === 0 ? primero : undefined} maxLength={f.max} spellCheck={f.tipo !== 'ruta'} />}
          </label>
        );
      })}
      <div className="elemento-acciones elemento-guardar">
        <button type="submit" className="boton primario" disabled={ocupado || (!esNuevo && !cambiado)}>Guardar</button>
        {alCancelar ? <button type="button" className="boton" onClick={alCancelar}>Cancelar</button> : null}
        {error ? <p className="nota error" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
