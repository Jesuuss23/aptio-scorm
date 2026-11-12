// HU-0802 · Idiomas (PNT-11): el inglés de cada texto del curso con su estado, agrupado por pantalla.
// «✦ Traducir pendientes» manda a la IA solo lo Pendiente, con el glosario del cliente (RN-08-1); lo Revisado no se toca
// (RN-08-2, CP-077). Editar el inglés a mano lo deja Revisado; «Marcar revisado» confirma el de la IA. El avance llega por
// SSE (un evento por lote guardado) con consulta cada 2 s de respaldo. El revisor del cliente solo ve.
// HU-0803 · Desbordes (RN-08-3, CP-078): el inglés que no cabe en su componente queda en Desborde con «72 de 60
// caracteres» y la versión corta de la IA («Usar versión corta»); mientras se escribe, un contador avisa.
// HU-0804 · «Voz en inglés» (VozIngles): voz, boca y subtítulos en inglés de las narraciones ya traducidas.
import { NOMBRE_ESTADO } from '@aptio/schema/traduccion';
import { Cabecera } from '@aptio/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Curso, ErrorApi, type Proyecto, type Rol, type TerminoGlosario, type Traduccion, TRADUCEN } from '../api';
import { navegar } from '../ruta';
import { VozIngles } from './VozIngles';

const CONSULTA_MS = 2000;
const CLASE_ESTADO: Record<Traduccion['estado'], string> = { PENDIENTE: 'chip', TRADUCIDA_IA: 'chip ia', REVISADA: 'chip validado', DESBORDE: 'chip aviso' };
type Filtro = 'todas' | 'revisar';
type Avance = { id: string; progreso: number; mensaje: string };

/** Los borradores sin el de una fila (ya se guardó o no cambió). */
const sinClave = (b: Record<string, string>, id: string) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== id));
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

/** Número y título de cada pantalla del documento, para agrupar los textos. */
function pantallasDe(doc: Record<string, unknown>): Map<string, { n: number; titulo: string }> {
  const mapa = new Map<string, { n: number; titulo: string }>();
  const lista = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  for (const m of lista<{ capsulas?: unknown }>(doc.modulos)) {
    for (const c of lista<{ pantallas?: unknown }>(m.capsulas)) {
      for (const p of lista<{ id?: string; titulo?: { es?: string } }>(c.pantallas)) {
        if (p.id) mapa.set(p.id, { n: mapa.size + 1, titulo: p.titulo?.es ?? '' });
      }
    }
  }
  return mapa;
}

