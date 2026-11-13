// HU-1512 · Sitio web › SEO (PNT-29, REQ-071): la revisión automática de problemas (páginas sin descripción, títulos o
// descripciones largos, páginas sin indexar y redirecciones rotas), cada uno con su enlace para corregir; las
// redirecciones 301 (agregar, activar o desactivar con un interruptor y borrar con confirmación, CP-124) y robots.txt
// (la base del sistema y las reglas extra). Todo llega al sitio con «Publicar cambios». Solo el superadmin (ADR-011).
import { validarRedireccion, validarRobotsExtra } from '@aptio/schema/sitio-seo';
import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ErrorApi, type ProblemaSeo, type RedireccionSitio, type SeoSitio } from '../api';
import { navegar } from '../ruta';
import { usePublicacionSitio } from './publicacion-sitio';
import { AccionPublicar, AvisosPublicacion } from './SitioVersiones';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
const SEVERIDAD: Record<ProblemaSeo['severidad'], { texto: string; chip: string }> = {
  alta: { texto: 'Alta', chip: 'error' }, media: { texto: 'Media', chip: 'aviso' }, baja: { texto: 'Baja', chip: '' },
};
const AL_PUBLICAR = 'Llega al sitio con «Publicar cambios».';
const activas = (lista: RedireccionSitio[]) => {
  const n = lista.filter((r) => r.activa).length;
  return n === 1 ? '1 activa' : `${n} activas`;
};

