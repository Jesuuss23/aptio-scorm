// HU-0501 y HU-0502 · Revisión (PNT-20): recorrer las pantallas con filtros, ver su origen y sus observaciones,
// corregir el título o la narración y aprobar una pantalla o todas las que no tienen observaciones.
// RN-05-1: no se aprueba con una observación que bloquea la entrega. RN-05-2: lo que se edita vuelve a borrador.
// HU-0503 · Corregir la narración regenera su voz, boca y subtítulos en español; los chips muestran el avance.
import { Cabecera } from '@aptio/ui';
import { type CursoReproductor, montar } from '@aptio/player';
import { type CursoDoc, origenDe, type PantallaDoc, pantallasDe } from '@aptio/schema/revision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, APRUEBAN_PANTALLAS, type Curso, EDITAN_PANTALLAS, ErrorApi, type Kit, type Narracion, type Observacion, type Proyecto, type Rol, type TextoI18n } from '../api';
import { navegar } from '../ruta';
import './fuentes-kit';

type Filtro = 'todas' | 'revisar' | 'actividades';
const NOMBRE_SEVERIDAD = { info: 'Información', aviso: 'Aviso', 'bloquea-entrega': 'Bloquea la entrega' } as const;
const CLASE_SEVERIDAD = { info: '', aviso: 'aviso', 'bloquea-entrega': 'error' } as const;
const NOMBRE_ESTADO: Record<string, string> = { borrador: 'Borrador', 'propuesta-ia': 'Propuesta de la IA', aprobado: 'Aprobada' };

const ChipEstado = ({ estado }: { estado: string }) => (
  <span className={`chip ${estado === 'aprobado' ? 'validado' : estado === 'propuesta-ia' ? 'ia' : ''}`}>{NOMBRE_ESTADO[estado] ?? estado}</span>
);
/** HU-0503 · Cada 2 s se consulta el avance de la cascada; a los 2 minutos se deja de esperar. */
const CADA_MS = 2000;
const LIMITE_MS = 120_000;
type Fase = 'espera' | 'curso' | 'listo' | 'error';
type Cascada = { pantallaId: string; desde: number; voz: Fase; boca: Fase; subtitulos: Fase; tarda?: boolean };
const NOMBRE_FASE: Record<Fase, string> = { espera: 'En espera', curso: 'Regenerando…', listo: 'Lista', error: 'Error' };
const CLASE_FASE: Record<Fase, string> = { espera: 'aviso', curso: '', listo: 'validado', error: 'error' };

/** Fases de la cascada de una pantalla a partir de su narración en español y de si hay una generación activa. */
function fasesCascada(n: Narracion | undefined, generacionActiva: boolean): Pick<Cascada, 'voz' | 'boca' | 'subtitulos'> {
  if (n?.estado === 'ERROR') return { voz: 'error', boca: 'error', subtitulos: 'error' };
  const enCurso: Fase = generacionActiva ? 'espera' : 'curso';
  const voz: Fase = n?.estado === 'ACTUALIZADA' ? 'listo' : enCurso;
  const boca: Fase = voz === 'listo' && n?.bocas?.length ? 'listo' : enCurso;
  return { voz, boca, subtitulos: boca === 'listo' && n?.subtitulosUrl ? 'listo' : enCurso };
}

const conActividad = (p: PantallaDoc) => p.bloques.some((b) => b.tipo === 'interaccion');
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