export function IdiomasVista({ proyectoId, rol, alCargar }: { proyectoId: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [filas, setFilas] = useState<Traduccion[] | null>(null);
  const [glosario, setGlosario] = useState<TerminoGlosario[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [avance, setAvance] = useState<Avance | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupada, setOcupada] = useState<string | null>(null);
  const puedeEditar = TRADUCEN.includes(rol);
  const cursoId = curso?.id;

  useEffect(() => {
    api.proyecto(proyectoId).then((p) => {
      setProyecto(p);
      alCargar(p.nombre);
      api.glosario(p.clienteId).then(setGlosario, () => setGlosario([]));
      api.curso(proyectoId).then(setCurso, (e: unknown) => {
        if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
        else setError(mensajeDe(e, 'No se pudo cargar el curso'));
      });
    }, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el proyecto')));
  }, [proyectoId, alCargar]);

  const recargarCurso = useCallback(() => {
    api.curso(proyectoId).then(setCurso, () => undefined);
  }, [proyectoId]);

  const recargar = useCallback(() => {
    if (!cursoId) return;
    api.traducciones(cursoId).then(setFilas, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los textos')));
  }, [cursoId]);
  useEffect(recargar, [recargar]);

  // En vivo: cada lote guardado llega como evento del trabajo y recarga la lista; la consulta cada 2 s cubre un SSE caído.
  const trabajoId = avance?.id;
  const terminar = useRef<(estado: string, mensaje?: string | null) => void>(() => undefined);
  useEffect(() => {
    terminar.current = (estado, mensaje) => {
      setAvance(null);
      recargar();
      if (estado === 'COMPLETADO') setAviso(mensaje || 'Traducción terminada');
      else setError(mensaje ? `La traducción no terminó: ${mensaje}` : 'La traducción no terminó');
    };
  }, [recargar]);
  useEffect(() => {
    if (!trabajoId) return;
    let fuente: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      fuente = new EventSource('/api/v1/eventos');
      fuente.addEventListener('trabajo', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent<string>).data) as { trabajoId?: string; estado?: string; progreso?: number; mensaje?: string };
          if (d.trabajoId !== trabajoId) return;
          if (d.estado === 'COMPLETADO' || d.estado === 'ERROR') return terminar.current(d.estado, d.mensaje);
          setAvance((a) => (a ? { ...a, progreso: d.progreso ?? a.progreso, mensaje: d.mensaje ?? a.mensaje } : a));
          if (d.progreso) recargar();
        } catch {
          // Un evento que no se entiende no cambia nada: la consulta periódica sigue.
        }
      });
      fuente.onerror = () => fuente?.close();
    }
    const t = setInterval(() => {
      api.trabajo(trabajoId).then((tr) => {
        if (tr.estado === 'COMPLETADO' || tr.estado === 'ERROR' || tr.estado === 'CANCELADO') terminar.current(tr.estado === 'COMPLETADO' ? 'COMPLETADO' : 'ERROR', tr.error);
      }, () => undefined);
    }, CONSULTA_MS);
    return () => {
      clearInterval(t);
      fuente?.close();
    };
  }, [trabajoId, recargar]);

  async function traducir() {
    if (!cursoId) return;
    setError('');
    setAviso('');
    try {
      const t = await api.traducir(cursoId);
      setAvance({ id: t.id, progreso: 0, mensaje: 'En cola…' });
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pedir la traducción'));
    }
  }

  async function cambiar(fila: Traduccion, datos: { en?: string; estado?: 'REVISADA' }) {
    setOcupada(fila.id);
    setError('');
    try {
      const nueva = await api.cambiarTraduccion(fila.id, datos);
      setFilas((l) => l?.map((f) => (f.id === nueva.id ? nueva : f)) ?? l);
      setBorradores((b) => sinClave(b, fila.id));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar el inglés'));
    } finally {
      setOcupada(null);
    }
  }

  /** Al salir de la celda se guarda el inglés escrito; vacío o igual al actual no cambia nada. */
  function guardarBorrador(fila: Traduccion) {
    const texto = borradores[fila.id]?.trim();
    if (texto === undefined) return;
    if (!texto || texto === fila.en) {
      setBorradores((b) => sinClave(b, fila.id));
      return;
    }
    void cambiar(fila, { en: texto });
  }

  const pantallas = useMemo(() => (curso ? pantallasDe(curso.documento) : new Map<string, { n: number; titulo: string }>()), [curso]);
  const grupos = useMemo(() => {
    const visibles = (filas ?? []).filter((f) => filtro === 'todas' || f.estado !== 'REVISADA');
    const mapa = new Map<string, Traduccion[]>();
    for (const f of visibles) {
      const clave = f.pantallaId ?? '';
      mapa.set(clave, [...(mapa.get(clave) ?? []), f]);
    }
    return [...mapa.entries()];
  }, [filas, filtro]);

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error && !proyecto) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Idiomas" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="nota">Este proyecto aún no tiene pantallas. Genera el SCORM y, cuando termine, vuelve aquí para traducirlo.</p>
      </>
    );
  }
  if (!proyecto || !curso || !filas) return error ? <div className="nota error" role="alert">{error}</div> : <p className="sec" role="status">Cargando textos…</p>;

  const cuenta = (e: Traduccion['estado']) => filas.filter((f) => f.estado === e).length;
  const pendientes = cuenta('PENDIENTE');
  return (
    <>
      <Cabecera
        titulo="Idiomas"
        subtitulo={`${proyecto.nombre} · Español e inglés en el mismo curso. La IA traduce con el glosario del cliente; tú revisas.`}
        accion={
          <div className="acciones-form">
            {puedeEditar ? (
              <button className="boton ia" type="button" disabled={Boolean(avance) || !pendientes} onClick={() => void traducir()}>
                {avance ? 'Traduciendo…' : '✦ Traducir pendientes'}
              </button>
            ) : null}
            {volver}
          </div>
        }
      />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
      {avance ? (
        <div className="nota avance-traduccion" role="status" aria-live="polite">
          <span>{avance.mensaje}</span>
          <span className="barra" role="progressbar" aria-label="Avance de la traducción" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance.progreso}>
            <i style={{ width: `${avance.progreso}%` }} />
          </span>
        </div>
      ) : null}
      <div className="columnas idiomas">
        <section className="tarjeta kit-bloque idiomas-textos" aria-label="Textos del curso">
          <div className="fila-chips">
            <div className="opciones" role="group" aria-label="Filtrar textos">
              <button type="button" className="opcion" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</button>
              <button type="button" className="opcion" aria-pressed={filtro === 'revisar'} onClick={() => setFiltro('revisar')}>Por revisar</button>
            </div>
            <span className="sec" data-conteo>
              {filas.length} textos · {pendientes} pendientes · {cuenta('TRADUCIDA_IA')} traducidos por IA · {cuenta('DESBORDE')} desbordes · {cuenta('REVISADA')} revisados
            </span>
          </div>
          {grupos.length ? (
            <div className="tabla-entrega">
              <table className="tabla-idiomas">
                <thead><tr><th scope="col">Español</th><th scope="col">Inglés</th><th scope="col">Estado</th></tr></thead>
                {grupos.map(([pantallaId, lista]) => {
                  const p = pantallas.get(pantallaId);
                  return (
                    <tbody key={pantallaId || 'curso'} data-pantalla={pantallaId || 'curso'}>
                      <tr className="grupo-idiomas"><th scope="rowgroup" colSpan={3}>{p ? `Pantalla ${String(p.n).padStart(2, '0')} · ${p.titulo}` : 'Datos del curso'}</th></tr>
                      {lista.map((f) => (
                        <tr key={f.id} data-ruta={f.ruta} data-estado={f.estado}>
                          <td lang="es">{f.es}</td>
                          <td>
                            <textarea
                              className="entrada-en"
                              lang="en"
                              rows={Math.min(6, Math.max(1, Math.ceil(Math.max(f.es.length, (borradores[f.id] ?? f.en ?? '').length) / 34)))}
                              aria-label={`Inglés de «${f.es.slice(0, 60)}»`}
                              value={borradores[f.id] ?? f.en ?? ''}
                              placeholder="Sin traducir"
                              readOnly={!puedeEditar}
                              disabled={ocupada === f.id}
                              onChange={(e) => setBorradores((b) => ({ ...b, [f.id]: e.target.value }))}
                              onBlur={() => guardarBorrador(f)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                            />
                            <Contador texto={borradores[f.id] ?? f.en ?? ''} limite={f.limite} editando={f.id in borradores} />
                            {f.estado === 'PENDIENTE' && f.en ? <small className="sec">El español cambió: este inglés es el anterior.</small> : null}
                            {f.estado === 'DESBORDE' && f.propuesta ? (
                              <div className="propuesta-corta">
                                <small className="sec">Versión corta propuesta ({f.propuesta.length} caracteres):</small>
                                <span lang="en">{f.propuesta}</span>
                                {puedeEditar ? (
                                  <button className="boton ia marcar-revisado" type="button" disabled={ocupada === f.id} onClick={() => void cambiar(f, { en: f.propuesta! })}>Usar versión corta</button>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span className={CLASE_ESTADO[f.estado]}>{NOMBRE_ESTADO[f.estado]}</span>
                            {f.estado === 'DESBORDE' && f.limite !== null && f.caracteres !== null ? <small className="detalle-desborde">{f.caracteres} de {f.limite} caracteres</small> : null}
                            {puedeEditar && f.estado !== 'REVISADA' && f.en ? (
                              <button className="boton marcar-revisado" type="button" disabled={ocupada === f.id} onClick={() => void cambiar(f, { estado: 'REVISADA' })}>Marcar revisado</button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          ) : <p className="nota validado">Todos los textos están revisados.</p>}
        </section>
        <div className="idiomas-lateral">
        <VozIngles cursoId={curso.id} documento={curso.documento} puedeGenerar={puedeEditar} alTerminar={recargarCurso} />
        <aside className="tarjeta kit-bloque idiomas-glosario" aria-label="Glosario del cliente">
          <h2>Glosario del cliente</h2>
          {glosario.length ? (
            <div className="fila-chips">
              {glosario.map((t) => <span key={t.termino} className="chip">{t.termino} → {t.noTraducir ? `${t.termino} (no se traduce)` : t.traduccion}</span>)}
            </div>
          ) : <p className="sec">El cliente aún no tiene glosario. La IA traduce sin términos fijos.</p>}
          <p className="sec">La IA respeta el glosario en cada texto: si no lo cumple, se vuelve a pedir. Lo revisado no se manda a traducir.</p>
        </aside>
        </div>
      </div>
    </>
  );
}

/** HU-0803 · Caracteres del inglés frente al límite de su componente; en rojo de aviso si no cabe. */
function Contador({ texto, limite, editando }: { texto: string; limite: number | null; editando: boolean }) {
  if (limite === null || (!editando && !texto)) return null;
  const n = texto.trim().length;
  return (
    <small className={n > limite ? 'contador-caracteres excede' : 'contador-caracteres'} aria-live={editando ? 'polite' : 'off'} data-contador>
      {n} / {limite}{n > limite ? ' · no cabe' : ''}
    </small>
  );
}
