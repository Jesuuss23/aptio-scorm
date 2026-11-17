// HU-1604 · Captación › Chatbot (PNT-32, REQ-077, RN-17-4): el interruptor «Mostrar chatbot en el sitio»; «Identidad
// y objetivo» con el nombre, el tono, el objetivo, el saludo en los dos idiomas y el horario de atención de personas (hora
// de Lima); las «Respuestas rápidas» con su orden y «Mostrar [texto]»; la «Base de conocimiento» con lo que toma del sitio
// publicado y las fuentes manuales («Usar [título]»); las «Conversaciones» de los últimos 90 días; y «Probar» en el
// sitio. Todo se lee en vivo desde el sitio: no pide publicar. Solo el superadmin.
import {
  ACCIONES_RAPIDA, ETIQUETA_ACCION_RAPIDA, ETIQUETA_OBJETIVO, ETIQUETA_RESULTADO, ETIQUETA_TONO, LIMITES_CHAT, OBJETIVOS_CHATBOT, RESULTADOS_CONVERSACION, TONOS_CHATBOT,
  validarAjustesChatbot, validarFuente, validarRapida, type AccionRapida, type ResultadoConversacion,
} from '@aptio/schema/chatbot';
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import {
  api, ErrorApi, type AjustesChatbotWeb, type Chatbot, type Conversacion, type Conversaciones, type EntradaFuente, type EntradaRapida, type FuenteChatWeb, type RapidaChat,
} from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Edicion<T> = { modo: 'nuevo' } | { modo: 'editar'; item: T } | null;
/** «Probar en el sitio»: el inicio con `#chat`, que abre el chat al cargar. */
const PROBAR = '/s/#chat';
const DIAS = [[1, 'Lun', 'lunes'], [2, 'Mar', 'martes'], [3, 'Mié', 'miércoles'], [4, 'Jue', 'jueves'], [5, 'Vie', 'viernes'], [6, 'Sáb', 'sábado'], [7, 'Dom', 'domingo']] as const;
const CHIP_RESULTADO: Record<ResultadoConversacion, string> = { demo: 'validado', lead: 'validado', persona: 'aviso', respuesta: '', sin_conversion: 'error' };
const hora = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Errores({ errores }: { errores: string[] }) {
  return errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null;
}

