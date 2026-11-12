// HU-1103 · Navegación (PNT-17, M11, CP-087): el patrón define cómo se recorre la cápsula y las reglas, qué se puede
// saltar. Se combinan libremente sobre el mismo reproductor (seguimiento, reanudación y teclado iguales en todos).
// Administración y diseño instruccional guardan (versión nueva del curso); diseño gráfico y producción solo ven.
// «✦ Recomendar» y «✦ Crear con IA» llegan con la HU-1104; glosario, ayuda y accesibilidad, después.
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, EDITAN_NAVEGACION, ErrorApi, type ModoNavegacion, type Navegacion, type PatronNavegacion, type Proyecto, type Reanudar, type Rol } from '../api';
import { navegar } from '../ruta';
import { Miniatura } from './MiniaturaPatron';
import { NOMBRE_PATRON, PATRONES, type PatronBase } from './patrones-navegacion';

const MODOS: { id: ModoNavegacion; nombre: string; detalle: string }[] = [
  { id: 'libre', nombre: 'Libre', detalle: 'Va a cualquier pantalla' },
  { id: 'condiciones', nombre: 'Libre con actividades obligatorias', detalle: 'No salta una actividad sin hacerla' },
  { id: 'secuencial', nombre: 'Secuencial', detalle: 'Completa cada pantalla en orden' },
];
const REANUDAR: { id: Reanudar; nombre: string; detalle: string }[] = [
  { id: 'preguntar', nombre: 'Al volver: preguntar', detalle: '«¿Continuar donde lo dejaste?»' },
  { id: 'automatica', nombre: 'Al volver: continuar', detalle: 'Sin preguntar' },
  { id: 'no', nombre: 'Al volver: desde el inicio', detalle: 'No guarda la posición' },
];
/** Elementos que el reproductor ya muestra; los demás llegan después (se conservan si el curso los trae). */
const ELEMENTOS: { id: string; nombre: string; despues?: true }[] = [
  { id: 'temario', nombre: 'Temario' },
  { id: 'progreso', nombre: 'Progreso' },
  { id: 'contador', nombre: 'Pantalla X de Y' },
  { id: 'puntos', nombre: 'Puntos' },
  { id: 'glosario', nombre: 'Glosario', despues: true },
  { id: 'ayuda', nombre: 'Ayuda', despues: true },
  { id: 'accesibilidad', nombre: 'Accesibilidad', despues: true },
];
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);
interface Borrador { patron: PatronNavegacion; modo: ModoNavegacion; reanudar: Reanudar; mostrar: string[]; preferido: boolean }
const borradorDe = (n: Navegacion): Borrador => ({
  patron: n.patron, modo: n.modo ?? 'condiciones', reanudar: n.reanudar ?? 'preguntar',
  mostrar: n.mostrar ?? ['temario', 'progreso'], preferido: n.patronPreferidoDelCliente,
});
const igual = (a: Borrador, b: Borrador) => JSON.stringify({ ...a, mostrar: [...a.mostrar].sort() }) === JSON.stringify({ ...b, mostrar: [...b.mostrar].sort() });

