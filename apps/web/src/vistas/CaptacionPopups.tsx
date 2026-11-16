// HU-1603 · Captación › Popups (PNT-31, REQ-076, RN-17-3): la tabla de popups con su tipo, disparador, páginas,
// impresiones y conversión, el interruptor «Activar popup», el orden, «Probar en el sitio», el reinicio de resultados y
// el borrado; y el formulario de alta y edición con el resumen de sus reglas. Los popups se leen en vivo desde el sitio:
// activar o apagar uno no pide publicar. Solo el superadmin (ADR-011).
import {
  ACCIONES_POPUP, DISPARADORES_POPUP, type DatosPopup, ETIQUETA_ACCION, ETIQUETA_DISPARADOR, ETIQUETA_TIPO_POPUP, FRECUENCIA_MINIMA_DIAS, LIMITES_POPUP, POPUP_NUEVO,
  PREFIJO_ANCLA_POPUP, PREFIJO_PAGO, textoDisparador, textoPaginas, TIPOS_POPUP, UNIDAD_DISPARADOR, validarPopup,
} from '@aptio/schema/popups';
import { Cabecera } from '@aptio/ui';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi, type PopupSitio } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const numero = (n: number) => n.toLocaleString('es-PE');
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Edicion = { modo: 'nuevo' } | { modo: 'editar'; id: string } | null;

/** La página donde probar el popup: la primera ruta exacta de sus páginas (o el inicio), en su idioma. */
function rutaDePrueba(p: PopupSitio): string {
  const exacta = p.paginas.find((x) => x !== '*' && !x.endsWith('/*'));
  const conComodin = p.paginas.find((x) => x.endsWith('/*'));
  const ruta = exacta ?? (conComodin ? conComodin.slice(0, -2) || '/' : '/');
  const prefijo = p.idioma === 'en' ? '/en' : '';
  return `/s${prefijo}${ruta === '/' ? (prefijo ? '' : '/') : ruta}#${PREFIJO_ANCLA_POPUP}${p.id}`;
}

