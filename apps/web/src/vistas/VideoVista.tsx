// HU-0901 · Video interactivo (PNT-10, M09, CP-080): el video del cliente con su línea de marcadores. «+ Pregunta en
// M:SS» agrega una pregunta en el segundo que se está viendo; el panel edita su enunciado, opciones, la correcta, la
// retroalimentación y si es obligatoria. Se guarda solo, 1 s después del último cambio y solo si pasa las reglas de la
// API (RN-09-1). Capítulos y puntos interactivos se ven y se conservan, pero todavía no se editan. HU-0902 · «Impedir
// adelantar hasta responder». HU-0903 · «✦ Proponer pausas desde la transcripción» (IA-09 v2, CP-082): las pausas
// propuestas se ven en la línea como marcas en espera; cada una se acepta o se descarta y «Aplicar las elegidas» las suma.
import { Cabecera } from '@aptio/ui';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { api, type Curso, EDITAN_PANTALLAS, ErrorApi, type Propuesta, type Proyecto, type Rol } from '../api';
import { navegar } from '../ruta';
import type { CursoDoc } from '@aptio/schema/revision';
import {
  describir, duracionDe, erroresPorMarcador, idOpcion, MAX_OPCIONES, type MarcadorVideo, mmss, NOMBRE_TIPO, nuevaPregunta, ordenar, type PantallaVideo, pantallasConVideo, posicion,
} from './video-marcadores';

const ESPERA_GUARDAR_MS = 1000;
// HU-0903 · Consulta del trabajo de la IA cada 1,5 s, hasta 2 minutos.
const CADA_MS = 1500;
const LIMITE_MS = 120_000;
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

export function VideoVista({ proyectoId, pantallaId, rol, alCargar }: { proyectoId: string; pantallaId: string | null; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [error, setError] = useState('');
  const [vuelta, setVuelta] = useState(0);
  const cursoRef = useRef<Curso | null>(null);

  useEffect(() => {
    let vigente = true;
    api.proyecto(proyectoId).then(
      (p) => {
        if (!vigente) return;
        setProyecto(p);
        alCargar(p.nombre);
        api.curso(proyectoId).then(
          (c) => { if (vigente) { cursoRef.current = c; setCurso(c); } },
          (e: unknown) => { if (!vigente) return; if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true); else setError(mensajeDe(e, 'No se pudo cargar el curso')); },
        );
      },
      (e: unknown) => { if (vigente) setError(mensajeDe(e, 'No se pudo cargar el proyecto')); },
    );
    return () => { vigente = false; };
  }, [proyectoId, alCargar, vuelta]);

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error && !curso) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Video interactivo" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="sec">El curso todavía no tiene pantallas. Genera el SCORM y vuelve aquí para agregar preguntas a los videos.</p>
      </>
    );
  }
  if (!proyecto || !curso) return <p className="sec" role="status">Cargando el video…</p>;

  const doc = curso.documento as unknown as CursoDoc;
  const videos = pantallasConVideo(doc);
  if (!videos.length) {
    return (
      <>
        <Cabecera titulo="Video interactivo" subtitulo={proyecto.nombre} accion={volver} />
        <p className="nota">Este curso no tiene pantallas con video. Sube el video del cliente en «Material del cliente» y genera una pantalla de video; luego vuelve aquí para agregarle preguntas.</p>
      </>
    );
  }
  const actual = videos.find((v) => v.pantallaId === pantallaId) ?? videos[0]!;
  const ir = (id: string) => navegar(`/proyectos/${proyectoId}/video?pantalla=${id}`);
  return (
    <>
      <Cabecera titulo="Video interactivo" subtitulo={`${proyecto.nombre} · el video se detiene en cada pregunta y la muestra encima`} accion={volver} />
      {videos.length > 1 ? (
        <label className="campo video-selector">
          Pantalla con video
          <select value={actual.pantallaId} onChange={(e) => ir(e.target.value)}>
            {videos.map((v) => <option key={v.pantallaId + v.bloqueId} value={v.pantallaId}>{v.numero}. {v.titulo}</option>)}
          </select>
        </label>
      ) : null}
      <EditorVideo
        key={`${actual.pantallaId}:${actual.bloqueId}:${vuelta}`}
        video={actual}
        url={curso.urlsRecursos?.[actual.recursoId]}
        duracionConocida={duracionDe(doc, actual.recursoId)}
        cursoRef={cursoRef}
        editan={EDITAN_PANTALLAS.includes(rol)}
        proyectoId={proyectoId}
        alConflicto={() => setVuelta((n) => n + 1)}
      />
    </>
  );
}

