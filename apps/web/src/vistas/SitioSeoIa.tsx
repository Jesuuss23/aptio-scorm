// HU-1513 · Sitio web › SEO para IA (PNT-30, REQ-072): las preguntas objetivo con la marca manual de si cada asistente
// menciona la marca, los rastreadores de IA de robots.txt (CP-126), el archivo llms.txt y las sugerencias de la IA
// (IA-19), que solo se vuelven borradores (CP-127). llms.txt y los rastreadores llegan al sitio con «Publicar cambios».
// Solo el superadmin (ADR-011).
import { armarLlmsTxt, ETIQUETA_MENCION, ESTADOS_MENCION, LIMITES_SEO_IA, miles, validarLlmsTxt, validarPreguntaObjetivo } from '@aptio/schema/sitio-seo-ia';
import { NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type AsistenteIaId, ErrorApi, type EstadoMencionIa, type PreguntaIa, type PropuestaIaSitio, type SeoIaSitio } from '../api';
import { navegar } from '../ruta';
import { usePublicacionSitio } from './publicacion-sitio';
import { AccionPublicar, AvisosPublicacion } from './SitioVersiones';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Enlace = { texto: string; ruta: string };
type Aviso = { tipo: 'ok' | 'error'; texto: string; enlaces?: Enlace[] } | null;
const AL_PUBLICAR = 'Llega al sitio con «Publicar cambios».';
const DOMINIO_POR_DEFECTO = 'aptioscorm.com';
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const nombreDe = (p: PropuestaIaSitio) => (p.tipo === 'pagina' ? p.datos.titulo : p.datos.pregunta) ?? '';
/** Dónde quedó el borrador de una propuesta: la pestaña SEO de la página nueva o Contenido (la pregunta, oculta). */
const enlaceDe = (p: PropuestaIaSitio, creadoId: string | undefined): Enlace =>
  p.tipo === 'pagina' ? { texto: `Abrir el borrador «${nombreDe(p)}»`, ruta: `/sitio/paginas/${creadoId ?? ''}?seo` } : { texto: 'Ver la pregunta oculta en Contenido', ruta: '/sitio/contenido' };