export function SitioSeo() {
  const [seo, setSeo] = useState<SeoSitio | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [resaltada, setResaltada] = useState<string | null>(null);
  const publicacion = usePublicacionSitio();
  const tabla = useRef<HTMLTableElement>(null);

  const cargar = () => api.seoSitio().then((s) => { setSeo(s); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el SEO del sitio')));
  useEffect(() => { void cargar(); }, []);

  async function hacer(accion: () => Promise<unknown>, ok: string, defecto: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    publicacion.limpiar();
    try {
      await accion();
      await cargar();
      publicacion.recargar();
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, defecto) });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  /** «Corregir» de una redirección: lleva a su fila y pone el foco en su interruptor. */
  function irARedireccion(id: string) {
    setResaltada(id);
    const fila = tabla.current?.querySelector<HTMLElement>(`[data-redireccion="${id}"]`);
    fila?.scrollIntoView({ block: 'center' });
    fila?.querySelector<HTMLButtonElement>('[role="switch"]')?.focus();
  }

  return (
    <>
      <Cabecera titulo="SEO" subtitulo="Salud del sitio en buscadores: metadatos de las páginas, redirecciones 301 y robots.txt." accion={<div className="acciones-cabecera"><AccionPublicar estado={publicacion} /></div>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      <AvisosPublicacion estado={publicacion} />
      {!seo ? (!error ? <p className="sec" role="status">Cargando el SEO del sitio…</p> : null) : (
        <div className="seo-vista">
          <Problemas problemas={seo.problemas} alCorregir={(p) => (p.paginaId ? navegar(`/sitio/paginas/${p.paginaId}?seo`) : p.redireccionId ? irARedireccion(p.redireccionId) : undefined)} />
          <section className="tarjeta" aria-labelledby="seo-redirecciones-titulo">
            <div className="tarjeta-cabeza">
              <h2 id="seo-redirecciones-titulo">Redirecciones 301</h2>
              <span className="chip">{activas(seo.redirecciones)}</span>
            </div>
            <p className="sec">Llevan a los visitantes y a los buscadores de una ruta que ya no existe a la nueva. No se permiten cadenas, bucles ni rutas de páginas publicadas. {AL_PUBLICAR}</p>
            <FormularioRedireccion redirecciones={seo.redirecciones} ocupado={ocupado}
              alAgregar={(d) => hacer(() => api.crearRedireccion(d), `Se agregó la redirección ${d.desde} → ${d.hacia}. ${AL_PUBLICAR}`, 'No se pudo agregar la redirección')} />
            {seo.redirecciones.length === 0 ? <p className="nota">Aún no hay redirecciones. Al cambiar la ruta de una página publicada se crea una sola.</p> : (
              <div className="tabla-costos">
                <table aria-label="Redirecciones 301" ref={tabla} className="seo-redirecciones">
                  <thead>
                    <tr><th scope="col">Origen</th><th scope="col">Destino</th><th scope="col">Activa</th><th scope="col"><span className="sr">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {seo.redirecciones.map((r) => (
                      <FilaRedireccion key={r.id} r={r} ocupado={ocupado} resaltada={resaltada === r.id} borrando={borrando === r.id}
                        alAlternar={() => void hacer(() => api.cambiarRedireccion(r.id, { activa: !r.activa }), `La redirección ${r.desde} → ${r.hacia} ${r.activa ? 'quedó inactiva' : 'está activa'}. ${AL_PUBLICAR}`, 'No se pudo cambiar la redirección')}
                        alPedirBorrar={() => setBorrando(borrando === r.id ? null : r.id)}
                        alBorrar={() => void hacer(() => api.borrarRedireccion(r.id), `Se borró la redirección ${r.desde} → ${r.hacia}. ${AL_PUBLICAR}`, 'No se pudo borrar la redirección').then((ok) => ok && setBorrando(null))} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <Robots key={seo.robotsExtra} seo={seo} ocupado={ocupado} alGuardar={(extra) => hacer(() => api.guardarRobotsSitio(extra), `Se guardaron las reglas de robots.txt. ${AL_PUBLICAR}`, 'No se pudieron guardar las reglas')} />
        </div>
      )}
    </>
  );
}

function Problemas({ problemas, alCorregir }: { problemas: ProblemaSeo[]; alCorregir: (p: ProblemaSeo) => void }) {
  return (
    <section className="tarjeta" aria-labelledby="seo-problemas-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="seo-problemas-titulo">Problemas encontrados</h2>
        <span className={`chip ${problemas.length ? 'aviso' : 'validado'}`}>{problemas.length === 1 ? '1 problema' : `${problemas.length} problemas`}</span>
      </div>
      <p className="sec">Revisión automática de las páginas y redirecciones del panel. Google Search Console se conectará más adelante.</p>
      {problemas.length === 0 ? <p className="nota validado">Sin problemas: todas las páginas tienen descripción y título dentro del límite, y las redirecciones llevan a páginas que existen.</p> : (
        <ul className="seo-problemas" aria-label="Problemas de SEO">
          {problemas.map((p, i) => (
            <li key={`${p.tipo}-${p.paginaId ?? p.redireccionId ?? i}`}>
              <span className={`chip ${SEVERIDAD[p.severidad].chip}`}><span className="sr">Prioridad </span>{SEVERIDAD[p.severidad].texto}</span>
              <div className="seo-problema-texto"><b>{p.titulo}</b><span className="sec">{p.detalle}</span></div>
              <button type="button" className="boton" onClick={() => alCorregir(p)}>Corregir<span className="sr">: {p.titulo}. {p.detalle}</span></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormularioRedireccion({ redirecciones, ocupado, alAgregar }: { redirecciones: RedireccionSitio[]; ocupado: boolean; alAgregar: (d: { desde: string; hacia: string }) => Promise<boolean> }) {
  const [desde, setDesde] = useState('');
  const [hacia, setHacia] = useState('');
  const [error, setError] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // Las mismas reglas que la API, salvo las páginas publicadas, que solo ella conoce.
    const r = validarRedireccion({ desde, hacia }, redirecciones, []);
    if (!r.ok) return setError(r.errores.map((x) => x.mensaje).join('. '));
    setError('');
    if (await alAgregar({ desde: r.redireccion.desde, hacia: r.redireccion.hacia })) { setDesde(''); setHacia(''); }
  }

  return (
    <form className="seo-redireccion-form" onSubmit={enviar} aria-label="Agregar redirección" noValidate>
      <label className="campo" htmlFor="redireccion-desde">Desde
        <input id="redireccion-desde" value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="/precios-2025" maxLength={200} spellCheck={false} autoCapitalize="none" aria-invalid={Boolean(error)} aria-describedby={error ? 'redireccion-error' : undefined} />
      </label>
      <span className="seo-flecha" aria-hidden="true">→</span>
      <label className="campo" htmlFor="redireccion-hacia">Hacia
        <input id="redireccion-hacia" value={hacia} onChange={(e) => setHacia(e.target.value)} placeholder="/precios" maxLength={200} spellCheck={false} autoCapitalize="none" aria-invalid={Boolean(error)} aria-describedby={error ? 'redireccion-error' : undefined} />
      </label>
      <button type="submit" className="boton primario" disabled={ocupado}>Agregar redirección</button>
      {error ? <p className="nota error seo-redireccion-error" id="redireccion-error" role="alert">{error}</p> : null}
    </form>
  );
}

function FilaRedireccion({ r, ocupado, resaltada, borrando, alAlternar, alPedirBorrar, alBorrar }: {
  r: RedireccionSitio; ocupado: boolean; resaltada: boolean; borrando: boolean; alAlternar: () => void; alPedirBorrar: () => void; alBorrar: () => void;
}) {
  return (
    <>
      <tr data-redireccion={r.id} className={`${r.activa ? '' : 'oculto'}${resaltada ? ' resaltada' : ''}`}>
        <th scope="row" className="seo-ruta">{r.desde}</th>
        <td className="seo-ruta">{r.hacia}</td>
        <td><button type="button" role="switch" className="interruptor" aria-checked={r.activa} disabled={ocupado} onClick={alAlternar} aria-label={`Activar redirección ${r.desde} a ${r.hacia}`}><span aria-hidden="true" /></button></td>
        <td><button type="button" className="boton" disabled={ocupado} aria-expanded={borrando} onClick={alPedirBorrar} aria-label={`Borrar redirección ${r.desde}`}>Borrar</button></td>
      </tr>
      {borrando ? (
        <tr>
          <td colSpan={4}>
            <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${r.desde}`}>
              <span>¿Borrar la redirección {r.desde} → {r.hacia}? Al publicar, {r.desde} dará la página 404. Para pausarla basta con desactivarla.</span>
              <button type="button" className="boton peligro" disabled={ocupado} onClick={alBorrar}>Sí, borrar</button>
              <button type="button" className="boton" onClick={alPedirBorrar}>Cancelar</button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Robots({ seo, ocupado, alGuardar }: { seo: SeoSitio; ocupado: boolean; alGuardar: (extra: string) => Promise<boolean> }) {
  const [extra, setExtra] = useState(seo.robotsExtra);
  const [error, setError] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarRobotsExtra(extra);
    if (!r.ok) return setError(r.errores.map((x) => x.mensaje).join('. '));
    setError('');
    void alGuardar(r.robotsExtra);
  }

  return (
    <section className="tarjeta" aria-labelledby="seo-robots-titulo">
      <div className="tarjeta-cabeza"><h2 id="seo-robots-titulo">robots.txt</h2></div>
      <p className="sec">El sistema arma la base: permite todo y apunta al sitemap (en pruebas bloquea todo). Aquí sumas reglas extra.</p>
      <span className="seo-serp-etiqueta" id="seo-robots-vista">Vista previa (con las reglas guardadas)</span>
      <pre className="seo-robots" aria-labelledby="seo-robots-vista" tabIndex={0}>{seo.robotsVistaPrevia}</pre>
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="Reglas extra de robots.txt" noValidate>
        <label className="campo" htmlFor="seo-robots-extra">Reglas extra
          <textarea id="seo-robots-extra" rows={5} value={extra} onChange={(e) => setExtra(e.target.value)} spellCheck={false} placeholder={'# Panel interno\nDisallow: /panel'} aria-describedby="seo-robots-ayuda" aria-invalid={Boolean(error)} />
        </label>
        <p className="sec" id="seo-robots-ayuda">Una por línea: «Allow: /ruta», «Disallow: /ruta» o un comentario con #. No se acepta «Disallow: /».</p>
        {error ? <p className="nota error" role="alert">{error}</p> : null}
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={ocupado}>Guardar reglas</button></div>
      </form>
    </section>
  );
}
