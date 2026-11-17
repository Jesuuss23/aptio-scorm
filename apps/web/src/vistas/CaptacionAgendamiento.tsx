// HU-1605 · Captación › Agendamiento (PNT-33, REQ-078, RN-17-5): los tipos de reunión con «Ofrecer [tipo]», su duración
// y sus asesores; la tabla de asesores con su enlace fijo de videollamada; las integraciones de calendario (el calendario
// de Aptio, Google y Outlook «Próximamente»); los «Horarios ofrecidos» de lunes a viernes en hora de Lima con los
// feriados de Perú del año y los días bloqueados; el interruptor de recordatorios por correo; y la lista de citas con
// «Cancelar», «Realizada» y «No asistió». Todo se lee en vivo desde el sitio: no pide publicar. Solo el superadmin.
import {
  ETIQUETA_ESTADO_CITA, ESTADOS_CITA, esFecha, esHora, fechaLima, LIMITES_AGENDA, validarAsesor, validarTipo, type AjustesAgenda, type EstadoCita,
} from '@aptio/schema/agenda';
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Agenda, type AsesorAgenda, type CitaAgenda, type EntradaAsesor, type EntradaTipo, type FiltroCitas, type TipoReunion } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Edicion<T> = { modo: 'nuevo' } | { modo: 'editar'; item: T } | null;
/** La página del sitio con el agendador (la ruta de «Agendar demo» del menú del sitio). */
const PAGINA_AGENDA = '/s/agendar-demo';
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] as const;
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] as const;
const CHIP_ESTADO: Record<EstadoCita, string> = { confirmada: 'validado', cancelada: 'error', realizada: '', no_asistio: 'aviso' };
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fechaCorta = (f: string) => `${+f.slice(8, 10)} ${MESES_CORTOS[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`;