/** Lo que se guarda y se deshace: las preguntas (`m`) y «impedir adelantar» (`i`). */
interface Version { m: MarcadorVideo[]; i: boolean }

function EditorVideo({ video, url, duracionConocida, cursoRef, editan, proyectoId, alConflicto }: {
  video: PantallaVideo;
  url: string | undefined;
  duracionConocida: number | undefined;
  cursoRef: RefObject<Curso | null>;
  editan: boolean;
  proyectoId: string;
  alConflicto: () => void;
}) {
  const [borrador, setBorrador] = useState<MarcadorVideo[]>(() => ordenar(video.marcadores));
  // HU-0902 · «Impedir adelantar» se guarda y se deshace junto con las preguntas.
  const [impedir, setImpedir] = useState(video.impedirAdelantar);
  const [guardada, setGuardada] = useState(() => JSON.stringify({ m: ordenar(video.marcadores), i: video.impedirAdelantar }));
  const [pila, setPila] = useState<Version[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [tiempoMs, setTiempoMs] = useState(0);
  const [duracionVideo, setDuracionVideo] = useState<number | undefined>(undefined);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const reproductor = useRef<HTMLVideoElement>(null);
  // HU-0903 · Pausas propuestas por la IA.
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [pedido, setPedido] = useState<{ trabajoId: string; desde: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [omitidas, setOmitidas] = useState<string[]>([]);

  const duracion = duracionConocida ?? duracionVideo;
  const errores = erroresPorMarcador(borrador, duracion);
  const pendiente = JSON.stringify({ m: borrador, i: impedir }) !== guardada;
  const largo = duracion ?? Math.max(60_000, ...borrador.map((m) => m.tiempoMs + 10_000));
  const pregunta = borrador.find((m) => m.id === elegido && m.tipo === 'pregunta') ?? null;

  const guardar = async (v: Version, motivo?: 'deshacer') => {
    const c = cursoRef.current;
    if (!c) return;
    const anterior = JSON.parse(guardada) as Version;
    setGuardada(JSON.stringify(v));
    setError('');
    try {
      const r = await api.editarPantalla(c.id, video.pantallaId, {
        version: c.version, marcadores: { [video.bloqueId]: v.m }, reglasVideo: { [video.bloqueId]: { impedirAdelantar: v.i } }, ...(motivo ? { motivo } : {}),
      });
      cursoRef.current = { ...c, version: r.version };
      if (!motivo) setPila((p) => [...p, anterior].slice(-30));
      setAviso(motivo ? 'Cambio deshecho.' : v.i !== anterior.i ? (v.i ? 'Guardado: no se podrá adelantar sin responder.' : 'Guardado: se podrá adelantar libremente.') : 'Preguntas del video guardadas.');
    } catch (e) {
      setGuardada(JSON.stringify(anterior));
      setError(mensajeDe(e, 'No se pudieron guardar las preguntas'));
      if (e instanceof ErrorApi && e.estado === 409) alConflicto();
    }
  };
  const guardarRef = useRef(guardar);
  useEffect(() => { guardarRef.current = guardar; });

  useEffect(() => {
    if (!editan || !pendiente || errores.size) return;
    const t = setTimeout(() => { void guardarRef.current({ m: borrador, i: impedir }); }, ESPERA_GUARDAR_MS);
    return () => clearTimeout(t);
  }, [borrador, impedir, editan, pendiente, errores.size]);

  // HU-0903 · La propuesta de pausas vigente de este video, al abrir y al terminar el trabajo de la IA.
  const vigenteDe = useCallback((l: Propuesta[]) => l.find((x) => x.tipo === 'pausas-video' && x.estado === 'PENDIENTE'
    && x.pantallaId === video.pantallaId && x.pausas?.bloqueId === video.bloqueId) ?? null, [video.pantallaId, video.bloqueId]);
  const mostrarPropuesta = useCallback((p: Propuesta | null) => {
    setPropuesta(p);
    setElegidas(new Set(p?.pausas?.marcadores.map((m) => m.id) ?? []));
  }, []);
  const cargarPropuesta = useCallback(async () => {
    const c = cursoRef.current;
    if (!c || !editan) return;
    mostrarPropuesta(vigenteDe(await api.propuestas(c.id).catch(() => [] as Propuesta[])));
  }, [cursoRef, editan, mostrarPropuesta, vigenteDe]);
  useEffect(() => {
    const c = cursoRef.current;
    if (!c || !editan) return;
    let vigente = true;
    api.propuestas(c.id).then((l) => { if (vigente) mostrarPropuesta(vigenteDe(l)); }, () => undefined);
    return () => { vigente = false; };
  }, [cursoRef, editan, mostrarPropuesta, vigenteDe]);
  useEffect(() => {
    if (!pedido) return;
    const t = setTimeout(async () => {
      try {
        const trabajo = await api.trabajo(pedido.trabajoId);
        if (trabajo.estado === 'COMPLETADO') {
          setPedido(null);
          setAviso('La IA propuso pausas: revisa las marcas en espera y aplica las que quieras.');
          await cargarPropuesta();
        } else if (trabajo.estado === 'ERROR' || trabajo.estado === 'CANCELADO' || Date.now() - pedido.desde > LIMITE_MS) {
          setPedido(null);
          setAviso('');
          setError(trabajo.estado === 'ERROR' ? 'La IA no pudo proponer pausas. Intenta de nuevo.' : 'La propuesta tarda más de lo normal; vuelve a pedirla más tarde.');
        } else {
          setPedido((x) => (x ? { ...x } : x));
        }
      } catch {
        setPedido((x) => (x ? { ...x } : x));
      }
    }, CADA_MS);
    return () => clearTimeout(t);
  }, [pedido, cargarPropuesta]);

  const proponer = async () => {
    const c = cursoRef.current;
    if (!c) return;
    setError('');
    setOmitidas([]);
    try {
      const t = await api.pedirPausas(c.id, video.pantallaId);
      mostrarPropuesta(null);
      setPedido({ trabajoId: t.id, desde: Date.now() });
      setAviso('La IA está leyendo la transcripción del video…');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pedir la propuesta'));
    }
  };
  const elegir = (id: string, si: boolean) => setElegidas((x) => { const n = new Set(x); if (si) n.add(id); else n.delete(id); return n; });
  const aplicarElegidas = async () => {
    const c = cursoRef.current;
    if (!c || !propuesta) return;
    setOcupado(true);
    setError('');
    try {
      const r = await api.aplicarPausas(propuesta.id, propuesta.pausas!.marcadores.filter((m) => elegidas.has(m.id)).map((m) => m.id));
      // Se vuelve a leer el curso: los marcadores nuevos traen ids definitivos. «↶ Deshacer» vuelve a la lista de antes.
      const nuevo = await api.curso(proyectoId);
      cursoRef.current = nuevo;
      const lista = ordenar(pantallasConVideo(nuevo.documento as unknown as CursoDoc).find((v) => v.bloqueId === video.bloqueId)?.marcadores ?? []);
      setPila((p) => [...p, JSON.parse(guardada) as Version].slice(-30));
      setBorrador(lista);
      setGuardada(JSON.stringify({ m: lista, i: impedir }));
      mostrarPropuesta(null);
      setOmitidas(r.observaciones ?? []);
      const n = r.agregados?.length ?? 0;
      setAviso(`${n === 1 ? 'Se aplicó 1 pausa propuesta' : `Se aplicaron ${n} pausas propuestas`}; quedan marcadas como de la IA hasta que las revises.`);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron aplicar las pausas'));
      if (e instanceof ErrorApi && e.estado === 409) await cargarPropuesta();
    } finally {
      setOcupado(false);
    }
  };
  const descartarPropuesta = async () => {
    if (!propuesta) return;
    setError('');
    try {
      await api.descartarPropuesta(propuesta.id);
      mostrarPropuesta(null);
      setAviso('Propuesta descartada.');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo descartar la propuesta'));
    }
  };

  const cambiar = (id: string, f: (m: MarcadorVideo) => void) => {
    setAviso('');
    setBorrador((l) => ordenar(l.map((m) => { if (m.id !== id) return m; const copia = structuredClone(m); f(copia); return copia; })));
  };
  const ir = (ms: number) => { const v = reproductor.current; if (v) v.currentTime = ms / 1000; setTiempoMs(ms); };
  const agregar = () => {
    reproductor.current?.pause();
    const q = nuevaPregunta(video.pantallaId, borrador, Math.floor(tiempoMs / 1000) * 1000);
    setBorrador((l) => ordenar([...l, q]));
    setElegido(q.id);
    setAviso(`Pregunta agregada en ${mmss(q.tiempoMs)}: escribe el enunciado y las opciones.`);
  };
  const quitar = (id: string) => {
    setBorrador((l) => l.filter((m) => m.id !== id));
    setElegido(null);
    setAviso('Pregunta quitada.');
  };
  const deshacer = () => {
    const previa = pila.at(-1);
    if (!previa) return;
    setPila((p) => p.slice(0, -1));
    setBorrador(previa.m);
    setImpedir(previa.i);
    if (elegido && !previa.m.some((m) => m.id === elegido)) setElegido(null);
    void guardar(previa, 'deshacer');
  };

  const estado = !editan ? 'Solo lectura: tu rol puede ver las preguntas, no cambiarlas.'
    : errores.size ? 'Corrige la pregunta marcada para guardar.'
    : pendiente ? 'Guardando en un momento…' : '';
  const vistaPrevia = `/proyectos/${proyectoId}/vista-previa`;

  return (
    <div className="video-vista">
      <section className="tarjeta video-principal" aria-label="Video">
        <div className="video-pantalla">
          {url ? (
            <video
              ref={reproductor}
              src={url}
              controls
              preload="metadata"
              playsInline
              aria-label={`Video de la pantalla ${video.numero}`}
              onTimeUpdate={(e) => setTiempoMs(Math.round(e.currentTarget.currentTime * 1000))}
              onSeeked={(e) => setTiempoMs(Math.round(e.currentTarget.currentTime * 1000))}
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuracionVideo(Math.round(d * 1000)); }}
            />
          ) : <p className="video-sin-archivo">El archivo del video aún no está disponible. Puedes preparar las preguntas igual.</p>}
        </div>
        <div className="video-linea" role="group" aria-label="Línea de marcadores">
          <span className="video-linea-avance" style={{ width: `${posicion(tiempoMs, largo)}%` }} aria-hidden="true" />
          {borrador.map((m) => m.tipo === 'pregunta' ? (
            <button
              key={m.id}
              type="button"
              className={`video-marca pregunta${errores.has(m.id) ? ' con-error' : ''}`}
              style={{ left: `${posicion(m.tiempoMs, largo)}%` }}
              aria-pressed={elegido === m.id}
              aria-label={describir(m)}
              title={describir(m)}
              onClick={() => { setElegido(m.id); ir(m.tiempoMs); }}
            >
              <span aria-hidden="true">?</span>
            </button>
          ) : (
            <span key={m.id} className={`video-marca ${m.tipo}`} style={{ left: `${posicion(m.tiempoMs, largo)}%` }} role="img" aria-label={describir(m)} title={describir(m)} />
          ))}
          {propuesta?.pausas?.marcadores.map((m) => (
            <button
              key={`ia-${m.id}`}
              type="button"
              className={`video-marca en-espera ${m.tipo}`}
              style={{ left: `${posicion(m.tiempoMs, largo)}%` }}
              aria-pressed={elegidas.has(m.id)}
              aria-label={`Propuesta de la IA, ${describir(m)}`}
              title={`${describir(m)} (en espera)`}
              onClick={() => { elegir(m.id, !elegidas.has(m.id)); ir(m.tiempoMs); }}
            >
              <span aria-hidden="true">{m.tipo === 'pregunta' ? '?' : ''}</span>
            </button>
          ))}
        </div>
        <div className="fila video-acciones">
          <span className="num video-reloj" aria-live="off">{mmss(tiempoMs)}{duracion ? ` / ${mmss(duracion)}` : ''}</span>
          {editan ? <button type="button" className="boton primario" onClick={agregar}>+ Pregunta en {mmss(Math.floor(tiempoMs / 1000) * 1000)}</button> : null}
          {editan ? <button type="button" className="boton" onClick={deshacer} disabled={!pila.length}>↶ Deshacer</button> : null}
          {editan ? (
            <button type="button" className="boton ia" onClick={() => void proponer()} disabled={Boolean(pedido) || pendiente || errores.size > 0}>
              {pedido ? 'Proponiendo pausas…' : '✦ Proponer pausas desde la transcripción'}
            </button>
          ) : null}
          <a className="boton" href={vistaPrevia} onClick={(e) => { e.preventDefault(); navegar(vistaPrevia); }}>▶ Probar en la vista previa</a>
        </div>
        <label className="video-obligatoria">
          <input type="checkbox" checked={impedir} disabled={!editan} aria-describedby="video-impedir-ayuda" onChange={(e) => { setAviso(''); setImpedir(e.target.checked); }} />
          Impedir adelantar hasta responder
        </label>
        <p className="sec" id="video-impedir-ayuda">El participante no podrá ir más allá de una pregunta sin responderla o saltarla; retroceder siempre se puede. El porcentaje mínimo visto llega más adelante.</p>
      </section>

      <aside className="tarjeta video-panel" aria-label="Marcadores">
        <h2>Marcadores</h2>
        {error ? <div className="nota error" role="alert">{error}</div> : null}
        <p role="status" className={aviso || estado ? 'nota' : 'sr'}>{aviso || estado}</p>
        {borrador.length ? (
          <ul className="video-lista">
            {borrador.map((m) => (
              <li key={m.id} className={elegido === m.id ? 'elegido' : ''}>
                <span className="chip num">{mmss(m.tiempoMs)}</span>
                {m.tipo === 'pregunta' ? (
                  <button type="button" className="enlace" aria-pressed={elegido === m.id} onClick={() => { setElegido(m.id); ir(m.tiempoMs); }}>
                    {m.pregunta?.enunciado.es?.trim() || 'Pregunta sin enunciado'}
                  </button>
                ) : <span>{NOMBRE_TIPO[m.tipo]}{m.titulo?.es ? `: ${m.titulo.es}` : ''} <span className="sec">· se edita más adelante</span></span>}
                {errores.has(m.id) ? <span className="chip error">Por corregir</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="sec">Este video aún no tiene marcadores. Reproduce, detente donde quieras preguntar y pulsa «+ Pregunta».</p>}

        {omitidas.length ? (
          <div className="nota" role="note" aria-label="Pausas omitidas">
            <ul>{omitidas.map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
        ) : null}

        {propuesta?.pausas ? (
          <section className="video-propuesta" aria-labelledby="video-propuesta-titulo">
            <h3 id="video-propuesta-titulo">✦ Pausas propuestas por la IA</h3>
            <p className="sec">{propuesta.descripcion} Marca las que quieres aplicar; las demás se descartan.</p>
            {propuesta.pausas.observaciones.length ? <ul className="nota">{propuesta.pausas.observaciones.map((o) => <li key={o}>{o}</li>)}</ul> : null}
            <fieldset className="video-propuesta-lista">
              <legend>Marcas en espera</legend>
              {propuesta.pausas.marcadores.map((m) => (
                <label key={m.id} className="video-obligatoria">
                  <input type="checkbox" checked={elegidas.has(m.id)} onChange={(e) => elegir(m.id, e.target.checked)} />
                  {describir(m)}
                </label>
              ))}
            </fieldset>
            <div className="fila">
              <button type="button" className="boton primario" onClick={() => void aplicarElegidas()} disabled={ocupado || !elegidas.size || pendiente || errores.size > 0}>
                Aplicar las elegidas ({elegidas.size})
              </button>
              <button type="button" className="boton" onClick={() => void descartarPropuesta()} disabled={ocupado}>Descartar la propuesta</button>
            </div>
          </section>
        ) : null}

        {pregunta ? (
          <PanelPregunta
            key={pregunta.id}
            m={pregunta}
            error={errores.get(pregunta.id)}
            duracion={duracion}
            editan={editan}
            cambiar={(f) => cambiar(pregunta.id, f)}
            quitar={() => quitar(pregunta.id)}
          />
        ) : null}
      </aside>
    </div>
  );
}

function PanelPregunta({ m, error, duracion, editan, cambiar, quitar }: {
  m: MarcadorVideo;
  error: string | undefined;
  duracion: number | undefined;
  editan: boolean;
  cambiar: (f: (m: MarcadorVideo) => void) => void;
  quitar: () => void;
}) {
  const p = m.pregunta!;
  const idError = `${m.id}-error`;
  const conError = (que: RegExp) => Boolean(error && que.test(error));
  return (
    <fieldset className="video-pregunta" aria-describedby={error ? idError : undefined} disabled={!editan}>
      <legend>Pregunta en {mmss(m.tiempoMs)}</legend>
      <label className="campo">
        Segundo del video
        <input
          type="number" min={0} max={duracion ? Math.floor(duracion / 1000) : undefined} step={1}
          value={Math.round(m.tiempoMs / 1000)}
          aria-invalid={conError(/tiempo/) || undefined}
          onChange={(e) => { const s = e.target.valueAsNumber; cambiar((x) => { x.tiempoMs = Number.isFinite(s) ? Math.round(s * 1000) : -1; }); }}
        />
      </label>
      <label className="campo">
        Enunciado
        <input type="text" value={p.enunciado.es ?? ''} maxLength={200} aria-invalid={conError(/enunciado/) || undefined} onChange={(e) => { const v = e.target.value; cambiar((x) => { x.pregunta!.enunciado = { ...x.pregunta!.enunciado, es: v }; }); }} />
      </label>
      <fieldset className="video-opciones">
        <legend>Opciones (marca la correcta)</legend>
        {p.opciones.map((o, i) => (
          <div key={o.id} className="video-opcion">
            <input
              type="radio" name={`${m.id}-correcta`} checked={o.correcta} aria-label={`La opción ${i + 1} es la correcta`}
              onChange={() => cambiar((x) => { x.pregunta!.opciones.forEach((y) => { y.correcta = y.id === o.id; }); })}
            />
            <input
              type="text" value={o.contenido.texto?.es ?? ''} maxLength={120} aria-label={`Opción ${i + 1}`}
              aria-invalid={(conError(/opción vacía/) && !o.contenido.texto?.es?.trim()) || undefined}
              onChange={(e) => { const v = e.target.value; cambiar((x) => { x.pregunta!.opciones[i]!.contenido = { texto: { es: v } }; }); }}
            />
            {p.opciones.length > 2 ? (
              <button type="button" className="boton" onClick={() => cambiar((x) => {
                const quitada = x.pregunta!.opciones.splice(i, 1)[0]!;
                if (quitada.correcta && x.pregunta!.opciones[0]) x.pregunta!.opciones[0].correcta = true;
              })}>Quitar<span className="sr"> la opción {i + 1}</span></button>
            ) : null}
          </div>
        ))}
        {p.opciones.length < MAX_OPCIONES ? (
          <button type="button" className="boton" onClick={() => cambiar((x) => { x.pregunta!.opciones.push({ id: idOpcion(x), contenido: { texto: { es: '' } }, correcta: false }); })}>+ Opción</button>
        ) : null}
      </fieldset>
      <label className="campo">
        Retroalimentación al acertar
        <input type="text" value={p.retroalimentacion.correcta.es ?? ''} maxLength={200} onChange={(e) => { const v = e.target.value; cambiar((x) => { x.pregunta!.retroalimentacion.correcta = { es: v }; }); }} />
      </label>
      <label className="campo">
        Retroalimentación al fallar
        <input type="text" value={p.retroalimentacion.incorrecta.es ?? ''} maxLength={200} onChange={(e) => { const v = e.target.value; cambiar((x) => { x.pregunta!.retroalimentacion.incorrecta = { es: v }; }); }} />
      </label>
      <label className="video-obligatoria">
        <input type="checkbox" checked={m.obligatorio} onChange={(e) => { const v = e.target.checked; cambiar((x) => { x.obligatorio = v; }); }} />
        Obligatoria: sin «Saltar», hay que acertarla para seguir
      </label>
      {error ? <p className="nota error" id={idError}>{error}</p> : null}
      <button type="button" className="boton" onClick={quitar}>Quitar pregunta</button>
    </fieldset>
  );
}
