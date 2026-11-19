// HU-1103 · Navegación (PNT-17, M11, CP-087): el patrón define cómo se recorre la cápsula y las reglas, qué se puede
// saltar. Se combinan libremente sobre el mismo reproductor (seguimiento, reanudación y teclado iguales en todos).
// Administración y diseño instruccional guardan (versión nueva del curso); diseño gráfico y producción solo ven.
// HU-1104 · «✦ Recomendar» y «✦ Crear con IA» (CP-088): IA-14 propone un patrón; la franja «✦ Propuesta de la IA» lo
// muestra con su miniatura y se aplica (solo cambia el patrón, versión nueva) o se descarta.
// SUP-104 · Glosario, ayuda y accesibilidad se encienden en «Elementos visibles»; los términos del glosario se escriben aquí
// (en los idiomas del proyecto) y se guardan con la navegación.
import { Cabecera } from '@aptio/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, EDITAN_NAVEGACION, ErrorApi, type ModoNavegacion, type ModoPatron, type Navegacion, type PatronNavegacion, type Propuesta, type Proyecto, type Reanudar, type Rol, type TerminoGlosarioCurso } from '../api';
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
/** Elementos que el reproductor muestra en la barra del curso. */
const ELEMENTOS: { id: string; nombre: string }[] = [
  { id: 'temario', nombre: 'Temario' },
  { id: 'progreso', nombre: 'Progreso' },
  { id: 'contador', nombre: 'Pantalla X de Y' },
  { id: 'puntos', nombre: 'Puntos' },
  { id: 'glosario', nombre: 'Glosario' },
  { id: 'ayuda', nombre: 'Ayuda' },
  { id: 'accesibilidad', nombre: 'Accesibilidad' },
];
/** Id de un término nuevo: el texto en minúsculas sin tildes, más un sufijo para que no se repita. */
const idTermino = (texto: string, usados: Set<string>) => {
  const base = (texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'termino').padEnd(2, '0');
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
};
const CADA_MS = 1500;
const LIMITE_MS = 120_000;
/** HU-1104 · La última propuesta de patrón, mientras esté pendiente o vencida (con «Recalcular propuesta»). */
const vigenteDe = (l: Propuesta[]) => l.find((p) => p.tipo === 'patron' && p.patron && (p.estado === 'PENDIENTE' || p.estado === 'VENCIDA')) ?? null;
const baseDe = (patron: PatronNavegacion, personalizado?: { base: PatronBase }): PatronBase => (patron === 'personalizado' ? personalizado?.base ?? 'clasico' : patron);
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);
interface Borrador { patron: PatronNavegacion; modo: ModoNavegacion; reanudar: Reanudar; mostrar: string[]; preferido: boolean; glosario: TerminoGlosarioCurso[] }
const borradorDe = (n: Navegacion): Borrador => ({
  patron: n.patron, modo: n.modo ?? 'condiciones', reanudar: n.reanudar ?? 'preguntar',
  mostrar: n.mostrar ?? ['temario', 'progreso'], preferido: n.patronPreferidoDelCliente, glosario: n.glosario ?? [],
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
  const [descripcion, setDescripcion] = useState('');
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [pedido, setPedido] = useState<{ trabajoId: string; desde: number } | null>(null);
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

  // HU-1104 · La propuesta de patrón vigente al abrir y al terminar el trabajo de la IA.
  const cargarPropuesta = useCallback(async () => {
    if (!cursoId || !editan) return;
    setPropuesta(vigenteDe(await api.propuestas(cursoId).catch(() => [] as Propuesta[])));
  }, [cursoId, editan]);
  useEffect(() => {
    if (!cursoId || !editan) return;
    let vigente = true;
    api.propuestas(cursoId).then((l) => vigente && setPropuesta(vigenteDe(l)), () => undefined);
    return () => {
      vigente = false;
    };
  }, [cursoId, editan]);

  useEffect(() => {
    if (!pedido) return;
    const t = setTimeout(async () => {
      try {
        const trabajo = await api.trabajo(pedido.trabajoId);
        if (trabajo.estado === 'COMPLETADO') {
          setPedido(null);
          await cargarPropuesta();
        } else if (trabajo.estado === 'ERROR' || trabajo.estado === 'CANCELADO' || Date.now() - pedido.desde > LIMITE_MS) {
          setPedido(null);
          setError(trabajo.estado === 'ERROR' ? 'La IA no pudo preparar la propuesta. Intenta de nuevo.' : 'La propuesta tarda más de lo normal; vuelve a pedirla más tarde.');
        } else {
          setPedido((x) => (x ? { ...x } : x));
        }
      } catch {
        setPedido((x) => (x ? { ...x } : x));
      }
    }, CADA_MS);
    return () => clearTimeout(t);
  }, [pedido, cargarPropuesta]);

  async function proponer(modo: ModoPatron, texto = descripcion) {
    if (!cursoId) return;
    const limpio = texto.trim();
    setError('');
    setAviso('');
    if (modo === 'crear' && !limpio) {
      setError('Describe cómo quieres el patrón para crearlo con IA.');
      return;
    }
    try {
      const t = await api.pedirPatron(cursoId, modo === 'crear' ? { modo, descripcion: limpio } : { modo });
      setPropuesta(null);
      setPedido({ trabajoId: t.id, desde: Date.now() });
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pedir la propuesta'));
    }
  }

  async function aplicar() {
    if (!cursoId || !propuesta) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await api.aplicarPropuesta(propuesta.id);
      const n = await api.navegacion(cursoId);
      setNav(n);
      setBorrador(borradorDe(n));
      setPropuesta(null);
      setAviso(`Patrón aplicado · versión ${r.version} del curso`);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo aplicar la propuesta'));
      await cargarPropuesta();
    } finally {
      setOcupado(false);
    }
  }

  async function descartar() {
    if (!propuesta) return;
    setOcupado(true);
    setError('');
    try {
      await api.descartarPropuesta(propuesta.id);
      setPropuesta(null);
      setAviso('Propuesta descartada');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo descartar la propuesta'));
    } finally {
      setOcupado(false);
    }
  }

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
      // Cada término necesita su texto y su definición en los idiomas del proyecto.
      const idiomas = proyecto?.idiomas.length ? proyecto.idiomas : ['es' as const];
      const incompleto = borrador.glosario.findIndex((x) => idiomas.some((i) => !x.termino[i]?.trim() || !x.definicion[i]?.trim()));
      if (incompleto >= 0) throw new Error(`Completa el término ${incompleto + 1} del glosario: texto y definición${idiomas.length > 1 ? ' en español e inglés' : ''}`);
      const glosarioCambio = JSON.stringify(borrador.glosario) !== JSON.stringify(nav.glosario ?? []);
      const n = await api.guardarNavegacion(cursoId, {
        version: nav.version, patron: borrador.patron, modo: borrador.modo, reanudar: borrador.reanudar, mostrar: borrador.mostrar,
        ...(borrador.preferido && nav.patronPreferido !== borrador.patron ? { patronPreferidoDelCliente: true } : {}),
        ...(glosarioCambio ? { glosario: idsGlosario(borrador.glosario, idiomas[0]!).map((x) => ({ id: x.id, termino: limpio(x.termino), definicion: limpio(x.definicion) })) } : {}),
      });
      setNav(n);
      setBorrador(borradorDe(n));
      setAviso(`Navegación guardada · versión ${n.version} del curso`);
    } catch (e) {
      setError(e instanceof Error && !(e instanceof ErrorApi) ? e.message : mensajeDe(e, 'No se pudo guardar la navegación'));
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
  const propio = nav.patronPersonalizado;
  const base = baseDe(elegido, propio);
  const conMarcador = elegido === 'personalizado' && Boolean(propio?.marcador);
  const conIa = elegido === 'personalizado' && propio?.origen === 'ia';
  const nombreElegido = elegido === 'personalizado' && propio ? propio.nombre : NOMBRE_PATRON[elegido];
  const probar = `/proyectos/${proyectoId}/vista-previa?${new URLSearchParams({ patron: elegido, modo: borrador.modo })}`;
  const tarjetas = elegido === 'personalizado' || nav.patron === 'personalizado'
    ? [...PATRONES, {
        id: 'personalizado' as const,
        nombre: propio?.nombre ?? 'Personalizado',
        descripcion: propio?.origen === 'ia' ? 'Creado con IA desde tu descripción' : 'Patrón base con opciones propias',
        uso: 'Personalizado',
      }]
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
            <div className="patron-encabezado">
              <h2 id="nav-patron">Patrón de navegación</h2>
              {editan ? <button type="button" className="boton ia" disabled={ocupado || Boolean(pedido)} onClick={() => void proponer('recomendar')}>✦ Recomendar</button> : null}
            </div>
            <div className="patrones" role="group" aria-labelledby="nav-patron">
              {tarjetas.map((p) => (
                <button key={p.id} type="button" className="patron-tarjeta" aria-pressed={elegido === p.id} disabled={!editan || ocupado} onClick={() => cambiar({ patron: p.id, preferido: nav.patronPreferido === p.id })}>
                  {p.id === 'personalizado'
                    ? <Miniatura patron={baseDe('personalizado', propio)} ia={propio?.origen === 'ia'} marcador={Boolean(propio?.marcador)} />
                    : <Miniatura patron={p.id} />}
                  <b>{p.nombre}{p.id === 'personalizado' && propio?.origen === 'ia' ? <span className="chip ia">✦ IA</span> : null}</b>
                  <small>{p.descripcion}</small>
                  <small className="patron-uso">{p.uso}</small>
                  {nav.patronPreferido === p.id ? <span className="chip validado">Preferido del cliente</span> : null}
                </button>
              ))}
            </div>
            {editan ? (
              <form className="patron-crear" onSubmit={(e) => { e.preventDefault(); void proponer('crear'); }}>
                <input
                  type="text"
                  value={descripcion}
                  maxLength={300}
                  placeholder="Describe un patrón: «que parezca un tablero de misiones de seguridad»"
                  aria-label="Describe un patrón"
                  disabled={ocupado || Boolean(pedido)}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
                <button type="submit" className="boton ia" disabled={ocupado || Boolean(pedido)}>✦ Crear con IA</button>
              </form>
            ) : null}
            {pedido ? <p className="sec" role="status">✦ La IA está preparando la propuesta…</p> : null}
            {propuesta?.patron ? (
              <FranjaPatron
                propuesta={propuesta}
                proyectoId={proyectoId}
                modo={borrador.modo}
                ocupado={ocupado}
                alAplicar={() => void aplicar()}
                alDescartar={() => void descartar()}
                alRecalcular={() => void proponer(propuesta.patron!.modo, propuesta.patron!.descripcion ?? '')}
              />
            ) : null}
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
                <label key={x.id}>
                  <input
                    type="checkbox"
                    checked={borrador.mostrar.includes(x.id)}
                    disabled={!editan || ocupado}
                    onChange={(e) => cambiar({ mostrar: e.target.checked ? [...borrador.mostrar, x.id] : borrador.mostrar.filter((y) => y !== x.id) })}
                  />
                  {x.nombre}
                </label>
              ))}
            </div>
            {borrador.mostrar.includes('glosario') ? (
              <EditorGlosario
                terminos={borrador.glosario}
                idiomas={proyecto.idiomas.length ? proyecto.idiomas : ['es']}
                editan={editan && !ocupado}
                cambiar={(glosario) => cambiar({ glosario })}
              />
            ) : null}
          </section>
        </div>
        <aside className="tarjeta navegacion-elegido" aria-labelledby="nav-elegido">
          <h2 id="nav-elegido">Elegido: {nombreElegido}</h2>
          <Miniatura patron={base} ia={conIa} marcador={conMarcador} />
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