export function SitioSeoIa() {
  const [seo, setSeo] = useState<SeoIaSitio | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [proponiendo, setProponiendo] = useState(false);
  const [observaciones, setObservaciones] = useState<string[]>([]);
  const publicacion = usePublicacionSitio();

  const cargar = () => api.seoIaSitio().then((s) => { setSeo(s); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el SEO para IA')));
  useEffect(() => { void cargar(); }, []);

  /** Un cambio del panel: `publica` dice si cambia lo que saldrá en el sitio (y por eso hay algo que publicar). */
  async function hacer(accion: () => Promise<unknown>, ok: string, defecto: string, publica = false, enlaces?: Enlace[]): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    publicacion.limpiar();
    try {
      await accion();
      await cargar();
      if (publica) publicacion.recargar();
      setAviso({ tipo: 'ok', texto: ok, ...(enlaces ? { enlaces } : {}) });
      return true;
    } catch (e) {
      await cargar();
      setAviso({ tipo: 'error', texto: mensajeDe(e, defecto) });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function proponer() {
    setProponiendo(true);
    setOcupado(true);
    setAviso(null);
    setObservaciones([]);
    try {
      const r = await api.proponerContenidoIa();
      await cargar();
      setObservaciones(r.observaciones);
      setAviso({ tipo: 'ok', texto: r.nuevas === 0 ? 'La IA no encontró nada nuevo que proponer: lo que sugiere ya está en el sitio o en la lista.' : `${r.nuevas === 1 ? 'Llegó 1 sugerencia nueva' : `Llegaron ${r.nuevas} sugerencias nuevas`}. Nada se publica: revísalas y crea los borradores.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron pedir sugerencias a la IA') });
    } finally {
      setProponiendo(false);
      setOcupado(false);
    }
  }

  /** CP-127 · Crea el borrador de cada propuesta, una por una; si alguna falla, las demás siguen pendientes. */
  async function crearBorradores(propuestas: PropuestaIaSitio[]) {
    setOcupado(true);
    setAviso(null);
    const enlaces: Enlace[] = [];
    let fallo = '';
    for (const p of propuestas) {
      try {
        const r = await api.crearBorradorPropuestaIa(p.id);
        enlaces.push(enlaceDe(p, r.creadoId));
      } catch (e) {
        fallo = `No se creó el borrador de «${nombreDe(p)}»: ${mensajeDe(e, 'inténtalo de nuevo')}`;
        break;
      }
    }
    await cargar();
    const hechos = enlaces.length === 1 ? 'Se creó 1 borrador' : `Se crearon ${enlaces.length} borradores`;
    // Varias preguntas llevan al mismo sitio: un solo enlace a Contenido.
    const unicos = enlaces.filter((e, i) => enlaces.findIndex((x) => x.ruta === e.ruta) === i);
    setAviso(fallo ? { tipo: 'error', texto: enlaces.length ? `${hechos}. ${fallo}` : fallo, enlaces: unicos } : { tipo: 'ok', texto: `${hechos}. Nada se publicó: las páginas quedan en borrador y las preguntas, ocultas.`, enlaces: unicos });
    setOcupado(false);
  }

  return (
    <>
      <Cabecera titulo="SEO para IA" subtitulo="Que los asistentes de IA encuentren y citen el sitio cuando alguien pregunta por cursos SCORM."
        accion={<div className="acciones-cabecera"><button type="button" className="boton ia" disabled={ocupado || !seo} onClick={() => void proponer()}>✦ Proponer contenido</button><AccionPublicar estado={publicacion} /></div>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {proponiendo ? <p className="nota" role="status">La IA está revisando las preguntas objetivo y las páginas del sitio…</p> : null}
      {aviso ? (
        <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>
          {aviso.texto}
          {aviso.enlaces?.length ? <span className="seoia-enlaces">{aviso.enlaces.map((e) => <a key={e.ruta} href={e.ruta} onClick={(ev) => { ev.preventDefault(); navegar(e.ruta); }}>{e.texto}</a>)}</span> : null}
        </div>
      ) : null}
      <AvisosPublicacion estado={publicacion} />
      {!seo ? (!error ? <p className="sec" role="status">Cargando el SEO para IA…</p> : null) : (
        <div className="seo-vista">
          <div className="seoia-dos">
            <Preguntas seo={seo} ocupado={ocupado}
              alAgregar={(pregunta) => hacer(() => api.crearPreguntaIa(pregunta), `Se agregó la pregunta «${pregunta}».`, 'No se pudo agregar la pregunta')}
              alMarcar={(p, asistente, estado) => void hacer(() => api.cambiarPreguntaIa(p.id, { menciones: { [asistente.id]: estado } }), `${asistente.nombre} quedó en «${ETIQUETA_MENCION[estado]}» para «${p.pregunta}».`, 'No se pudo guardar la marca')}
              alBorrar={(p) => hacer(() => api.borrarPreguntaIa(p.id), `Se borró la pregunta «${p.pregunta}».`, 'No se pudo borrar la pregunta')} />
            <section className="tarjeta" aria-labelledby="seoia-rastreadores-titulo">
              <div className="tarjeta-cabeza"><h2 id="seoia-rastreadores-titulo">Rastreadores de IA</h2></div>
              <p className="sec">Qué bots pueden leer el sitio. Un bot bloqueado lleva «Disallow: /» en robots.txt. {AL_PUBLICAR}</p>
              <ul className="seoia-rastreadores" aria-label="Rastreadores de IA">
                {seo.rastreadores.map((r) => (
                  <li key={r.nombre}>
                    <span className="seo-ruta">{r.nombre}</span>
                    <span className={`chip ${r.permitido ? 'validado' : 'aviso'}`}>{r.permitido ? 'Permitido' : 'Bloqueado'}</span>
                    <button type="button" role="switch" className="interruptor" aria-checked={r.permitido} disabled={ocupado} aria-label={`Permitir ${r.nombre}`}
                      onClick={() => void hacer(() => api.guardarSeoIaSitio({ rastreadores: { [r.nombre]: !r.permitido } }), `${r.nombre} quedó ${r.permitido ? 'bloqueado' : 'permitido'}. ${AL_PUBLICAR}`, `No se pudo cambiar ${r.nombre}`, true)}><span aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="seoia-dos">
            <Llms key={seo.llmsTxt} seo={seo} ocupado={ocupado} alGuardar={(llmsTxt) => hacer(() => api.guardarSeoIaSitio({ llmsTxt }), llmsTxt ? `Se guardó llms.txt. ${AL_PUBLICAR}` : `llms.txt quedó vacío: al publicar, el sitio deja de servirlo. ${AL_PUBLICAR}`, 'No se pudo guardar llms.txt', true)} />
            <section className="tarjeta" aria-labelledby="seoia-sugerencias-titulo">
              <div className="tarjeta-cabeza">
                <h2 id="seoia-sugerencias-titulo">Sugerencias de la IA</h2>
                <span className="chip">{seo.propuestas.length === 1 ? '1 pendiente' : `${seo.propuestas.length} pendientes`}</span>
              </div>
              {seo.propuestas.length === 0 ? (
                <p className="sec">Pulsa «✦ Proponer contenido» para que la IA revise las preguntas objetivo y proponga páginas o respuestas nuevas. Todo llega como borrador: nada se publica sin tu revisión.</p>
              ) : (
                <>
                  <ul className="seoia-propuestas" aria-label="Sugerencias de la IA">
                    {seo.propuestas.map((p) => (
                      <li key={p.id} className="nota ia">
                        <span className="chip">{p.tipo === 'pagina' ? 'Página nueva' : 'Pregunta frecuente'}</span>
                        <b>✦ {nombreDe(p)}</b>
                        {p.tipo === 'pagina' ? <span className="sec"><span className="seo-ruta">{p.datos.ruta}</span> · {p.datos.metaDescripcion}</span> : <span className="sec">{p.datos.respuesta}{p.datos.pagina ? ` (sale en ${p.datos.pagina})` : ''}</span>}
                        <span className="sec">Por qué: {p.datos.motivo}</span>
                        <span className="acciones-fila">
                          <button type="button" className="boton" disabled={ocupado} aria-label={`Crear borrador: ${nombreDe(p)}`} onClick={() => void crearBorradores([p])}>Crear borrador</button>
                          <button type="button" className="boton" disabled={ocupado} onClick={() => void hacer(() => api.descartarPropuestaIa(p.id), `Se descartó la sugerencia «${nombreDe(p)}».`, 'No se pudo descartar la sugerencia')} aria-label={`Descartar: ${nombreDe(p)}`}>Descartar</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {seo.propuestas.length > 1 ? <div className="acciones-fila"><button type="button" className="boton primario" disabled={ocupado} onClick={() => void crearBorradores(seo.propuestas)}>Crear borradores</button></div> : null}
                </>
              )}
              {observaciones.length ? (
                <div className="nota aviso" role="note">
                  <b>Antes de publicar, la IA pide revisar:</b>
                  <ul>{observaciones.map((o) => <li key={o}>{o}</li>)}</ul>
                </div>
              ) : null}
              <p className="seoia-faq"><span>Páginas publicadas con datos estructurados FAQPage</span><span className="chip">{seo.paginasFaq.conFaq} de {seo.paginasFaq.publicadas}</span></p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Preguntas({ seo, ocupado, alAgregar, alMarcar, alBorrar }: {
  seo: SeoIaSitio; ocupado: boolean; alAgregar: (pregunta: string) => Promise<boolean>;
  alMarcar: (p: PreguntaIa, asistente: { id: AsistenteIaId; nombre: string }, estado: EstadoMencionIa) => void; alBorrar: (p: PreguntaIa) => Promise<boolean>;
}) {
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState('');
  const [borrando, setBorrando] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarPreguntaObjetivo(nueva, seo.preguntas.map((p) => p.pregunta));
    if (!r.ok) return setError(r.errores.map((x) => x.mensaje).join('. '));
    setError('');
    if (await alAgregar(r.pregunta)) setNueva('');
  }

  return (
    <section className="tarjeta" aria-labelledby="seoia-preguntas-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="seoia-preguntas-titulo">Preguntas objetivo</h2>
        <span className="chip">{seo.preguntas.length === 1 ? '1 pregunta' : `${seo.preguntas.length} preguntas`}</span>
      </div>
      <p className="sec">Lo que la gente le pregunta a un asistente. Hazle la pregunta a cada uno y marca si menciona la marca al responder; la fecha de la revisión se guarda sola.</p>
      {seo.preguntas.length === 0 ? <p className="nota">Aún no hay preguntas objetivo. Agrega la primera para poder pedir sugerencias a la IA.</p> : (
        <ul className="seoia-preguntas" aria-label="Preguntas objetivo">
          {seo.preguntas.map((p) => (
            <li key={p.id}>
              <div className="seoia-pregunta-cabeza">
                <b>{p.pregunta}</b>
                <button type="button" className="boton" disabled={ocupado} aria-expanded={borrando === p.id} onClick={() => setBorrando(borrando === p.id ? null : p.id)} aria-label={`Borrar la pregunta «${p.pregunta}»`}>Borrar</button>
              </div>
              <div className="seoia-menciones" role="group" aria-label={`¿Mencionan la marca al responder «${p.pregunta}»?`}>
                {seo.asistentes.map((a) => {
                  const m = p.menciones[a.id];
                  const id = `mencion-${p.id}-${a.id}`;
                  return (
                    <label key={a.id} className="campo" htmlFor={id}>{a.nombre}
                      <select id={id} value={m.estado} disabled={ocupado} aria-describedby={m.revisadoEn ? `${id}-fecha` : undefined} onChange={(e) => alMarcar(p, a, e.target.value as EstadoMencionIa)}>
                        {ESTADOS_MENCION.map((e) => <option key={e} value={e}>{ETIQUETA_MENCION[e]}</option>)}
                      </select>
                      {m.revisadoEn ? <small id={`${id}-fecha`}>Revisado el {fechaCorta(m.revisadoEn)}</small> : null}
                    </label>
                  );
                })}
              </div>
              {borrando === p.id ? (
                <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de «${p.pregunta}»`}>
                  <span>¿Borrar esta pregunta y sus marcas?</span>
                  <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void alBorrar(p).then((ok) => ok && setBorrando(null))}>Sí, borrar</button>
                  <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form className="seo-redireccion-form" onSubmit={enviar} aria-label="Agregar pregunta objetivo" noValidate>
        <label className="campo" htmlFor="seoia-nueva">Nueva pregunta objetivo
          <input id="seoia-nueva" value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={LIMITES_SEO_IA.pregunta} placeholder="cómo convertir un PDF en curso SCORM" aria-invalid={Boolean(error)} aria-describedby={error ? 'seoia-nueva-error' : undefined} />
        </label>
        <button type="submit" className="boton primario" disabled={ocupado}>Agregar pregunta</button>
        {error ? <p className="nota error seo-redireccion-error" id="seoia-nueva-error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}

function Llms({ seo, ocupado, alGuardar }: { seo: SeoIaSitio; ocupado: boolean; alGuardar: (llmsTxt: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState(seo.llmsTxt);
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [sitio, setSitio] = useState({ dominio: DOMINIO_POR_DEFECTO, nombre: NOMBRE_POR_DEFECTO });
  const n = texto.trim().length;

  useEffect(() => {
    api.ajustesSitio().then((a) => setSitio({ dominio: a.dominio ?? DOMINIO_POR_DEFECTO, nombre: a.nombre || NOMBRE_POR_DEFECTO }), () => undefined);
  }, []);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarLlmsTxt(texto);
    if (!r.ok) return setError(r.errores.map((x) => x.mensaje).join('. '));
    setError('');
    setNota('');
    void alGuardar(r.llmsTxt);
  }

  /** Sin IA: el título y la dirección de cada página publicada e indexable. No guarda: deja el texto listo para revisar. */
  async function armar() {
    setError('');
    try {
      const paginas = await api.paginasSitio();
      const armado = armarLlmsTxt({ nombre: sitio.nombre, sitioUrl: `https://${sitio.dominio}`, paginas });
      setTexto(armado);
      const cuantas = armado.split('\n').filter((l) => l.startsWith('- [')).length;
      setNota(cuantas ? `Se armó con ${cuantas === 1 ? '1 página publicada' : `${cuantas} páginas publicadas`}. Revísalo y pulsa «Guardar llms.txt».` : 'Todavía no hay páginas publicadas e indexables: solo quedó el nombre del sitio.');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron leer las páginas del sitio'));
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="seoia-llms-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="seoia-llms-titulo">llms.txt</h2>
        <span className="sec seo-ruta">{sitio.dominio}/llms.txt</span>
      </div>
      <p className="sec">Un resumen del sitio en texto plano para los asistentes de IA. Vacío, el sitio no lo sirve. {AL_PUBLICAR}</p>
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="llms.txt" noValidate>
        <label className="campo" htmlFor="seoia-llms">Contenido de llms.txt
          <textarea id="seoia-llms" rows={12} value={texto} onChange={(e) => { setTexto(e.target.value); setNota(''); }} spellCheck={false} placeholder={'# Nombre del sitio\n\n> Qué hace, en una frase.\n\n## Páginas\n- [Precios](https://…/precios): planes y precios'} aria-describedby="seoia-llms-cuenta seoia-llms-ayuda" aria-invalid={Boolean(error)} />
        </label>
        <small id="seoia-llms-cuenta" className={n > LIMITES_SEO_IA.llmsTxt ? 'contador-caracteres excede' : 'contador-caracteres'} aria-live="polite">{miles(n)} / {miles(LIMITES_SEO_IA.llmsTxt)}{n > LIMITES_SEO_IA.llmsTxt ? ` · ${miles(n - LIMITES_SEO_IA.llmsTxt)} de más` : ''}</small>
        <p className="sec" id="seoia-llms-ayuda">Solo texto, sin etiquetas HTML. Se acostumbra un título con #, una frase con &gt; y listas de enlaces.</p>
        {error ? <p className="nota error" role="alert">{error}</p> : null}
        {nota ? <p className="nota" role="status">{nota}</p> : null}
        <div className="acciones-fila ajustes-acciones">
          <button type="button" className="boton" disabled={ocupado} onClick={() => void armar()}>Armar con las páginas publicadas</button>
          <button type="submit" className="boton primario" disabled={ocupado}>Guardar llms.txt</button>
        </div>
      </form>
    </section>
  );
}