export function CaptacionAgendamiento() {
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipoEd, setTipoEd] = useState<Edicion<TipoReunion>>(null);
  const [asesorEd, setAsesorEd] = useState<Edicion<AsesorAgenda>>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const recargar = () => api.agenda().then(setAgenda, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el agendamiento')));
  useEffect(() => {
    void recargar();
  }, []);

  /** Corre un cambio, vuelve a leer la agenda y avisa. Devuelve si salió bien. */
  async function hacer(accion: () => Promise<unknown>, ok: string, fallo: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      setAgenda(await api.agenda());
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function mover(t: TipoReunion, paso: -1 | 1) {
    const ids = agenda!.tipos.map((x) => x.id);
    const i = ids.indexOf(t.id);
    [ids[i], ids[i + paso]] = [ids[i + paso]!, ids[i]!];
    await hacer(() => api.ordenarTiposReunion(ids), `«${t.nombreEs}» quedó en la posición ${i + paso + 1}.`, 'No se cambió el orden');
  }

  const nombreAsesor = (id: string) => agenda?.asesores.find((a) => a.id === id)?.nombre ?? '';

  return (
    <>
      <Cabecera titulo="Agendamiento" subtitulo="Tipos de reunión, horarios, integraciones de calendario y citas."
        accion={<a className="boton" href={PAGINA_AGENDA} target="_blank" rel="noopener" aria-label="Ver página de agenda (se abre en una pestaña nueva)">Ver página de agenda</a>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {!agenda ? (!error ? <p className="sec" role="status">Cargando el agendamiento…</p> : null) : (
        <>
          <section className="tarjeta" aria-labelledby="agenda-tipos-titulo">
            <div className="tarjeta-cabeza">
              <h2 id="agenda-tipos-titulo">Tipos de reunión</h2>
              <button type="button" className="boton primario" disabled={ocupado || tipoEd?.modo === 'nuevo'} onClick={() => { setTipoEd({ modo: 'nuevo' }); setAviso(null); }}>Nuevo tipo</button>
            </div>
            {tipoEd ? (
              <FormularioTipo key={tipoEd.modo === 'editar' ? tipoEd.item.id : 'nuevo'} inicial={tipoEd.modo === 'editar' ? tipoEd.item : undefined} asesores={agenda.asesores} ocupado={ocupado}
                alCancelar={() => setTipoEd(null)}
                alGuardar={async (d) => {
                  const ok = tipoEd.modo === 'editar'
                    ? await hacer(() => api.cambiarTipoReunion(tipoEd.item.id, d), `Se guardó «${d.nombreEs ?? tipoEd.item.nombreEs}».`, 'No se guardó el tipo')
                    : await hacer(() => api.crearTipoReunion(d), `Se creó «${d.nombreEs}», sin ofrecer: actívalo cuando quieras que se vea en el sitio.`, 'No se creó el tipo');
                  if (ok) setTipoEd(null);
                }} />
            ) : null}
            {agenda.tipos.length === 0 ? <p className="nota">Aún no hay tipos de reunión. Crea el primero con «Nuevo tipo».</p> : (
              <ul className="agenda-tipos">
                {agenda.tipos.map((t, i) => (
                  <li key={t.id} className={`agenda-tipo${t.visible ? '' : ' oculto'}`}>
                    <div className="agenda-tipo-cabeza">
                      <h3>{t.nombreEs}{t.ficticio ? <span className="chip aviso leads-contactos">Ficticio</span> : null}</h3>
                      <div className="fila-interruptor">
                        <button type="button" role="switch" className="interruptor" aria-checked={t.visible} disabled={ocupado} aria-label={`Ofrecer ${t.nombreEs}`}
                          onClick={() => void hacer(() => api.cambiarTipoReunion(t.id, { visible: !t.visible }), `«${t.nombreEs}» ${t.visible ? 'ya no se ofrece en el sitio' : 'ya se ofrece en el sitio'}.`, `No se pudo cambiar «${t.nombreEs}»`)}>
                          <span aria-hidden="true" />
                        </button>
                        <span className="sec">{t.visible ? 'Se ofrece' : 'No se ofrece'}</span>
                      </div>
                    </div>
                    {t.nombreEn ? <p className="sec leads-linea">En inglés: {t.nombreEn}</p> : null}
                    <dl className="agenda-datos">
                      <div><dt>Duración</dt><dd>{t.minutos} minutos</dd></div>
                      <div><dt>Asesores</dt><dd>{t.asesorIds.length ? t.asesorIds.map(nombreAsesor).join(', ') : <span className="texto-error">Sin asesores: no se ofrece</span>}</dd></div>
                    </dl>
                    <div className="popup-acciones">
                      <button type="button" className="boton icono" disabled={ocupado || i === 0} onClick={() => void mover(t, -1)} aria-label={`Subir ${t.nombreEs}`}>↑</button>
                      <button type="button" className="boton icono" disabled={ocupado || i === agenda.tipos.length - 1} onClick={() => void mover(t, 1)} aria-label={`Bajar ${t.nombreEs}`}>↓</button>
                      <button type="button" className="boton chico" disabled={ocupado} onClick={() => { setTipoEd({ modo: 'editar', item: t }); setAviso(null); }} aria-label={`Editar ${t.nombreEs}`}>Editar</button>
                      <button type="button" className="boton chico" disabled={ocupado} aria-expanded={borrando === t.id} onClick={() => setBorrando(borrando === t.id ? null : t.id)} aria-label={`Borrar ${t.nombreEs}`}>Borrar</button>
                    </div>
                    {borrando === t.id ? (
                      <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${t.nombreEs}`}>
                        <span>¿Borrar «{t.nombreEs}»? Si tiene citas, basta con dejar de ofrecerlo.</span>
                        <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void hacer(() => api.borrarTipoReunion(t.id), `Se borró «${t.nombreEs}».`, 'No se borró').then((ok) => ok && setBorrando(null))}>Sí, borrar</button>
                        <button type="button" className="boton" onClick={() => setBorrando(null)}>Cancelar</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta" aria-labelledby="agenda-asesores-titulo">
            <div className="tarjeta-cabeza">
              <h2 id="agenda-asesores-titulo">Asesores</h2>
              <button type="button" className="boton" disabled={ocupado || asesorEd?.modo === 'nuevo'} onClick={() => { setAsesorEd({ modo: 'nuevo' }); setAviso(null); }}>Nuevo asesor</button>
            </div>
            {asesorEd ? (
              <FormularioAsesor key={asesorEd.modo === 'editar' ? asesorEd.item.id : 'nuevo'} inicial={asesorEd.modo === 'editar' ? asesorEd.item : undefined} ocupado={ocupado}
                alCancelar={() => setAsesorEd(null)}
                alGuardar={async (d) => {
                  const ok = asesorEd.modo === 'editar'
                    ? await hacer(() => api.cambiarAsesor(asesorEd.item.id, d), `Se guardó a ${d.nombre ?? asesorEd.item.nombre}.`, 'No se guardó el asesor')
                    : await hacer(() => api.crearAsesor(d), `Se agregó a ${d.nombre}. Asígnalo a un tipo de reunión para que reciba citas.`, 'No se agregó el asesor');
                  if (ok) setAsesorEd(null);
                }} />
            ) : null}
            {agenda.asesores.length === 0 ? <p className="nota">Aún no hay asesores. Sin asesores el sitio no ofrece horarios.</p> : (
              <div className="tabla-costos">
                <table aria-label="Asesores" className="tabla-popups">
                  <thead><tr><th scope="col">Asesor</th><th scope="col">Videollamada</th><th scope="col" className="num">Citas próximas</th><th scope="col">Recibe citas</th><th scope="col">Acciones</th></tr></thead>
                  <tbody>
                    {agenda.asesores.map((a) => (
                      <tr key={a.id} className={a.visible ? '' : 'oculto'}>
                        <th scope="row"><b>{a.nombre}</b>{a.ficticio ? <span className="chip aviso leads-contactos">Ficticio</span> : null}<span className="sec leads-linea">{a.correo}</span></th>
                        <td><span className="seo-ruta">{a.enlaceVideollamada}</span></td>
                        <td className="num">{a.citasProximas}</td>
                        <td>
                          <div className="fila-interruptor">
                            <button type="button" role="switch" className="interruptor" aria-checked={a.visible} disabled={ocupado} aria-label={`${a.nombre} recibe citas`}
                              onClick={() => void hacer(() => api.cambiarAsesor(a.id, { visible: !a.visible }), `${a.nombre} ${a.visible ? 'ya no recibe citas nuevas' : 'ya recibe citas'}.`, `No se pudo cambiar a ${a.nombre}`)}>
                              <span aria-hidden="true" />
                            </button>
                            <span className="sec">{a.visible ? 'Sí' : 'No'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="popup-acciones">
                            <button type="button" className="boton chico" disabled={ocupado} onClick={() => { setAsesorEd({ modo: 'editar', item: a }); setAviso(null); }} aria-label={`Editar a ${a.nombre}`}>Editar</button>
                            <button type="button" className="boton chico" disabled={ocupado} aria-expanded={borrando === a.id} onClick={() => setBorrando(borrando === a.id ? null : a.id)} aria-label={`Borrar a ${a.nombre}`}>Borrar</button>
                          </div>
                          {borrando === a.id ? (
                            <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar el borrado de ${a.nombre}`}>
                              <span>¿Borrar a {a.nombre}? Si tiene citas, basta con apagar «Recibe citas».</span>
                              <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void hacer(() => api.borrarAsesor(a.id), `Se borró a ${a.nombre}.`, 'No se borró').then((ok) => ok && setBorrando(null))}>Sí, borrar</button>
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
          </section>

          <div className="crm-tarjetas agenda-tarjetas">
            <Horarios agenda={agenda} ocupado={ocupado}
              alGuardar={(c, ok) => hacer(() => api.cambiarAjustesAgenda(c), ok, 'No se guardaron los horarios')} />
            <section className="tarjeta" aria-labelledby="agenda-integraciones-titulo">
              <div className="tarjeta-cabeza"><h2 id="agenda-integraciones-titulo">Integraciones y recordatorios</h2></div>
              <ul className="crm-conexiones">
                <li><span className="crm-conexion-nombre"><b>Calendario de Aptio</b><span className="sec leads-linea">Cada cita bloquea la franja del asesor y le llega con la invitación .ics.</span></span><span className="chip validado">Activo</span></li>
                <li><span className="crm-conexion-nombre"><b>Google Calendar</b><span className="sec leads-linea">Leer la disponibilidad del asesor desde su calendario.</span></span><span className="chip">Próximamente</span></li>
                <li><span className="crm-conexion-nombre"><b>Outlook</b><span className="sec leads-linea">Leer la disponibilidad del asesor desde su calendario.</span></span><span className="chip">Próximamente</span></li>
                <li>
                  <span className="crm-conexion-nombre"><b>Recordatorios por correo</b><span className="sec leads-linea">24 h y 1 h antes, al visitante. La invitación siempre se envía.</span></span>
                  <div className="fila-interruptor">
                    <button type="button" role="switch" className="interruptor" aria-checked={agenda.ajustes.recordatoriosCorreo} disabled={ocupado} aria-label="Recordatorios por correo"
                      onClick={() => void hacer(() => api.cambiarAjustesAgenda({ recordatoriosCorreo: !agenda.ajustes.recordatoriosCorreo }), `Recordatorios por correo ${agenda.ajustes.recordatoriosCorreo ? 'apagados' : 'encendidos'}.`, 'No se cambiaron los recordatorios')}>
                      <span aria-hidden="true" />
                    </button>
                    <span className="sec">{agenda.ajustes.recordatoriosCorreo ? 'Encendidos' : 'Apagados'}</span>
                  </div>
                </li>
              </ul>
            </section>
          </div>

          <Citas ocupado={ocupado} setOcupado={setOcupado} setAviso={setAviso} alCambiar={() => void recargar()} />
        </>
      )}
    </>
  );
}

function Horarios({ agenda, ocupado, alGuardar }: { agenda: Agenda; ocupado: boolean; alGuardar: (c: Partial<AjustesAgenda>, ok: string) => Promise<boolean> }) {
  const a = agenda.ajustes;
  const [franjas, setFranjas] = useState(a.franjas.join(', '));
  const [anticipacion, setAnticipacion] = useState(String(a.anticipacionHoras));
  const [horizonte, setHorizonte] = useState(String(a.horizonteDias));
  const [bloqueo, setBloqueo] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [hoy] = useState(() => fechaLima(new Date()));
  const anio = hoy.slice(0, 4);
  const feriados = agenda.feriados.filter((f) => f.fecha.startsWith(anio));
  const bloqueados = [...a.diasBloqueados].sort();

  function guardar() {
    const lista = franjas.split(/[\s,;]+/).filter(Boolean);
    const e: string[] = [];
    if (!lista.length || !lista.every(esHora)) e.push('Escribe los horarios como 09:00, 10:30… separados por comas');
    const ant = Number(anticipacion);
    const hor = Number(horizonte);
    if (!Number.isInteger(ant) || ant < 0 || ant > LIMITES_AGENDA.anticipacionMax) e.push(`La anticipación va de 0 a ${LIMITES_AGENDA.anticipacionMax} horas`);
    if (!Number.isInteger(hor) || hor < LIMITES_AGENDA.horizonteMin || hor > LIMITES_AGENDA.horizonteMax) e.push(`El horizonte va de ${LIMITES_AGENDA.horizonteMin} a ${LIMITES_AGENDA.horizonteMax} días`);
    setErrores(e);
    if (!e.length) void alGuardar({ franjas: lista, anticipacionHoras: ant, horizonteDias: hor }, 'Se guardaron los horarios ofrecidos.');
  }

  return (
    <section className="tarjeta" aria-labelledby="agenda-horarios-titulo">
      <div className="tarjeta-cabeza"><h2 id="agenda-horarios-titulo">Horarios ofrecidos</h2></div>
      <p className="sec">De lunes a viernes, en hora de Lima. Los feriados de Perú y los días bloqueados no se ofrecen.</p>
      <div className="tabla-costos">
        <table className="agenda-semana" aria-label="Horarios ofrecidos de lunes a viernes">
          <thead><tr>{DIAS.map((d, i) => <th key={d} scope="col"><abbr title={DIAS_LARGOS[i]}>{d}</abbr></th>)}</tr></thead>
          <tbody>{a.franjas.map((h) => <tr key={h}>{DIAS.map((d) => <td key={d}><span className="agenda-franja">{h}</span></td>)}</tr>)}</tbody>
        </table>
      </div>
      <form className="formulario-ajustes formulario-popup" aria-label="Horarios y plazos" noValidate onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        <p className="campo">
          <label htmlFor="agenda-franjas">Horas de inicio</label>
          <input id="agenda-franjas" type="text" value={franjas} spellCheck={false} aria-describedby="agenda-franjas-ayuda" onChange={(e) => setFranjas(e.target.value)} />
          <span id="agenda-franjas-ayuda" className="sec">Separadas por comas, por ejemplo 09:00, 10:00, 15:00.</span>
        </p>
        <div className="popup-campos">
          <p className="campo"><label htmlFor="agenda-anticipacion">Anticipación mínima (horas)</label><input id="agenda-anticipacion" type="number" inputMode="numeric" min={0} max={LIMITES_AGENDA.anticipacionMax} value={anticipacion} onChange={(e) => setAnticipacion(e.target.value)} /></p>
          <p className="campo"><label htmlFor="agenda-horizonte">Se puede agendar hasta (días)</label><input id="agenda-horizonte" type="number" inputMode="numeric" min={LIMITES_AGENDA.horizonteMin} max={LIMITES_AGENDA.horizonteMax} value={horizonte} onChange={(e) => setHorizonte(e.target.value)} /></p>
        </div>
        <div className="acciones-fila"><button type="submit" className="boton primario" disabled={ocupado}>Guardar horarios</button></div>
      </form>

      <h3 className="crm-guia-titulo">Días bloqueados</h3>
      <form className="agenda-bloqueo" aria-label="Bloquear un día" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!esFecha(bloqueo) || bloqueo < hoy) { setErrores(['Elige un día de hoy en adelante para bloquear']); return; }
        if (a.diasBloqueados.includes(bloqueo)) { setErrores([`El ${fechaCorta(bloqueo)} ya está bloqueado`]); return; }
        setErrores([]);
        void alGuardar({ diasBloqueados: [...a.diasBloqueados, bloqueo] }, `Se bloqueó el ${fechaCorta(bloqueo)}.`).then((ok) => ok && setBloqueo(''));
      }}>
        <label htmlFor="agenda-bloquear">Día</label>
        <input id="agenda-bloquear" type="date" min={hoy} value={bloqueo} onChange={(e) => setBloqueo(e.target.value)} />
        <button type="submit" className="boton" disabled={ocupado}>Bloquear día</button>
      </form>
      {bloqueados.length ? (
        <ul className="agenda-dias" aria-label="Días bloqueados">
          {bloqueados.map((f) => (
            <li key={f}>
              <span>{fechaCorta(f)}</span>
              <button type="button" className="boton chico" disabled={ocupado} aria-label={`Desbloquear el ${fechaCorta(f)}`}
                onClick={() => void alGuardar({ diasBloqueados: a.diasBloqueados.filter((x) => x !== f) }, `Se desbloqueó el ${fechaCorta(f)}.`)}>Desbloquear</button>
            </li>
          ))}
        </ul>
      ) : <p className="sec">No hay días bloqueados.</p>}

      <h3 className="crm-guia-titulo">Feriados de Perú {anio}</h3>
      <ul className="agenda-feriados" aria-label={`Feriados de Perú ${anio}`}>
        {feriados.map((f) => <li key={f.fecha} className={f.fecha < hoy ? 'pasado' : ''}><span className="agenda-fecha">{fechaCorta(f.fecha)}</span> {f.nombre}</li>)}
      </ul>
    </section>
  );
}

function Citas({ ocupado, setOcupado, setAviso, alCambiar }: { ocupado: boolean; setOcupado: (b: boolean) => void; setAviso: (a: Aviso) => void; alCambiar: () => void }) {
  const [filtro, setFiltro] = useState<FiltroCitas>(() => ({ estado: 'confirmada', desde: fechaLima(new Date()) }));
  const [ahora, setAhora] = useState(() => Date.now());
  const [citas, setCitas] = useState<CitaAgenda[] | null>(null);
  const [error, setError] = useState('');
  const [cancelando, setCancelando] = useState<string | null>(null);

  useEffect(() => {
    void api.citas(filtro).then((r) => { setCitas(r.citas); setError(''); setAhora(Date.now()); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las citas')));
  }, [filtro]);
  const filtrar = (cambio: Partial<FiltroCitas>) => { setCitas(null); setError(''); setFiltro((f) => ({ ...f, ...cambio })); };

  async function cambiar(c: CitaAgenda, estado: 'cancelada' | 'realizada' | 'no_asistio') {
    setOcupado(true);
    setAviso(null);
    try {
      const n = await api.cambiarCita(c.id, estado);
      setCitas((xs) => (xs ?? []).map((x) => (x.id === n.id ? n : x)));
      setCancelando(null);
      setAviso({ tipo: 'ok', texto: estado === 'cancelada' ? `Se canceló la cita de ${c.nombre}; le llega el aviso por correo.` : `La cita de ${c.nombre} quedó como «${ETIQUETA_ESTADO_CITA[estado]}».` });
      if (estado === 'cancelada') alCambiar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se cambió la cita: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="agenda-citas-titulo">
      <div className="leads-cabeza">
        <h2 id="agenda-citas-titulo">Citas{citas ? <span className="chip leads-contactos">{citas.length}</span> : null}</h2>
        <div className="leads-filtros">
          <label>Estado
            <select value={filtro.estado ?? ''} onChange={(e) => filtrar({ estado: e.target.value as FiltroCitas['estado'] })}>
              <option value="">Todos</option>
              {ESTADOS_CITA.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO_CITA[s]}</option>)}
            </select>
          </label>
          <label>Desde<input type="date" value={filtro.desde ?? ''} onChange={(e) => filtrar({ desde: e.target.value })} /></label>
          <label>Hasta<input type="date" value={filtro.hasta ?? ''} onChange={(e) => filtrar({ hasta: e.target.value })} /></label>
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : !citas ? <p className="sec" role="status">Cargando las citas…</p> : citas.length === 0 ? (
        <p className="nota">No hay citas con estos filtros.</p>
      ) : (
        <div className="tabla-costos">
          <table aria-label="Citas" className="tabla-popups">
            <thead><tr><th scope="col">Fecha (hora de Lima)</th><th scope="col">Contacto</th><th scope="col">Reunión</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              {citas.map((c) => {
                const empezo = Date.parse(c.inicio) <= ahora;
                return (
                  <tr key={c.id}>
                    <td><b>{fechaCorta(c.fecha)}</b><span className="sec leads-linea">{c.hora}</span></td>
                    <th scope="row"><b>{c.nombre}</b><span className="sec leads-linea">{[c.empresa, c.correo].filter(Boolean).join(' · ')}</span>{c.lms ? <span className="sec leads-linea">LMS: {c.lms}</span> : null}</th>
                    <td>{c.tipo}<span className="sec leads-linea">Con {c.asesor} · {c.idioma === 'en' ? 'inglés' : 'español'}</span></td>
                    <td><span className={`chip ${CHIP_ESTADO[c.estado]}`}>{ETIQUETA_ESTADO_CITA[c.estado]}</span>{c.canceladaPor ? <span className="sec leads-linea">Por {c.canceladaPor === 'visitante' ? 'el visitante' : 'el equipo'}</span> : null}</td>
                    <td>
                      <div className="popup-acciones">
                        {c.estado === 'confirmada' ? (
                          <button type="button" className="boton chico" disabled={ocupado} aria-expanded={cancelando === c.id} onClick={() => setCancelando(cancelando === c.id ? null : c.id)} aria-label={`Cancelar la cita de ${c.nombre}`}>Cancelar</button>
                        ) : null}
                        {c.estado !== 'cancelada' && empezo ? (
                          <>
                            <button type="button" className="boton chico" disabled={ocupado || c.estado === 'realizada'} onClick={() => void cambiar(c, 'realizada')} aria-label={`Marcar la cita de ${c.nombre} como realizada`}>Realizada</button>
                            <button type="button" className="boton chico" disabled={ocupado || c.estado === 'no_asistio'} onClick={() => void cambiar(c, 'no_asistio')} aria-label={`Marcar que ${c.nombre} no asistió`}>No asistió</button>
                          </>
                        ) : null}
                      </div>
                      {cancelando === c.id ? (
                        <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar la cancelación de la cita de ${c.nombre}`}>
                          <span>¿Cancelar la cita? Le llega un correo con la cancelación.</span>
                          <button type="button" className="boton peligro" disabled={ocupado} onClick={() => void cambiar(c, 'cancelada')}>Sí, cancelar</button>
                          <button type="button" className="boton" onClick={() => setCancelando(null)}>No</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sec leads-pie">Cada cita entra a Leads con vía «Agendador» y etapa Demo. El visitante puede cancelar con el enlace de su correo hasta la hora de inicio.</p>
    </section>
  );
}

function Errores({ errores }: { errores: string[] }) {
  return errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null;
}

function FormularioTipo({ inicial, asesores, ocupado, alGuardar, alCancelar }: { inicial?: TipoReunion; asesores: AsesorAgenda[]; ocupado: boolean; alGuardar: (d: EntradaTipo) => Promise<void>; alCancelar: () => void }) {
  const [nombreEs, setNombreEs] = useState(inicial?.nombreEs ?? '');
  const [nombreEn, setNombreEn] = useState(inicial?.nombreEn ?? '');
  const [minutos, setMinutos] = useState(String(inicial?.minutos ?? 30));
  const [ids, setIds] = useState<string[]>(inicial?.asesorIds ?? []);
  const [ficticio, setFicticio] = useState(inicial?.ficticio ?? false);
  const [errores, setErrores] = useState<string[]>([]);
  return (
    <form className="formulario-ajustes formulario-popup agenda-form" aria-label={inicial ? `Editar ${inicial.nombreEs}` : 'Nuevo tipo de reunión'} noValidate onSubmit={(e) => {
      e.preventDefault();
      const r = validarTipo({ nombreEs, nombreEn, minutos: Number(minutos) });
      if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
      setErrores([]);
      void alGuardar({ ...r.datos, asesorIds: ids, ficticio });
    }}>
      <Errores errores={errores} />
      <div className="popup-campos">
        <p className="campo"><label htmlFor="tipo-nombre-es">Nombre (español)</label><input id="tipo-nombre-es" type="text" value={nombreEs} maxLength={LIMITES_AGENDA.nombreTipo} onChange={(e) => setNombreEs(e.target.value)} /></p>
        <p className="campo"><label htmlFor="tipo-nombre-en">Nombre (inglés)</label><input id="tipo-nombre-en" type="text" value={nombreEn} maxLength={LIMITES_AGENDA.nombreTipo} onChange={(e) => setNombreEn(e.target.value)} /></p>
        <p className="campo"><label htmlFor="tipo-minutos">Duración (minutos)</label><input id="tipo-minutos" type="number" inputMode="numeric" min={LIMITES_AGENDA.minutosMin} max={LIMITES_AGENDA.minutosMax} step={5} value={minutos} onChange={(e) => setMinutos(e.target.value)} /></p>
      </div>
      <fieldset className="agenda-asesores">
        <legend>Asesores</legend>
        {asesores.length ? asesores.map((a) => (
          <label key={a.id} className="casilla"><input type="checkbox" checked={ids.includes(a.id)} onChange={(e) => setIds((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} /> {a.nombre}</label>
        )) : <p className="sec">Agrega un asesor primero: sin asesores el tipo no se ofrece.</p>}
      </fieldset>
      <label className="casilla"><input type="checkbox" checked={ficticio} onChange={(e) => setFicticio(e.target.checked)} /> Dato ficticio (nunca se ofrece en producción)</label>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar tipo</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioAsesor({ inicial, ocupado, alGuardar, alCancelar }: { inicial?: AsesorAgenda; ocupado: boolean; alGuardar: (d: EntradaAsesor) => Promise<void>; alCancelar: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [correo, setCorreo] = useState(inicial?.correo ?? '');
  const [enlace, setEnlace] = useState(inicial?.enlaceVideollamada ?? '');
  const [ficticio, setFicticio] = useState(inicial?.ficticio ?? false);
  const [errores, setErrores] = useState<string[]>([]);
  return (
    <form className="formulario-ajustes formulario-popup agenda-form" aria-label={inicial ? `Editar a ${inicial.nombre}` : 'Nuevo asesor'} noValidate onSubmit={(e) => {
      e.preventDefault();
      const r = validarAsesor({ nombre, correo, enlaceVideollamada: enlace });
      if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
      setErrores([]);
      void alGuardar({ ...r.datos, ficticio });
    }}>
      <Errores errores={errores} />
      <div className="popup-campos">
        <p className="campo"><label htmlFor="asesor-nombre">Nombre</label><input id="asesor-nombre" type="text" autoComplete="off" value={nombre} maxLength={LIMITES_AGENDA.nombreAsesor} onChange={(e) => setNombre(e.target.value)} /></p>
        <p className="campo"><label htmlFor="asesor-correo">Correo</label><input id="asesor-correo" type="email" autoComplete="off" value={correo} maxLength={LIMITES_AGENDA.correo} onChange={(e) => setCorreo(e.target.value)} /></p>
      </div>
      <p className="campo">
        <label htmlFor="asesor-enlace">Enlace fijo de videollamada</label>
        <input id="asesor-enlace" type="url" inputMode="url" spellCheck={false} value={enlace} maxLength={LIMITES_AGENDA.enlace} placeholder="https://meet.google.com/…" aria-describedby="asesor-enlace-ayuda" onChange={(e) => setEnlace(e.target.value)} />
        <span id="asesor-enlace-ayuda" className="sec">Va en la invitación de cada cita. Debe empezar con https://.</span>
      </p>
      <label className="casilla"><input type="checkbox" checked={ficticio} onChange={(e) => setFicticio(e.target.checked)} /> Dato ficticio (nunca recibe citas en producción)</label>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar asesor</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