/** HU-1104 · Franja «✦ Propuesta de la IA» del patrón (prototipo PNT-17): motivo, miniatura de la base, Aplicar y Descartar. */
function FranjaPatron({ propuesta, proyectoId, modo, ocupado, alAplicar, alDescartar, alRecalcular }: {
  propuesta: Propuesta; proyectoId: string; modo: ModoNavegacion; ocupado: boolean; alAplicar: () => void; alDescartar: () => void; alRecalcular: () => void;
}) {
  const p = propuesta.patron!;
  const vencida = propuesta.estado === 'VENCIDA';
  const propio = p.navegacion.patronPersonalizado;
  const alternativa = p.alternativa.patron;
  const probarAlternativa = `/proyectos/${proyectoId}/vista-previa?${new URLSearchParams({ patron: alternativa, modo })}`;
  return (
    <section className="franja-ia franja-patron" aria-label="Propuesta de la IA">
      <div className="franja-ia-texto">
        <b>✦ {propuesta.titulo}</b>
        <span>{vencida ? 'El curso cambió desde que se calculó esta propuesta.' : p.recomendado.motivo}</span>
        {!vencida && p.modo === 'recomendar' ? (
          <div className="patron-alternativa">
            <b>Alternativa: {NOMBRE_PATRON[alternativa]}</b>
            <span>{p.alternativa.motivo}</span>
            <a href={probarAlternativa} onClick={(e) => { e.preventDefault(); navegar(probarAlternativa); }}>Probar alternativa</a>
          </div>
        ) : null}
      </div>
      <div className="franja-patron-miniatura">
        <Miniatura patron={baseDe(p.navegacion.patron, propio)} ia marcador={Boolean(propio?.marcador)} />
      </div>
      <div className="acciones-form">
        {vencida ? (
          <button type="button" className="boton ia" disabled={ocupado} onClick={alRecalcular}>Recalcular propuesta</button>
        ) : (
          <button type="button" className="boton ia" disabled={ocupado} onClick={alAplicar}>Aplicar</button>
        )}
        <button type="button" className="boton" disabled={ocupado} onClick={alDescartar}>Descartar</button>
      </div>
    </section>
  );
}