export function RevisionVista({ proyectoId, rol, alCargar }: { proyectoId: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [sinCurso, setSinCurso] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cascada, setCascada] = useState<Cascada | null>(null);
  const escenario = useRef<HTMLDivElement>(null);
  const editan = EDITAN_PANTALLAS.includes(rol);
  const aprueban = APRUEBAN_PANTALLAS.includes(rol);

  const recargar = useCallback(async () => {
    const c = await api.curso(proyectoId);
    setCurso(c);
    setObservaciones(await api.observaciones(c.id));
    return c;
  }, [proyectoId]);

  useEffect(() => {
    api.proyecto(proyectoId).then(
      (p) => {
        setProyecto(p);
        alCargar(p.nombre);
        api.kit(p.clienteId).then(setKit, () => setKit(null));
        recargar().catch((e: unknown) => {
          if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
          else setError(mensajeDe(e, 'No se pudo cargar el curso'));
        });
      },
      (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el proyecto')),
    );
  }, [proyectoId, alCargar, recargar]);

  // HU-0503 · Sondeo de la cascada: se detiene al terminar, con error o a los 2 minutos.
  const cursoId = curso?.id;
  const enMarcha = cascada && !cascada.tarda && [cascada.voz, cascada.boca, cascada.subtitulos].some((f) => f === 'espera' || f === 'curso');
  useEffect(() => {
    if (!enMarcha || !cursoId || !cascada) return;
    const { pantallaId, desde } = cascada;
    const t = setTimeout(async () => {
      try {
        const [narraciones, generaciones] = await Promise.all([api.narraciones(cursoId, 'es'), api.generaciones(proyectoId)]);
        const activa = generaciones.some((g) => g.estado === 'EN_COLA' || g.estado === 'EN_CURSO');
        const fases = fasesCascada(narraciones.find((n) => n.pantallaId === pantallaId), activa);
        const tarda = Date.now() - desde > LIMITE_MS;
        setCascada((c) => (c && c.pantallaId === pantallaId ? { ...c, ...fases, tarda } : c));
        if (fases.subtitulos === 'listo') await recargar();
      } catch {
        // Un fallo de red no corta el seguimiento: se reintenta en el siguiente turno.
        setCascada((c) => (c ? { ...c } : c));
      }
    }, CADA_MS);
    return () => clearTimeout(t);
  }, [cascada, enMarcha, cursoId, proyectoId, recargar]);

  const documento = curso ? (curso.documento as unknown as CursoDoc) : null;
  const pantallas = documento ? pantallasDe(documento) : [];
  const actual = pantallas.find((p) => p.id === seleccion) ?? pantallas[0];
  const actualId = actual?.id;

  // Una sola pantalla, sin barra ni botones del reproductor: la misma que verá el participante.
  useEffect(() => {
    if (!curso || !actualId || !escenario.current) return;
    const r = montar(escenario.current, curso.documento as unknown as CursoReproductor, {
      kit: kit ? { paleta: kit.paleta, tipografias: kit.tipografias, personaje: kit.personaje?.nombre ?? null } : {},
      revision: true,
      marco: false,
      inicio: actualId,
    });
    return () => r.destruir();
  }, [curso, kit, actualId]);

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error && !curso) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Revisión" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="nota">Este proyecto aún no tiene pantallas. Genera el SCORM y, cuando la etapa «Pantallas animadas con tu marca» termine, vuelve aquí para revisarlas.</p>
      </>
    );
  }
  if (!curso || !documento || !actual) return <p className="sec" role="status">Cargando revisión…</p>;

  const deLa = (id: string) => observaciones.filter((o) => o.pantallaId === id);
  const conObservaciones = new Set(observaciones.map((o) => o.pantallaId).filter(Boolean));
  const aprobadas = pantallas.filter((p) => p.estado === 'aprobado').length;
  const lista = pantallas.filter((p) => (filtro === 'revisar' ? conObservaciones.has(p.id) : filtro === 'actividades' ? conActividad(p) : true));
  const indice = pantallas.indexOf(actual);
  const obsActual = deLa(actual.id);
  const bloquea = obsActual.some((o) => o.severidad === 'bloquea-entrega');
  const origen = origenDe(actual, (documento as { recursos?: { id: string; tipo: string; nombre: string }[] }).recursos ?? []);

  async function hacer(accion: () => Promise<string>) {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      setAviso(await accion());
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar el cambio'));
      // Si otra persona guardó antes, se trae la última versión para no pisarla.
      if (e instanceof ErrorApi && e.estado === 409) await recargar().catch(() => undefined);
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (cambios: { titulo?: TextoI18n; narracion?: TextoI18n }) => hacer(async () => {
    const estaba = actual.estado;
    const r = await api.editarPantalla(curso.id, actual.id, { version: curso.version, ...cambios });
    if (r.regenerando.length) setCascada({ pantallaId: actual.id, desde: Date.now(), voz: 'curso', boca: 'curso', subtitulos: 'curso' });
    await recargar();
    const texto = estaba === 'aprobado' ? 'Cambios guardados. La pantalla volvió a borrador: apruébala de nuevo cuando esté lista.' : 'Cambios guardados.';
    return r.regenerando.length ? `${texto} Se regeneran su voz, su boca y sus subtítulos en español.` : texto;
  });
  const aprobar = () => hacer(async () => {
    await api.aprobarPantalla(curso.id, actual.id);
    await recargar();
    return `Pantalla ${actual.id} aprobada.`;
  });
  const aprobarLote = () => hacer(async () => {
    const r = await api.aprobarSinObservaciones(curso.id);
    await recargar();
    const n = r.aprobadas?.length ?? 0;
    const pendientes = r.pendientes?.length ?? 0;
    return `${n === 1 ? 'Se aprobó 1 pantalla' : `Se aprobaron ${n} pantallas`}${pendientes ? `; ${pendientes === 1 ? 'queda 1 pendiente' : `quedan ${pendientes} pendientes`} por sus observaciones` : ''}.`;
  });

  return (
    <>
      <Cabecera
        titulo="Revisión"
        subtitulo="Revisa cada pantalla, corrige los textos y aprueba. Lo que cambies vuelve a borrador."
        accion={volver}
      />
      <dl className="revision-cifras" aria-label="Resumen de la revisión">
        <div><dt>Aprobadas</dt><dd className="num ok">{aprobadas} / {pantallas.length}</dd></div>
        <div><dt>Con observaciones</dt><dd className="num aviso">{conObservaciones.size}</dd></div>
      </dl>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <p className="nota" role="status">{aviso}</p> : null}
      <div className="revision">
        <aside className="tarjeta revision-lista" aria-label="Pantallas">
          <div className="opciones" role="group" aria-label="Filtro">
            <button type="button" className="opcion" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</button>
            <button type="button" className="opcion" aria-pressed={filtro === 'revisar'} onClick={() => setFiltro('revisar')}>Revisar ({conObservaciones.size})</button>
            <button type="button" className="opcion" aria-pressed={filtro === 'actividades'} onClick={() => setFiltro('actividades')}>Actividades</button>
          </div>
          <ol className="revision-pantallas">
            {lista.map((p) => (
              <li key={p.id}>
                <button type="button" className="revision-pantalla" aria-current={p.id === actual.id} onClick={() => setSeleccion(p.id)}>
                  <span><span className="num">{String(pantallas.indexOf(p) + 1).padStart(2, '0')}</span> {p.titulo.es ?? p.titulo.en}</span>
                  <span className="fila-chips">
                    <ChipEstado estado={p.estado} />
                    {conObservaciones.has(p.id) ? <span className="chip aviso">{deLa(p.id).length} obs.</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {lista.length === 0 ? <p className="sec">Ninguna pantalla con este filtro.</p> : null}
          {aprueban ? (
            <button type="button" className="boton" disabled={ocupado} onClick={() => void aprobarLote()}>Aprobar todas las que no tienen observaciones</button>
          ) : null}
        </aside>

        <section className="revision-centro" aria-label={`Pantalla ${actual.id}`}>
          <div className="kit-fila">
            <div className="revision-encabezado">
              <span className="num sec">{String(indice + 1).padStart(2, '0')} / {pantallas.length}</span>
              <h2>{actual.titulo.es ?? actual.titulo.en}</h2>
              <ChipEstado estado={actual.estado} />
            </div>
            <div className="acciones-form">
              <button type="button" className="boton" disabled={indice === 0} onClick={() => setSeleccion(pantallas[indice - 1]!.id)}>Anterior</button>
              <button type="button" className="boton" disabled={indice === pantallas.length - 1} onClick={() => setSeleccion(pantallas[indice + 1]!.id)}>Siguiente</button>
            </div>
          </div>
          <div className="revision-escenario">
            <div ref={escenario} className="revision-reproductor" />
          </div>
          {/* La clave rehace los campos al cambiar de pantalla o al llegar una versión nueva del curso. */}
          <TextosPantalla key={`${actual.id}-${curso.version}`} pantalla={actual} editan={editan} ocupado={ocupado} alGuardar={guardar} />
          {cascada && cascada.pantallaId === actual.id ? <ChipsCascada cascada={cascada} /> : null}
        </section>

        <aside className="revision-lateral">
          <section className="tarjeta kit-bloque" aria-label="Control de calidad">
            <h2>Control de calidad</h2>
            {obsActual.length ? (
              <ul className="revision-observaciones">
                {obsActual.map((o) => (
                  <li key={o.id}>
                    <span className={`chip ${CLASE_SEVERIDAD[o.severidad]}`}>{NOMBRE_SEVERIDAD[o.severidad]}</span>
                    <span>{o.mensaje}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="sec">Sin observaciones abiertas.</p>}
          </section>
          <section className="tarjeta kit-bloque" aria-label="Origen">
            <h2>Origen</h2>
            <p>
              <span className={`chip ${origen.tipo === 'ia' ? 'ia' : ''}`}>{origen.etiqueta}</span>{' '}
              <span className="sec">{origen.tipo === 'documento' ? 'tomado del material del cliente' : origen.tipo === 'ia' ? 'a partir del objetivo' : ''}</span>
            </p>
          </section>
          {aprueban ? (
            <div className="acciones-form">
              <button type="button" className="boton primario" disabled={ocupado || actual.estado === 'aprobado' || bloquea} onClick={() => void aprobar()}>
                {actual.estado === 'aprobado' ? 'Aprobada' : 'Aprobar pantalla'}
              </button>
              {bloquea && actual.estado !== 'aprobado' ? <span className="ayuda">Resuelve antes la observación que bloquea la entrega.</span> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

/** Título y narración de la pantalla. RN-05-2: si estaba aprobada, al guardar vuelve a borrador. */
function TextosPantalla({ pantalla, editan, ocupado, alGuardar }: {
  pantalla: PantallaDoc; editan: boolean; ocupado: boolean; alGuardar: (cambios: { titulo?: TextoI18n; narracion?: TextoI18n }) => void;
}) {
  const [titulo, setTitulo] = useState(pantalla.titulo.es ?? '');
  const [narracion, setNarracion] = useState(pantalla.narracion?.texto.es ?? '');
  const cambioTitulo = titulo.trim() !== (pantalla.titulo.es ?? '');
  const cambioNarracion = Boolean(pantalla.narracion) && narracion.trim() !== (pantalla.narracion?.texto.es ?? '');
  return (
    <section className="tarjeta kit-bloque" aria-label="Textos">
      <h2>Textos</h2>
      <label className="campo">
        Título en pantalla
        <input value={titulo} disabled={!editan} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      {pantalla.narracion ? (
        <label className="campo">
          Narración
          <textarea rows={3} value={narracion} disabled={!editan} onChange={(e) => setNarracion(e.target.value)} />
        </label>
      ) : <p className="sec">Esta pantalla no tiene narración.</p>}
      {editan ? (
        <div className="acciones-form">
          <button
            type="button"
            className="boton primario"
            disabled={ocupado || (!cambioTitulo && !cambioNarracion)}
            onClick={() => alGuardar({ ...(cambioTitulo ? { titulo: { es: titulo } } : {}), ...(cambioNarracion ? { narracion: { es: narracion } } : {}) })}
          >
            Guardar cambios
          </button>
          <span className="ayuda">{pantalla.estado === 'aprobado' ? 'Está aprobada: al guardar vuelve a borrador.' : pantalla.narracion ? 'Si cambias la narración, su voz, su boca y sus subtítulos en español se regeneran solos.' : 'El inglés se actualiza cuando llegue esa etapa.'}</span>
        </div>
      ) : null}
    </section>
  );
}

/** HU-0503 · Avance de la regeneración en cascada de la pantalla: voz, boca y subtítulos en español. */
function ChipsCascada({ cascada }: { cascada: Cascada }) {
  const fases: [string, Fase][] = [['Voz ES', cascada.voz], ['Boca', cascada.boca], ['Subtítulos ES', cascada.subtitulos]];
  const error = fases.some(([, f]) => f === 'error');
  const espera = fases.some(([, f]) => f === 'espera');
  return (
    <section className="tarjeta kit-bloque" aria-label="Regeneración">
      <h2>Regeneración</h2>
      <ul className="fila-chips" role="status">
        {fases.map(([nombre, f]) => <li key={nombre} className={`chip ${CLASE_FASE[f]}`}>{nombre}: {NOMBRE_FASE[f]}</li>)}
      </ul>
      {error ? <p className="nota error">No se pudo regenerar la voz de esta pantalla. Corrige el texto y guarda de nuevo, o regenera la voz desde Producción.</p> : null}
      {espera && !error ? <p className="ayuda">Hay una generación en curso: la regeneración empieza cuando termine.</p> : null}
      {cascada.tarda && !error ? <p className="ayuda">La regeneración tarda más de lo normal; revisa su avance más tarde en Producción.</p> : null}
    </section>
  );
}
