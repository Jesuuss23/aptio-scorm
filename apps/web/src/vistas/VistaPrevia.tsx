// HU-1102 · Vista previa (PNT-12): recorrer la cápsula como el participante, en celular, tableta o escritorio, con el
// mismo reproductor que va dentro del paquete (HU-1101). El panel de seguimiento muestra lo que se reportaría al LMS.
import { Cabecera } from '@aptio/ui';
import { type CursoReproductor, type EstadoReproductor, montar, type Reproductor } from '@aptio/player';
import { useEffect, useRef, useState } from 'react';
import { api, type Curso, ErrorApi, type Kit, type Proyecto } from '../api';
import { navegar } from '../ruta';
import './fuentes-kit';

const DISPOSITIVOS = [
  { id: 'celular', nombre: 'Celular' },
  { id: 'tableta', nombre: 'Tableta' },
  { id: 'escritorio', nombre: 'Escritorio' },
] as const;
type Dispositivo = (typeof DISPOSITIVOS)[number]['id'];

const NOMBRE_PATRON: Record<string, string> = {
  clasico: 'Clásico', historias: 'Historias', vertical: 'Desplazamiento vertical', mapa: 'Mapa de misiones',
  hub: 'Menú de temas', ramificado: 'Ramificado', inmersivo: 'Inmersivo', personalizado: 'Personalizado',
};
const NOMBRE_MODO = { libre: 'libre', condiciones: 'actividades obligatorias', secuencial: 'secuencial' } as const;
const NOMBRE_LECCION = { incomplete: 'Incompleto', completed: 'Completado', passed: 'Aprobado', failed: 'No aprobado' } as const;

export function VistaPrevia({ proyectoId, alCargar }: { proyectoId: string; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [error, setError] = useState('');
  const [sinCurso, setSinCurso] = useState(false);
  const [dispositivo, setDispositivo] = useState<Dispositivo>('escritorio');
  const [revision, setRevision] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [estado, setEstado] = useState<EstadoReproductor | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const reproductor = useRef<Reproductor | null>(null);
  // La pantalla en la que estaba al cambiar de modo o de dispositivo (solo el modo revisión puede empezar en otra).
  const ultima = useRef<string | undefined>(undefined);

  useEffect(() => {
    api.proyecto(proyectoId).then(
      (p) => {
        setProyecto(p);
        alCargar(p.nombre);
        api.kit(p.clienteId).then(setKit, () => setKit(null));
        api.curso(proyectoId).then(setCurso, (e: unknown) => {
          if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
          else setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el curso');
        });
      },
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el proyecto'),
    );
  }, [proyectoId, alCargar]);

  useEffect(() => {
    if (!curso || !contenedor.current) return;
    const r = montar(contenedor.current, curso.documento as unknown as CursoReproductor, {
      kit: kit ? { paleta: kit.paleta, tipografias: kit.tipografias, personaje: kit.personaje?.nombre ?? null } : {},
      revision,
      urlRecurso: (id) => curso.urlsRecursos?.[id],
      cargarSvg: async (id) => curso.svgPersonajes?.[id],
      cargarSubtitulos: async (id) => curso.subtitulos?.[id],
      ...(revision && ultima.current ? { inicio: ultima.current } : {}),
      alCambiar: (e) => {
        ultima.current = e.pantallaId;
        setEstado(e);
      },
    });
    reproductor.current = r;
    return () => {
      r.destruir();
      reproductor.current = null;
    };
  }, [curso, kit, revision, vuelta]);

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Vista previa" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="nota">Este proyecto aún no tiene pantallas. Genera el SCORM y, cuando la etapa «Pantallas animadas con tu marca» termine, vuelve aquí para recorrerlo.</p>
      </>
    );
  }
  if (!curso) return <p className="sec" role="status">Cargando vista previa…</p>;

  const documento = curso.documento as unknown as CursoReproductor;
  const patron = documento.navegacion?.patron ?? 'clasico';
  const modo = documento.navegacion?.modo ?? 'condiciones';
  const pantallas = documento.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

  return (
    <>
      <Cabecera
        titulo="Vista previa"
        subtitulo={`Así se verá en el LMS con el patrón «Clásico» y la regla «${NOMBRE_MODO[modo]}».`}
        accion={volver}
      />
      {patron !== 'clasico' ? (
        <p className="nota">El curso pide el patrón «{NOMBRE_PATRON[patron] ?? patron}». Por ahora la vista previa y el paquete usan el patrón Clásico; los demás patrones llegan con la configuración de Navegación.</p>
      ) : null}
      <div className="kit-fila vista-previa-controles">
        <div className="opciones" role="group" aria-label="Dispositivo">
          {DISPOSITIVOS.map((x) => (
            <button key={x.id} type="button" className="opcion" aria-pressed={dispositivo === x.id} onClick={() => setDispositivo(x.id)}>{x.nombre}</button>
          ))}
        </div>
        <div className="opciones" role="group" aria-label="Modo">
          <button type="button" className="opcion" aria-pressed={!revision} onClick={() => setRevision(false)}>Participante</button>
          <button type="button" className="opcion" aria-pressed={revision} onClick={() => setRevision(true)}>Revisión</button>
        </div>
        {revision ? (
          <label className="campo vista-previa-ir">
            Ir a la pantalla
            <select value={estado?.pantallaId ?? ''} onChange={(e) => reproductor.current?.ir(e.target.value)}>
              {pantallas.map((p, i) => <option key={p.id} value={p.id}>{String(i + 1).padStart(2, '0')} · {p.id} · {p.titulo.es ?? p.titulo.en}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="boton" onClick={() => { ultima.current = undefined; setVuelta((v) => v + 1); }}>Reiniciar</button>
      </div>
      <div className="vista-previa">
        <div className={`vista-previa-marco ${dispositivo}`}>
          <div ref={contenedor} className="vista-previa-reproductor" data-dispositivo={dispositivo} />
        </div>
        <aside className="tarjeta vista-previa-seguimiento" aria-label="Seguimiento simulado">
          <h2>Seguimiento simulado</h2>
          <p className="sec">Lo que el paquete reportaría al LMS con este recorrido. No se guarda.</p>
          {estado ? (
            <dl className="resumen">
              <div><dt>Pantalla</dt><dd className="num">{estado.indice + 1} de {estado.total}{revision ? ` · ${estado.pantallaId}` : ''}</dd></div>
              <div><dt>Avance</dt><dd className="num">{estado.progreso} %</dd></div>
              <div><dt>Nota</dt><dd className="num">{estado.nota === null ? 'Sin nota aún' : `${estado.nota} de 100 (mínima ${documento.seguimiento.notaMinima})`}</dd></div>
              <div><dt>Puntos</dt><dd className="num">{estado.puntos}</dd></div>
              <div><dt>Estado en el LMS</dt><dd><span className="chip">{NOMBRE_LECCION[estado.leccion]}</span> <code>{estado.leccion}</code></dd></div>
              <div><dt>Actividades hechas</dt><dd className="num">{Object.values(estado.resultados).filter((r) => r.completada).length}</dd></div>
            </dl>
          ) : null}
        </aside>
      </div>
    </>
  );
}