const NUEVO = '';

/** Da un id estable a los términos nuevos (sin id), a partir de su texto, sin repetir los que ya existen. */
function idsGlosario(terminos: TerminoGlosarioCurso[], idioma: 'es' | 'en'): TerminoGlosarioCurso[] {
  const usados = new Set(terminos.filter((x) => x.id).map((x) => x.id));
  return terminos.map((x) => {
    if (x.id) return x;
    const id = idTermino(x.termino[idioma] ?? '', usados);
    usados.add(id);
    return { ...x, id };
  });
}

/** Quita los idiomas vacíos de un texto antes de guardarlo. */
function limpio(t: { es?: string; en?: string }) {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v)) as { es?: string; en?: string };
}

/** SUP-104 · Términos del glosario del curso: texto y definición en cada idioma del proyecto. */
function EditorGlosario({ terminos, idiomas, editan, cambiar }: { terminos: TerminoGlosarioCurso[]; idiomas: ('es' | 'en')[]; editan: boolean; cambiar: (t: TerminoGlosarioCurso[]) => void }) {
  const NOMBRE = { es: 'español', en: 'inglés' } as const;
  const bilingue = idiomas.length > 1;
  const poner = (i: number, campo: 'termino' | 'definicion', idioma: 'es' | 'en', valor: string) => {
    cambiar(terminos.map((x, k) => (k !== i ? x : { ...x, [campo]: { ...x[campo], [idioma]: valor } })));
  };
  // El id definitivo de un término nuevo se calcula al guardar, con su texto (ver `idsGlosario`).
  const agregar = () => cambiar([...terminos, { id: NUEVO, termino: {}, definicion: {} }]);
  return (
    <fieldset className="editor-glosario" disabled={!editan}>
      <legend>Términos del glosario</legend>
      <p className="sec">El participante los ve en «Glosario», con un buscador. Sin términos, el botón no aparece en el curso.</p>
      {terminos.length ? (
        <ol className="lista-glosario">
          {terminos.map((x, i) => (
            <li key={i} className="termino-glosario">
              {idiomas.map((idioma) => (
                <div key={idioma} className="campos-termino">
                  <div>
                    <label htmlFor={`glosario-${i}-termino-${idioma}`}>Término{bilingue ? ` en ${NOMBRE[idioma]}` : ''}</label>
                    <input id={`glosario-${i}-termino-${idioma}`} type="text" value={x.termino[idioma] ?? ''} maxLength={600} onChange={(e) => poner(i, 'termino', idioma, e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor={`glosario-${i}-definicion-${idioma}`}>Definición{bilingue ? ` en ${NOMBRE[idioma]}` : ''}</label>
                    <textarea id={`glosario-${i}-definicion-${idioma}`} rows={2} value={x.definicion[idioma] ?? ''} maxLength={600} onChange={(e) => poner(i, 'definicion', idioma, e.target.value)} />
                  </div>
                </div>
              ))}
              <button type="button" className="boton" onClick={() => cambiar(terminos.filter((_, k) => k !== i))} aria-label={`Quitar el término ${i + 1}${x.termino[idiomas[0]!] ? ` «${x.termino[idiomas[0]!]}»` : ''}`}>Quitar</button>
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="boton" onClick={agregar}>+ Agregar término</button>
    </fieldset>
  );
}