export function NavegacionVista({ proyectoId, rol, alCargar }: { proyectoId: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cursoId, setCursoId] = useState<string | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [nav, setNav] = useState<Navegacion | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const editan = EDITAN_NAVEGACION.includes(rol);

  useEffect(() => {
    api.proyecto(proyectoId).then((p) => {
      setProyecto(p);
      alCargar(p.nombre);
      api.curso(proyectoId).then((c) => setCursoId(c.id), (e: unknown) => {
        if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
        else setError(mensajeDe(e, 'No se pudo cargar el curso'));
      });
    }, (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el proyecto')));
  }, [proyectoId, alCargar]);

  useEffect(() => {
    if (!cursoId) return;
    let vigente = true;
    api.navegacion(cursoId).then((n) => {
      if (!vigente) return;
      setNav(n);
      setBorrador(borradorDe(n));
    }, (e: unknown) => vigente && setError(mensajeDe(e, 'No se pudo cargar la navegación')));
    return () => {
      vigente = false;
    };
  }, [cursoId]);

  const cambiar = (x: Partial<Borrador>) => {
    setAviso('');
    setBorrador((b) => (b ? { ...b, ...x } : b));
  };

  async function guardar() {
    if (!cursoId || !nav || !borrador) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const n = await api.guardarNavegacion(cursoId, {
        version: nav.version, patron: borrador.patron, modo: borrador.modo, reanudar: borrador.reanudar, mostrar: borrador.mostrar,
        ...(borrador.preferido && nav.patronPreferido !== borrador.patron ? { patronPreferidoDelCliente: true } : {}),
      });
      setNav(n);
      setBorrador(borradorDe(n));
      setAviso(`Navegación guardada · versión ${n.version} del curso`);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar la navegación'));
      if (e instanceof ErrorApi && e.estado === 409) {
        const n = await api.navegacion(cursoId).catch(() => null);
        if (n) {
          setNav(n);
          setBorrador(borradorDe(n));
        }
      }
    } finally {
      setOcupado(false);
    }
  }

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error && !proyecto) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Navegación" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="sec">El curso todavía no tiene pantallas. Genera el SCORM y vuelve aquí para elegir cómo se recorre.</p>
      </>
    );
  }
  if (!proyecto || !nav || !borrador) return error ? <div className="nota error" role="alert">{error}</div> : <p className="sec" role="status">Cargando navegación…</p>;

  const pendiente = !igual(borrador, borradorDe(nav));
  const elegido = borrador.patron;
  const base: PatronBase = elegido === 'personalizado' ? 'clasico' : elegido;
  const probar = `/proyectos/${proyectoId}/vista-previa?${new URLSearchParams({ patron: elegido, modo: borrador.modo })}`;
  const tarjetas = elegido === 'personalizado' || nav.patron === 'personalizado'
    ? [...PATRONES, { id: 'personalizado' as const, nombre: 'Personalizado', descripcion: 'Usa su patrón base; sus opciones llegan después', uso: 'Configuración propia' }]
    : PATRONES;

  return (
    <>
      <Cabecera titulo="Navegación" subtitulo={`${proyecto.nombre} · versión ${nav.version} del curso`} accion={volver} />
      <p className="sec">El patrón define cómo se recorre la cápsula; las reglas, qué se puede saltar. Se combinan libremente.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <div role="status" className={aviso ? 'nota' : 'sr'}>{aviso}</div>
      {editan ? null : <p className="nota">Solo lectura: administración y diseño instruccional cambian la navegación.</p>}
      <div className="columnas navegacion">
        <div className="navegacion-principal">
          <section className="tarjeta" aria-labelledby="nav-patron">
            <h2 id="nav-patron">Patrón de navegación</h2>
            <div className="patrones" role="group" aria-labelledby="nav-patron">
              {tarjetas.map((p) => (
                <button key={p.id} type="button" className="patron-tarjeta" aria-pressed={elegido === p.id} disabled={!editan || ocupado} onClick={() => cambiar({ patron: p.id, preferido: nav.patronPreferido === p.id })}>
                  <Miniatura patron={p.id === 'personalizado' ? base : p.id} />
                  <b>{p.nombre}</b>
                  <small>{p.descripcion}</small>
                  <small className="patron-uso">{p.uso}</small>
                  {nav.patronPreferido === p.id ? <span className="chip validado">Preferido del cliente</span> : null}
                </button>
              ))}
            </div>
          </section>
          <section className="tarjeta" aria-labelledby="nav-reglas">
            <h2 id="nav-reglas">Reglas</h2>
            <fieldset className="opciones-tarjeta" disabled={!editan || ocupado}>
              <legend>Avance</legend>
              {MODOS.map((m) => (
                <label key={m.id} className={`opcion-tarjeta${borrador.modo === m.id ? ' activa' : ''}`}>
                  <input type="radio" name="nav-modo" value={m.id} checked={borrador.modo === m.id} onChange={() => cambiar({ modo: m.id })} />
                  <span><b>{m.nombre}</b><small>{m.detalle}</small></span>
                </label>
              ))}
            </fieldset>
            <fieldset className="opciones-tarjeta" disabled={!editan || ocupado}>
              <legend>Al volver al curso</legend>
              {REANUDAR.map((m) => (
                <label key={m.id} className={`opcion-tarjeta${borrador.reanudar === m.id ? ' activa' : ''}`}>
                  <input type="radio" name="nav-reanudar" value={m.id} checked={borrador.reanudar === m.id} onChange={() => cambiar({ reanudar: m.id })} />
                  <span><b>{m.nombre}</b><small>{m.detalle}</small></span>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="tarjeta" aria-labelledby="nav-elementos">
            <h2 id="nav-elementos">Elementos visibles</h2>
            <div className="elementos-visibles">
              {ELEMENTOS.map((x) => (
                <label key={x.id} className={x.despues ? 'deshabilitado' : ''}>
                  <input
                    type="checkbox"
                    checked={borrador.mostrar.includes(x.id)}
                    disabled={!editan || ocupado || x.despues}
                    onChange={(e) => cambiar({ mostrar: e.target.checked ? [...borrador.mostrar, x.id] : borrador.mostrar.filter((y) => y !== x.id) })}
                  />
                  {x.nombre}
                  {x.despues ? <span className="chip">llega después</span> : null}
                </label>
              ))}
            </div>
          </section>
        </div>
        <aside className="tarjeta navegacion-elegido" aria-labelledby="nav-elegido">
          <h2 id="nav-elegido">Elegido: {NOMBRE_PATRON[elegido]}</h2>
          <Miniatura patron={base} />
          <label className={nav.hayKit ? '' : 'deshabilitado'}>
            <input type="checkbox" checked={borrador.preferido} disabled={!editan || ocupado || !nav.hayKit || nav.patronPreferido === elegido} onChange={(e) => cambiar({ preferido: e.target.checked })} />
            Usar como preferido del cliente
          </label>
          {nav.hayKit ? null : <p className="sec">El cliente aún no tiene kit de marca; créalo para guardar su patrón preferido.</p>}
          <a className="boton" href={probar} onClick={(e) => { e.preventDefault(); navegar(probar); }}>▶ Probar este patrón</a>
          {editan ? (
            <button type="button" className="boton primario" disabled={ocupado || !pendiente} onClick={() => void guardar()}>{ocupado ? 'Guardando…' : 'Guardar navegación'}</button>
          ) : null}
          {pendiente ? <p className="sec">Hay cambios sin guardar. «Probar» los muestra sin guardarlos.</p> : null}
          <div className="nota validado">
            <b>En todos los patrones:</b> registro de avance y nota en el LMS, reanudación, teclado y lector de pantalla, y botones como alternativa a deslizar.
          </div>
        </aside>
      </div>
    </>
  );
}