export function CaptacionPopups() {
  const [popups, setPopups] = useState<PopupSitio[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const formulario = useRef<HTMLElement>(null);

  useEffect(() => {
    void api.popups().then((r) => setPopups(r.popups), (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los popups')));
  }, []);
  useEffect(() => {
    if (edicion) formulario.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [edicion]);

  /** Corre un cambio, reemplaza el popup en la lista y avisa. Devuelve si salió bien. */
  async function hacer(accion: () => Promise<PopupSitio>, ok: (p: PopupSitio) => string, fallo: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    try {
      const p = await accion();
      setPopups((xs) => (xs ? (xs.some((x) => x.id === p.id) ? xs.map((x) => (x.id === p.id ? p : x)) : [...xs, p]) : [p]));
      setAviso({ tipo: 'ok', texto: ok(p) });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function mover(p: PopupSitio, paso: -1 | 1) {
    if (!popups) return;
    const i = popups.findIndex((x) => x.id === p.id);
    const ids = popups.map((x) => x.id);
    [ids[i], ids[i + paso]] = [ids[i + paso]!, ids[i]!];
    setOcupado(true);
    setAviso(null);
    try {
      setPopups((await api.ordenarPopups(ids)).popups);
      setAviso({ tipo: 'ok', texto: `«${p.nombre}» quedó en la posición ${i + paso + 1}.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se cambió el orden: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(p: PopupSitio) {
    setOcupado(true);
    setAviso(null);
    try {
      await api.borrarPopup(p.id);
      setPopups((xs) => (xs ?? []).filter((x) => x.id !== p.id).map((x, orden) => ({ ...x, orden })));
      setBorrando(null);
      if (edicion?.modo === 'editar' && edicion.id === p.id) setEdicion(null);
      setAviso({ tipo: 'ok', texto: `Se borró «${p.nombre}».` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se borró: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setOcupado(false);
    }
  }

  const editado = edicion?.modo === 'editar' ? popups?.find((p) => p.id === edicion.id) : undefined;

  return (
    <>
      <Cabecera titulo="Popups" subtitulo="Ventanas emergentes, barras y deslizables con disparador, páginas y resultado."
        accion={<button type="button" className="boton primario" disabled={!popups || edicion?.modo === 'nuevo'} onClick={() => { setEdicion({ modo: 'nuevo' }); setAviso(null); }}>Nuevo popup</button>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {edicion ? (
        <section className="tarjeta" ref={formulario} aria-labelledby="popup-form-titulo">
          <div className="tarjeta-cabeza"><h2 id="popup-form-titulo">{editado ? `Editar · ${editado.nombre}` : 'Nuevo popup'}</h2></div>
          <FormularioPopup
            key={editado ? `${editado.id}-${editado.actualizadoEn}` : 'nuevo'} inicial={editado ?? POPUP_NUEVO} ocupado={ocupado}
            alCancelar={() => setEdicion(null)}
            alGuardar={async (d) => {
              const ok = editado
                ? await hacer(() => api.cambiarPopup(editado.id, d), (p) => `Se guardó «${p.nombre}».`, 'No se guardó el popup')
                : await hacer(() => api.crearPopup(d), (p) => `Se creó «${p.nombre}», apagado: actívalo cuando quieras que se vea.`, 'No se creó el popup');
              if (ok) setEdicion(null);
            }}
          />
        </section>
      ) : null}
      <section className="tarjeta" aria-labelledby="popups-titulo">
        <div className="tarjeta-cabeza"><h2 id="popups-titulo">Popups del sitio</h2>{popups ? <span className="chip">{popups.filter((p) => p.visible).length} activos</span> : null}</div>
        {!popups ? (!error ? <p className="sec" role="status">Cargando los popups…</p> : null) : popups.length === 0 ? (
          <p className="nota">Aún no hay popups. Crea el primero con «Nuevo popup».</p>
        ) : (
          <div className="tabla-costos">
            <table aria-label="Popups del sitio" className="tabla-popups">
              <thead>
                <tr>
                  <th scope="col">Popup</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Disparador</th>
                  <th scope="col">Páginas</th>
                  <th scope="col" className="num">Impresiones</th>
                  <th scope="col" className="num">Conversión</th>
                  <th scope="col">Activo</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {popups.map((p, i) => (
                  <tr key={p.id} className={p.visible ? '' : 'oculto'}>
                    <th scope="row">
                      <b>{p.nombre}</b>
                      {p.ficticio ? <span className="chip aviso leads-contactos">Ficticio</span> : null}
                      <span className="sec leads-linea">{p.titulo}</span>
                      <span className="sec leads-linea">{p.idioma === 'en' ? 'Inglés' : 'Español'} · {ETIQUETA_ACCION[p.accion]}{p.enlaceDestino ? ` ${p.enlaceDestino}` : ''}</span>
                    </th>
                    <td><span className="chip">{ETIQUETA_TIPO_POPUP[p.tipo]}</span></td>
                    <td>{textoDisparador(p.disparador, p.valorDisparador)}<span className="sec leads-linea">Cada {p.frecuenciaDias} días</span></td>
                    <td><span className="seo-ruta">{textoPaginas(p.paginas)}</span></td>
                    <td className="num">{numero(p.impresiones)}</td>
                    <td className="num">{p.tasaConversion === null ? '—' : `${p.tasaConversion.toLocaleString('es-PE')} %`}<span className="sec leads-linea">{numero(p.conversiones)} conversiones</span></td>
                    <td>
                      <div className="fila-interruptor">
                        <button type="button" role="switch" className="interruptor" aria-checked={p.visible} disabled={ocupado} aria-label={`Activar popup ${p.nombre}`}
                          onClick={() => void hacer(() => api.cambiarPopup(p.id, { visible: !p.visible }), (x) => `«${x.nombre}» quedó ${x.visible ? 'activo: ya se ve en el sitio' : 'apagado: ya no se muestra'}.`, `No se pudo ${p.visible ? 'apagar' : 'activar'} «${p.nombre}»`)}>
                          <span aria-hidden="true" />
                        </button>
                        <span className="sec">{p.visible ? 'Activo' : 'Apagado'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="popup-acciones">
                        <button type="button" className="boton icono" disabled={ocupado || i === 0} onClick={() => void mover(p, -1)} aria-label={`Subir ${p.nombre}`}>↑</button>
                        <button type="button" className="boton icono" disabled={ocupado || i === popups.length - 1} onClick={() => void mover(p, 1)} aria-label={`Bajar ${p.nombre}`}>↓</button>
                        <button type="button" className="boton chico" disabled={ocupado} onClick={() => { setEdicion({ modo: 'editar', id: p.id }); setAviso(null); }} aria-label={`Editar ${p.nombre}`}>Editar</button>
                        {p.visible ? (
                          <a className="boton chico" href={rutaDePrueba(p)} target="_blank" rel="noopener" aria-label={`Probar en el sitio: ${p.nombre} (se abre en una pestaña nueva)`}>Probar en el sitio</a>
                        ) : null}
                        <button type="button" className="boton chico" disabled={ocupado || (p.impresiones === 0 && p.conversiones === 0)} aria-label={`Reiniciar resultados de ${p.nombre}`}
                          onClick={() => void hacer(() => api.reiniciarPopup(p.id), (x) => `Los resultados de «${x.nombre}» volvieron a 0.`, 'No se reiniciaron los resultados')}>Reiniciar</button>
                        <button type="button" className="boton chico" disabled={ocupado} aria-expanded={borrando === p.id} onClick={() => setBorrando(borrando === p.id ? null : p.id)} aria-label={`Borrar ${p.nombre}`}>Borrar</button>
                      </div>
                      {borrando === p.id ? (
                        <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${p.nombre}`}>
                          <span>¿Borrar «{p.nombre}» y sus resultados? Para que no se vea basta con apagarlo.</span>
                          <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void borrar(p)}>Sí, borrar</button>
                          <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sec leads-pie">
          Cada visitante ve un popup como máximo una vez cada {FRECUENCIA_MINIMA_DIAS} días (o lo que diga su frecuencia), uno por página y nunca en el pago. Si deja su correo, no se le vuelve
          a mostrar. Los correos entran a Leads con origen «Popup». Activar o apagar un popup vale en menos de un minuto, sin publicar.
        </p>
      </section>
    </>
  );
}

type Borrador = Omit<DatosPopup, 'paginas' | 'valorDisparador' | 'enlaceDestino' | 'frecuenciaDias'> & { paginas: string; valorDisparador: string; enlaceDestino: string; frecuenciaDias: string };

const aBorrador = (d: DatosPopup): Borrador => ({
  ...d, paginas: d.paginas.join('\n'), valorDisparador: d.valorDisparador === null ? '' : String(d.valorDisparador), enlaceDestino: d.enlaceDestino ?? '', frecuenciaDias: String(d.frecuenciaDias),
});

const aDatos = (b: Borrador): Record<string, unknown> => ({
  ...b,
  paginas: b.paginas.split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
  valorDisparador: UNIDAD_DISPARADOR[b.disparador] ? (b.valorDisparador.trim() === '' ? null : Number(b.valorDisparador)) : null,
  enlaceDestino: b.accion === 'enlace_interno' ? b.enlaceDestino.trim() : null,
  frecuenciaDias: Number(b.frecuenciaDias),
});

/** El resumen de las reglas del popup, en una frase. */
function reglas(b: Borrador): string {
  const paginas = b.paginas.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const dias = Math.max(FRECUENCIA_MINIMA_DIAS, Number(b.frecuenciaDias) || FRECUENCIA_MINIMA_DIAS);
  const valor = Number(b.valorDisparador);
  const cuando = textoDisparador(b.disparador, UNIDAD_DISPARADOR[b.disparador] && Number.isFinite(valor) && b.valorDisparador !== '' ? valor : null);
  const extra = b.disparador === 'intencion_salida' ? ' En celulares y tabletas no se muestra solo.' : b.disparador === 'clic_elemento' ? ` Se abre con un enlace a #${PREFIJO_ANCLA_POPUP}… en el contenido.` : '';
  return `${ETIQUETA_TIPO_POPUP[b.tipo]} en ${paginas.length ? textoPaginas(paginas) : '(sin páginas)'} (${b.idioma === 'en' ? 'inglés' : 'español'}) · ${cuando} · una vez cada ${dias} días por visitante · nunca en ${PREFIJO_PAGO}.${extra}`;
}

function FormularioPopup({ inicial, ocupado, alGuardar, alCancelar }: { inicial: DatosPopup; ocupado: boolean; alGuardar: (d: Partial<DatosPopup>) => Promise<void>; alCancelar: () => void }) {
  const [b, setB] = useState<Borrador>(aBorrador(inicial));
  const [errores, setErrores] = useState<string[]>([]);
  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const unidad = UNIDAD_DISPARADOR[b.disparador];
  const disparadores = b.tipo === 'barra' ? (['al_cargar'] as const) : DISPARADORES_POPUP;

  return (
    <form className="formulario-ajustes formulario-popup" aria-label="Datos del popup" noValidate onSubmit={(e) => {
      e.preventDefault();
      const r = validarPopup(aDatos(b));
      if (!r.ok) {
        setErrores(r.errores.map((x) => x.mensaje));
        return;
      }
      setErrores([]);
      const { visible: _v, ...datos } = r.datos;
      void alGuardar(datos);
    }}>
      {errores.length ? (
        <div className="nota error" role="alert">
          <p>Revisa el popup:</p>
          <ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
      <div className="popup-campos">
        <p className="campo"><label htmlFor="popup-nombre">Nombre interno</label><input id="popup-nombre" type="text" value={b.nombre} maxLength={LIMITES_POPUP.nombre} onChange={(e) => cambiar('nombre', e.target.value)} /></p>
        <p className="campo">
          <label htmlFor="popup-tipo">Tipo</label>
          <select id="popup-tipo" value={b.tipo} onChange={(e) => {
            const tipo = e.target.value as Borrador['tipo'];
            setB((x) => ({ ...x, tipo, ...(tipo === 'barra' ? { disparador: 'al_cargar' as const } : {}) }));
          }}>
            {TIPOS_POPUP.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_POPUP[t]}</option>)}
          </select>
        </p>
        <p className="campo">
          <label htmlFor="popup-idioma">Idioma</label>
          <select id="popup-idioma" value={b.idioma} onChange={(e) => cambiar('idioma', e.target.value as Borrador['idioma'])}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </p>
        <p className="campo">
          <label htmlFor="popup-disparador">Disparador</label>
          <select id="popup-disparador" value={b.disparador} aria-describedby={b.tipo === 'barra' ? 'popup-disparador-ayuda' : undefined} onChange={(e) => {
            const disparador = e.target.value as Borrador['disparador'];
            const u = UNIDAD_DISPARADOR[disparador];
            setB((x) => ({ ...x, disparador, valorDisparador: u ? (x.valorDisparador || (disparador === 'tiempo' ? '15' : '50')) : '' }));
          }}>
            {disparadores.map((d) => <option key={d} value={d}>{ETIQUETA_DISPARADOR[d]}</option>)}
          </select>
          {b.tipo === 'barra' ? <span id="popup-disparador-ayuda" className="sec">La barra se muestra al cargar la página.</span> : null}
        </p>
        {unidad ? (
          <p className="campo">
            <label htmlFor="popup-valor">{b.disparador === 'tiempo' ? 'Segundos' : 'Porcentaje desplazado'}</label>
            <input id="popup-valor" type="number" inputMode="numeric" min={unidad.min} max={unidad.max} value={b.valorDisparador} onChange={(e) => cambiar('valorDisparador', e.target.value)} />
          </p>
        ) : null}
        <p className="campo">
          <label htmlFor="popup-frecuencia">Frecuencia (días)</label>
          <input id="popup-frecuencia" type="number" inputMode="numeric" min={FRECUENCIA_MINIMA_DIAS} max={LIMITES_POPUP.frecuenciaMaxDias} value={b.frecuenciaDias} aria-describedby="popup-frecuencia-ayuda" onChange={(e) => cambiar('frecuenciaDias', e.target.value)} />
          <span id="popup-frecuencia-ayuda" className="sec">Mínimo {FRECUENCIA_MINIMA_DIAS} días por visitante.</span>
        </p>
      </div>
      <p className="campo">
        <label htmlFor="popup-paginas">Páginas</label>
        <textarea id="popup-paginas" rows={3} value={b.paginas} aria-describedby="popup-paginas-ayuda" spellCheck={false} onChange={(e) => cambiar('paginas', e.target.value)} />
        <span id="popup-paginas-ayuda" className="sec">Una ruta por línea: / para el inicio, /precios, /blog/* para el blog y lo que cuelga de él, o * para todo el sitio.</span>
      </p>
      <p className="campo"><label htmlFor="popup-titulo">Título</label><input id="popup-titulo" type="text" value={b.titulo} maxLength={LIMITES_POPUP.titulo} onChange={(e) => cambiar('titulo', e.target.value)} /></p>
      <p className="campo"><label htmlFor="popup-texto">Texto</label><textarea id="popup-texto" rows={2} value={b.texto} maxLength={LIMITES_POPUP.texto} onChange={(e) => cambiar('texto', e.target.value)} /></p>
      <div className="popup-campos">
        <p className="campo"><label htmlFor="popup-boton">Botón</label><input id="popup-boton" type="text" value={b.boton} maxLength={LIMITES_POPUP.boton} onChange={(e) => cambiar('boton', e.target.value)} /></p>
        <p className="campo">
          <label htmlFor="popup-accion">Al pulsar el botón</label>
          <select id="popup-accion" value={b.accion} onChange={(e) => cambiar('accion', e.target.value as Borrador['accion'])}>
            {ACCIONES_POPUP.map((a) => <option key={a} value={a}>{ETIQUETA_ACCION[a]}</option>)}
          </select>
        </p>
        {b.accion === 'enlace_interno' ? (
          <p className="campo"><label htmlFor="popup-enlace">Enlace del sitio</label><input id="popup-enlace" type="text" value={b.enlaceDestino} placeholder="/agendar-demo" spellCheck={false} onChange={(e) => cambiar('enlaceDestino', e.target.value)} /></p>
        ) : null}
      </div>
      {b.accion === 'pedir_correo' ? <p className="sec">Pide el correo con la casilla de consentimiento (Ley 29733) y lo guarda en Leads con origen «Popup».</p> : null}
      <label className="casilla"><input type="checkbox" checked={b.ficticio} onChange={(e) => cambiar('ficticio', e.target.checked)} /> Dato ficticio (nunca se muestra en producción)</label>
      <p className="nota popup-reglas"><b>Reglas:</b> {reglas(b)}</p>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar popup</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