export function CaptacionChatbot() {
  const [datos, setDatos] = useState<Chatbot | null>(null);
  const [conv, setConv] = useState<Conversaciones | null>(null);
  const [filtro, setFiltro] = useState<ResultadoConversacion | ''>('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rapidaEd, setRapidaEd] = useState<Edicion<RapidaChat>>(null);
  const [fuenteEd, setFuenteEd] = useState<Edicion<FuenteChatWeb>>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    api.chatbot().then(setDatos, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el chatbot')));
    api.conversaciones().then(setConv, () => setConv({ conversaciones: [], total: 0, porResultado: {} }));
  }, []);

  function filtrar(r: ResultadoConversacion | '') {
    setFiltro(r);
    api.conversaciones(r).then(setConv, (e: unknown) => setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron leer las conversaciones') }));
  }

  /** Corre un cambio, vuelve a leer el chatbot y avisa. Devuelve si salió bien. */
  async function hacer(accion: () => Promise<unknown>, ok: string, fallo: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      setDatos(await api.chatbot());
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function mover(r: RapidaChat, paso: -1 | 1) {
    const ids = datos!.rapidas.map((x) => x.id);
    const i = ids.indexOf(r.id);
    [ids[i], ids[i + paso]] = [ids[i + paso]!, ids[i]!];
    await hacer(() => api.ordenarRapidas(ids), `«${r.textoEs}» quedó en la posición ${i + paso + 1}.`, 'No se cambió el orden');
  }

  const visible = datos?.ajustes.visible ?? false;
  return (
    <>
      <Cabecera titulo="Chatbot" subtitulo="Asistente del sitio: identidad, objetivo, conocimiento y conversaciones."
        accion={datos ? (
          <div className="fila-interruptor">
            <button type="button" role="switch" className="interruptor" aria-checked={visible} disabled={ocupado} aria-label="Mostrar chatbot en el sitio"
              onClick={() => void hacer(() => api.cambiarChatbot({ visible: !visible }), visible ? 'El chatbot ya no se muestra en el sitio.' : 'El chatbot ya se muestra en el sitio, sin publicar.', 'No se pudo cambiar el chatbot')}>
              <span aria-hidden="true" />
            </button>
            <span>{visible ? 'Se muestra en el sitio' : 'Oculto en el sitio'}</span>
          </div>
        ) : null} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {!datos ? (!error ? <p className="sec" role="status">Cargando el chatbot…</p> : null) : (
        <div className="columnas chat-columnas">
          <div className="chat-columna">
            <Identidad key={datos.ajustes.nombre + datos.ajustes.horarioInicio + datos.ajustes.horarioFin} ajustes={datos.ajustes} horario={datos.horario} enHorario={datos.enHorario} ocupado={ocupado}
              alGuardar={(c) => hacer(() => api.cambiarChatbot(c), 'Se guardaron la identidad y el objetivo. El sitio los usa desde ya.', 'No se guardó')} />

            <section className="tarjeta" aria-labelledby="chat-rapidas-titulo">
              <div className="tarjeta-cabeza">
                <div>
                  <h2 id="chat-rapidas-titulo">Respuestas rápidas</h2>
                  <p className="sec">Botones que ve el visitante debajo del saludo. «Agendar demo» y «Hablar con una persona» no usan la IA.</p>
                </div>
                <button type="button" className="boton" disabled={ocupado || rapidaEd?.modo === 'nuevo'} onClick={() => { setRapidaEd({ modo: 'nuevo' }); setAviso(null); }}>Nueva respuesta</button>
              </div>
              {rapidaEd ? (
                <FormularioRapida key={rapidaEd.modo === 'editar' ? rapidaEd.item.id : 'nueva'} inicial={rapidaEd.modo === 'editar' ? rapidaEd.item : undefined} ocupado={ocupado}
                  alCancelar={() => setRapidaEd(null)}
                  alGuardar={async (d) => {
                    const ok = rapidaEd.modo === 'editar'
                      ? await hacer(() => api.cambiarRapida(rapidaEd.item.id, d), `Se guardó «${d.textoEs ?? rapidaEd.item.textoEs}».`, 'No se guardó la respuesta')
                      : await hacer(() => api.crearRapida(d), `Se agregó «${d.textoEs}» al final.`, 'No se agregó la respuesta');
                    if (ok) setRapidaEd(null);
                  }} />
              ) : null}
              {datos.rapidas.length === 0 ? <p className="nota">Aún no hay respuestas rápidas. El chat igual saluda y responde preguntas.</p> : (
                <ul className="chat-lista">
                  {datos.rapidas.map((r, i) => (
                    <li key={r.id} className={r.visible ? '' : 'oculto'}>
                      <div className="chat-fila">
                        <div className="chat-orden">
                          <button type="button" className="boton icono" disabled={ocupado || i === 0} onClick={() => void mover(r, -1)} aria-label={`Subir ${r.textoEs}`}>↑</button>
                          <button type="button" className="boton icono" disabled={ocupado || i === datos.rapidas.length - 1} onClick={() => void mover(r, 1)} aria-label={`Bajar ${r.textoEs}`}>↓</button>
                        </div>
                        <div className="chat-texto">
                          <b>{r.textoEs}</b>{r.ficticio ? <span className="chip aviso leads-contactos">Ficticio</span> : null}
                          <span className="sec leads-linea">{ETIQUETA_ACCION_RAPIDA[r.accion]}{r.textoEn ? ` · En inglés: ${r.textoEn}` : ' · Sin texto en inglés: no se muestra en /en'}</span>
                        </div>
                        <div className="fila-interruptor">
                          <button type="button" role="switch" className="interruptor" aria-checked={r.visible} disabled={ocupado} aria-label={`Mostrar ${r.textoEs}`}
                            onClick={() => void hacer(() => api.cambiarRapida(r.id, { visible: !r.visible }), `«${r.textoEs}» ${r.visible ? 'ya no se muestra' : 'ya se muestra'} en el chat.`, `No se pudo cambiar «${r.textoEs}»`)}>
                            <span aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="popup-acciones">
                        <button type="button" className="boton chico" disabled={ocupado} onClick={() => { setRapidaEd({ modo: 'editar', item: r }); setAviso(null); }} aria-label={`Editar ${r.textoEs}`}>Editar</button>
                        <button type="button" className="boton chico" disabled={ocupado} aria-expanded={borrando === r.id} onClick={() => setBorrando(borrando === r.id ? null : r.id)} aria-label={`Borrar ${r.textoEs}`}>Borrar</button>
                      </div>
                      {borrando === r.id ? (
                        <Confirmar texto={`¿Borrar «${r.textoEs}»?`} etiqueta={`Confirmar el borrado de ${r.textoEs}`} ocupado={ocupado} alCancelar={() => setBorrando(null)}
                          alConfirmar={() => void hacer(() => api.borrarRapida(r.id), `Se borró «${r.textoEs}».`, 'No se borró').then((ok) => ok && setBorrando(null))} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tarjeta" aria-labelledby="chat-base-titulo">
              <div className="tarjeta-cabeza">
                <div>
                  <h2 id="chat-base-titulo">Base de conocimiento</h2>
                  <p className="sec">El chatbot responde solo con esto. Del sitio publicado toma {datos.base.paginasEs} páginas y {datos.base.preguntasEs} preguntas frecuentes en español, y {datos.base.paginasEn} páginas y {datos.base.preguntasEn} preguntas en inglés.</p>
                </div>
                <button type="button" className="boton" disabled={ocupado || fuenteEd?.modo === 'nuevo'} onClick={() => { setFuenteEd({ modo: 'nuevo' }); setAviso(null); }}>Agregar fuente</button>
              </div>
              {fuenteEd ? (
                <FormularioFuente key={fuenteEd.modo === 'editar' ? fuenteEd.item.id : 'nueva'} inicial={fuenteEd.modo === 'editar' ? fuenteEd.item : undefined} ocupado={ocupado}
                  alCancelar={() => setFuenteEd(null)}
                  alGuardar={async (d) => {
                    const ok = fuenteEd.modo === 'editar'
                      ? await hacer(() => api.cambiarFuente(fuenteEd.item.id, d), `Se guardó «${d.titulo ?? fuenteEd.item.titulo}».`, 'No se guardó la fuente')
                      : await hacer(() => api.crearFuente(d), `Se agregó «${d.titulo}». El chatbot ya puede usarla.`, 'No se agregó la fuente');
                    if (ok) setFuenteEd(null);
                  }} />
              ) : null}
              {datos.fuentes.length === 0 ? <p className="nota">Sin fuentes manuales. Agrega textos que no estén en el sitio, como tiempos de entrega o condiciones.</p> : (
                <ul className="chat-lista">
                  {datos.fuentes.map((f) => (
                    <li key={f.id} className={f.visible ? '' : 'oculto'}>
                      <div className="chat-fila">
                        <div className="chat-texto">
                          <b>{f.titulo}</b><span className="chip leads-contactos">{f.idioma === 'en' ? 'Inglés' : 'Español'}</span>
                          <span className="sec leads-linea">{f.contenido.length > 140 ? `${f.contenido.slice(0, 140)}…` : f.contenido}</span>
                        </div>
                        <div className="fila-interruptor">
                          <button type="button" role="switch" className="interruptor" aria-checked={f.visible} disabled={ocupado} aria-label={`Usar ${f.titulo}`}
                            onClick={() => void hacer(() => api.cambiarFuente(f.id, { visible: !f.visible }), `«${f.titulo}» ${f.visible ? 'ya no se usa' : 'ya se usa'} en las respuestas.`, `No se pudo cambiar «${f.titulo}»`)}>
                            <span aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="popup-acciones">
                        <button type="button" className="boton chico" disabled={ocupado} onClick={() => { setFuenteEd({ modo: 'editar', item: f }); setAviso(null); }} aria-label={`Editar ${f.titulo}`}>Editar</button>
                        <button type="button" className="boton chico" disabled={ocupado} aria-expanded={borrando === f.id} onClick={() => setBorrando(borrando === f.id ? null : f.id)} aria-label={`Borrar ${f.titulo}`}>Borrar</button>
                      </div>
                      {borrando === f.id ? (
                        <Confirmar texto={`¿Borrar «${f.titulo}»?`} etiqueta={`Confirmar el borrado de ${f.titulo}`} ocupado={ocupado} alCancelar={() => setBorrando(null)}
                          alConfirmar={() => void hacer(() => api.borrarFuente(f.id), `Se borró «${f.titulo}».`, 'No se borró').then((ok) => ok && setBorrando(null))} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="chat-columna">
            <section className="tarjeta" aria-labelledby="chat-conv-titulo">
              <div className="tarjeta-cabeza">
                <h2 id="chat-conv-titulo">Conversaciones <span className="chip">{conv?.total ?? 0}</span></h2>
                <p className="campo chat-filtro">
                  <label htmlFor="chat-filtro">Resultado</label>
                  <select id="chat-filtro" value={filtro} onChange={(e) => filtrar(e.target.value as ResultadoConversacion | '')}>
                    <option value="">Todos</option>
                    {RESULTADOS_CONVERSACION.map((r) => <option key={r} value={r}>{ETIQUETA_RESULTADO[r]} ({conv?.porResultado[r] ?? 0})</option>)}
                  </select>
                </p>
              </div>
              <p className="sec">De los últimos {LIMITES_CHAT.retencionDias} días, sin IP ni datos personales: los datos del visitante van al lead o a la cita.</p>
              {!conv ? <p className="sec" role="status">Cargando las conversaciones…</p> : conv.conversaciones.length === 0 ? <p className="nota">{filtro ? 'No hay conversaciones con ese resultado.' : 'Aún no hay conversaciones.'}</p> : (
                <ul className="chat-lista">{conv.conversaciones.map((c) => <ConversacionFila key={c.id} c={c} />)}</ul>
              )}
            </section>
            <section className="tarjeta" aria-labelledby="chat-probar-titulo">
              <h2 id="chat-probar-titulo">Probar</h2>
              <p className="sec">Abre el sitio y conversa con {datos.ajustes.nombre}. Lo que agende aparece en Agendamiento y Leads.{visible ? '' : ' Primero muestra el chatbot en el sitio.'}</p>
              <a className="boton" href={PROBAR} target="_blank" rel="noopener" aria-label="Abrir el chat en el sitio (se abre en una pestaña nueva)">Abrir el chat en el sitio</a>
            </section>
            <p className="nota ia">✦ Las respuestas las genera la IA solo con la base de conocimiento y citan su fuente. Si no sabe, ofrece agendar o pasar a una persona.</p>
          </div>
        </div>
      )}
    </>
  );
}

function Confirmar({ texto, etiqueta, ocupado, alConfirmar, alCancelar }: { texto: string; etiqueta: string; ocupado: boolean; alConfirmar: () => void; alCancelar: () => void }) {
  return (
    <div className="nota aviso confirmar-fila" role="group" aria-label={etiqueta}>
      <span>{texto}</span>
      <button type="button" className="boton peligro" disabled={ocupado} onClick={alConfirmar}>Sí, borrar</button>
      <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
    </div>
  );
}

function ConversacionFila({ c }: { c: Conversacion }) {
  const primera = c.mensajes.find((m) => m.de === 'visitante')?.texto ?? '(sin mensajes del visitante)';
  return (
    <li>
      <details className="chat-conv">
        <summary>
          <span className="chat-texto"><b>{primera}</b><span className="sec leads-linea">{hora(c.actualizadoEn)} · {c.mensajes.length} mensajes · {c.idioma === 'en' ? 'inglés' : 'español'}</span></span>
          <span className={`chip ${CHIP_RESULTADO[c.resultado]}`}>{ETIQUETA_RESULTADO[c.resultado]}</span>
        </summary>
        <ol className="chat-mensajes">
          {c.mensajes.map((m, i) => (
            <li key={i} className={m.de === 'bot' ? 'bot' : 'visitante'}>
              <span className="sec">{m.de === 'bot' ? 'Chatbot' : 'Visitante'}</span> {m.texto}
              {m.fuentes?.length ? <span className="sec leads-linea">Fuentes: {m.fuentes.join(', ')}</span> : null}
              {m.acciones?.length ? <span className="sec leads-linea">Ofreció: {m.acciones.map((a) => ETIQUETA_ACCION_RAPIDA[a]).join(' y ')}</span> : null}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

function Identidad({ ajustes, horario, enHorario, ocupado, alGuardar }: { ajustes: AjustesChatbotWeb; horario: string; enHorario: boolean; ocupado: boolean; alGuardar: (c: Partial<AjustesChatbotWeb>) => Promise<boolean> }) {
  const [d, setD] = useState(ajustes);
  const [errores, setErrores] = useState<string[]>([]);
  const cambiar = <K extends keyof AjustesChatbotWeb>(k: K, v: AjustesChatbotWeb[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <section className="tarjeta" aria-labelledby="chat-identidad-titulo">
      <h2 id="chat-identidad-titulo">Identidad y objetivo</h2>
      <form className="formulario-ajustes formulario-popup" aria-label="Identidad y objetivo" noValidate onSubmit={(e) => {
        e.preventDefault();
        const { visible: _v, ...cambios } = d;
        const r = validarAjustesChatbot(ajustes, cambios);
        if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
        setErrores([]);
        void alGuardar(cambios);
      }}>
        <Errores errores={errores} />
        <div className="popup-campos">
          <p className="campo"><label htmlFor="chat-nombre">Nombre</label><input id="chat-nombre" type="text" value={d.nombre} maxLength={LIMITES_CHAT.nombre} onChange={(e) => cambiar('nombre', e.target.value)} /></p>
          <p className="campo"><label htmlFor="chat-tono">Tono</label><select id="chat-tono" value={d.tono} onChange={(e) => cambiar('tono', e.target.value as AjustesChatbotWeb['tono'])}>{TONOS_CHATBOT.map((t) => <option key={t} value={t}>{ETIQUETA_TONO[t]}</option>)}</select></p>
          <p className="campo"><label htmlFor="chat-objetivo">Objetivo principal</label><select id="chat-objetivo" value={d.objetivo} onChange={(e) => cambiar('objetivo', e.target.value as AjustesChatbotWeb['objetivo'])}>{OBJETIVOS_CHATBOT.map((o) => <option key={o} value={o}>{ETIQUETA_OBJETIVO[o]}</option>)}</select></p>
        </div>
        <p className="campo"><label htmlFor="chat-saludo-es">Saludo (español)</label><textarea id="chat-saludo-es" rows={2} value={d.saludoEs} maxLength={LIMITES_CHAT.saludo} onChange={(e) => cambiar('saludoEs', e.target.value)} /></p>
        <p className="campo"><label htmlFor="chat-saludo-en">Saludo (inglés)</label><textarea id="chat-saludo-en" rows={2} value={d.saludoEn} maxLength={LIMITES_CHAT.saludo} onChange={(e) => cambiar('saludoEn', e.target.value)} /></p>
        <fieldset className="agenda-asesores">
          <legend>Horario de traspaso a una persona (hora de Lima)</legend>
          <p className="campo"><label htmlFor="chat-desde">Desde</label><input id="chat-desde" type="time" value={d.horarioInicio} onChange={(e) => cambiar('horarioInicio', e.target.value)} /></p>
          <p className="campo"><label htmlFor="chat-hasta">Hasta</label><input id="chat-hasta" type="time" value={d.horarioFin} onChange={(e) => cambiar('horarioFin', e.target.value)} /></p>
          <div className="chat-dias" role="group" aria-label="Días de atención">
            {DIAS.map(([n, corto, largo]) => (
              <label key={n} className="casilla"><input type="checkbox" checked={d.diasAtencion.includes(n)} aria-label={largo}
                onChange={(e) => cambiar('diasAtencion', e.target.checked ? [...d.diasAtencion, n].sort((a, b) => a - b) : d.diasAtencion.filter((x) => x !== n))} /> {corto}</label>
            ))}
          </div>
        </fieldset>
        <p className="sec">Ahora: {horario}. {enHorario ? 'Hay atención de personas: el chat ofrece WhatsApp.' : 'Fuera de horario: el chat pide el correo y responde el siguiente día hábil.'}</p>
        <div className="acciones-fila">
          <button type="submit" className="boton primario" disabled={ocupado}>Guardar</button>
        </div>
      </form>
    </section>
  );
}

function FormularioRapida({ inicial, ocupado, alGuardar, alCancelar }: { inicial?: RapidaChat; ocupado: boolean; alGuardar: (d: EntradaRapida) => Promise<void>; alCancelar: () => void }) {
  const [textoEs, setTextoEs] = useState(inicial?.textoEs ?? '');
  const [textoEn, setTextoEn] = useState(inicial?.textoEn ?? '');
  const [accion, setAccion] = useState<AccionRapida>(inicial?.accion ?? 'consulta_ia');
  const [ficticio, setFicticio] = useState(inicial?.ficticio ?? false);
  const [errores, setErrores] = useState<string[]>([]);
  return (
    <form className="formulario-ajustes formulario-popup agenda-form" aria-label={inicial ? `Editar ${inicial.textoEs}` : 'Nueva respuesta rápida'} noValidate onSubmit={(e) => {
      e.preventDefault();
      const r = validarRapida({ textoEs, textoEn, accion });
      if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
      setErrores([]);
      void alGuardar({ ...r.datos, ficticio });
    }}>
      <Errores errores={errores} />
      <div className="popup-campos">
        <p className="campo"><label htmlFor="rapida-es">Texto (español)</label><input id="rapida-es" type="text" value={textoEs} maxLength={LIMITES_CHAT.textoRapida} onChange={(e) => setTextoEs(e.target.value)} /></p>
        <p className="campo"><label htmlFor="rapida-en">Texto (inglés)</label><input id="rapida-en" type="text" value={textoEn} maxLength={LIMITES_CHAT.textoRapida} onChange={(e) => setTextoEn(e.target.value)} /></p>
        <p className="campo"><label htmlFor="rapida-accion">Al pulsarla</label><select id="rapida-accion" value={accion} onChange={(e) => setAccion(e.target.value as AccionRapida)}>{ACCIONES_RAPIDA.map((a) => <option key={a} value={a}>{ETIQUETA_ACCION_RAPIDA[a]}</option>)}</select></p>
      </div>
      <label className="casilla"><input type="checkbox" checked={ficticio} onChange={(e) => setFicticio(e.target.checked)} /> Dato ficticio (nunca se muestra en producción)</label>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar respuesta</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioFuente({ inicial, ocupado, alGuardar, alCancelar }: { inicial?: FuenteChatWeb; ocupado: boolean; alGuardar: (d: EntradaFuente) => Promise<void>; alCancelar: () => void }) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [contenido, setContenido] = useState(inicial?.contenido ?? '');
  const [idioma, setIdioma] = useState<'es' | 'en'>(inicial?.idioma ?? 'es');
  const [errores, setErrores] = useState<string[]>([]);
  return (
    <form className="formulario-ajustes formulario-popup agenda-form" aria-label={inicial ? `Editar ${inicial.titulo}` : 'Nueva fuente'} noValidate onSubmit={(e) => {
      e.preventDefault();
      const r = validarFuente({ titulo, contenido, idioma });
      if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
      setErrores([]);
      void alGuardar(r.datos);
    }}>
      <Errores errores={errores} />
      <div className="popup-campos">
        <p className="campo"><label htmlFor="fuente-titulo">Título</label><input id="fuente-titulo" type="text" value={titulo} maxLength={LIMITES_CHAT.tituloFuente} onChange={(e) => setTitulo(e.target.value)} /></p>
        <p className="campo"><label htmlFor="fuente-idioma">Idioma</label><select id="fuente-idioma" value={idioma} onChange={(e) => setIdioma(e.target.value as 'es' | 'en')}><option value="es">Español</option><option value="en">Inglés</option></select></p>
      </div>
      <p className="campo"><label htmlFor="fuente-contenido">Contenido (texto plano, hasta {LIMITES_CHAT.contenidoFuente.toLocaleString('es-PE')} caracteres)</label><textarea id="fuente-contenido" rows={5} value={contenido} maxLength={LIMITES_CHAT.contenidoFuente} onChange={(e) => setContenido(e.target.value)} /></p>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar fuente</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
