// HU-1001 · Alineación pedagógica (PNT-18, M10, CP-083): una fila por objetivo con su nivel de Bloom y las pantallas o
// preguntas que lo presentan (P), practican (A) y evalúan (E), cada una con su nivel. Las alertas salen sin IA
// (RN-10-2, RN-10-3) y no bloquean la entrega. Administración y diseño instruccional cambian el nivel de un objetivo o de
// un elemento (crea una versión del curso); diseño gráfico y producción solo ven. «✦ Proponer correcciones» es la HU-1002.
import { type ElementoAlineacion, NIVELES_BLOOM, NOMBRE_BLOOM, NOMBRE_ROL, type NivelBloom, type RolAlineacion } from '@aptio/schema/alineacion';
import { Cabecera } from '@aptio/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, EDITAN_ALINEACION, ErrorApi, type InformeAlineacion, type Proyecto, type Rol } from '../api';
import { navegar } from '../ruta';

const ROLES: RolAlineacion[] = ['P', 'A', 'E'];
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);
const claveDe = (objetivoId: string, x: ElementoAlineacion) => `${objetivoId}|${x.pantallaId}|${x.preguntaId ?? ''}`;
const nombreElemento = (x: ElementoAlineacion) => `Pantalla ${x.numero}${x.preguntaId ? `, pregunta ${x.preguntaId}` : ''}`;

export function AlineacionVista({ proyectoId, rol, alCargar }: { proyectoId: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cursoId, setCursoId] = useState<string | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [informe, setInforme] = useState<InformeAlineacion | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const editan = EDITAN_ALINEACION.includes(rol);

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

  const recargar = useCallback(() => {
    if (!cursoId) return;
    api.alineacion(cursoId).then(setInforme, (e: unknown) => setError(mensajeDe(e, 'No se pudo calcular la alineación')));
  }, [cursoId]);
  useEffect(recargar, [recargar]);

  async function cambiar(datos: { objetivos?: { id: string; nivelBloom: NivelBloom }[]; elementos?: { pantallaId: string; preguntaId?: string; nivelBloom: NivelBloom }[] }, que: string) {
    if (!cursoId || !informe) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const nuevo = await api.cambiarAlineacion(cursoId, { version: informe.version, ...datos });
      setInforme(nuevo);
      setAviso(`Nivel de ${que} guardado · ${nuevo.totalAlertas === 1 ? '1 alerta' : `${nuevo.totalAlertas} alertas`}`);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar el nivel'));
      if (e instanceof ErrorApi && e.estado === 409) recargar();
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
        <Cabecera titulo="Alineación pedagógica" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="sec">El curso todavía no tiene pantallas. Genera el SCORM y vuelve aquí para revisar la alineación.</p>
      </>
    );
  }
  if (!proyecto || !informe) return <p className="sec" role="status">Cargando alineación…</p>;

  const { indicadores: ind } = informe;
  const chip = (objetivoId: string, x: ElementoAlineacion) => {
    const clave = claveDe(objetivoId, x);
    const abiertoAqui = abierto === clave;
    const revision = `/proyectos/${proyectoId}/revision?pantalla=${x.pantallaId}`;
    return (
      <li key={clave} className="alineacion-elemento">
        <button
          type="button"
          className={`chip-alineacion rol-${x.rol}`}
          aria-expanded={abiertoAqui}
          aria-label={`${String(x.numero).padStart(2, '0')} · ${x.nivelBloom}: ${nombreElemento(x)}, ${x.titulo}. ${NOMBRE_ROL[x.rol]}${x.nivelEscrito ? '' : ', nivel según su diseño'}`}
          onClick={() => setAbierto(abiertoAqui ? null : clave)}
        >
          <span className="num">{String(x.numero).padStart(2, '0')}</span> · {x.nivelBloom}
        </button>
        {abiertoAqui ? (
          <div className="alineacion-detalle">
            <p><b>{nombreElemento(x)}</b> · {x.titulo}</p>
            {editan ? (
              <label>
                Nivel de Bloom
                <select
                  aria-label={`Nivel de Bloom de ${nombreElemento(x).toLowerCase()}`}
                  value={x.nivelBloom}
                  disabled={ocupado}
                  onChange={(e) => void cambiar({ elementos: [{ pantallaId: x.pantallaId, ...(x.preguntaId ? { preguntaId: x.preguntaId } : {}), nivelBloom: e.target.value as NivelBloom }] }, nombreElemento(x).toLowerCase())}
                >
                  {NIVELES_BLOOM.map((n) => <option key={n} value={n}>{NOMBRE_BLOOM[n]}</option>)}
                </select>
              </label>
            ) : <p className="sec">Nivel {x.nivelBloom}{x.nivelEscrito ? '' : ', según su diseño'}.</p>}
            {x.nivelEscrito ? null : <p className="sec">El nivel sale del diseño de la pantalla mientras nadie lo cambie.</p>}
            <a href={revision} onClick={(e) => { e.preventDefault(); navegar(revision); }}>Abrir en Revisión</a>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <Cabecera titulo="Alineación pedagógica" subtitulo={`${proyecto.nombre} · versión ${informe.version} del curso`} accion={volver} />
      <p className="sec">Cada objetivo necesita al menos una pantalla que lo presente, una práctica y una evaluación, al nivel de Bloom del objetivo. Se calcula con cada cambio del curso, sin IA.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <div role="status" className={aviso ? 'nota' : 'sr'}>{aviso}</div>
      <div className="cifras-entrega alineacion-cifras">
        <div><span>Objetivos</span><b className="num">{informe.objetivos.length}</b></div>
        <div className={informe.totalAlertas ? 'aviso' : ''}><span>Alertas</span><b className="num">{informe.totalAlertas}</b></div>
        <div><span>Objetivos alineados</span><b className="num">{ind.objetivosAlineados} / {informe.objetivos.length}</b></div>
        <div className={ind.elementosSinObjetivo ? 'aviso' : ''}><span>Elementos sin objetivo</span><b className="num">{ind.elementosSinObjetivo}</b></div>
        <div><span>Presenta · Practica · Evalúa</span><b className="num">{ind.equilibrio.presenta} · {ind.equilibrio.practica} · {ind.equilibrio.evalua}</b></div>
      </div>
      <section className="tarjeta alineacion" aria-label="Matriz de alineación">
        <div className="tabla-desplazable">
          <table>
            <thead>
              <tr>
                <th scope="col">Objetivo y nivel</th>
                {ROLES.map((r) => <th key={r} scope="col"><span className={`chip-alineacion rol-${r}`} aria-hidden="true">{r}</span> {NOMBRE_ROL[r]}</th>)}
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {informe.objetivos.map((o) => {
                const columnas: Record<RolAlineacion, ElementoAlineacion[]> = { P: o.presenta, A: o.practica, E: o.evalua };
                return (
                  <tr key={o.id} data-objetivo={o.id}>
                    <th scope="row">
                      <span className="num">{o.id}</span> {o.texto}
                      {editan ? (
                        <select aria-label={`Nivel de Bloom de ${o.id}`} value={o.nivelBloom} disabled={ocupado} onChange={(e) => void cambiar({ objetivos: [{ id: o.id, nivelBloom: e.target.value as NivelBloom }] }, o.id)}>
                          {NIVELES_BLOOM.map((n) => <option key={n} value={n}>{NOMBRE_BLOOM[n]}</option>)}
                        </select>
                      ) : <span className="chip">{NOMBRE_BLOOM[o.nivelBloom]}</span>}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r}>
                        {columnas[r].length ? <ul className="alineacion-chips" aria-label={`${NOMBRE_ROL[r]} ${o.id}`}>{columnas[r].map((x) => chip(o.id, x))}</ul> : <span className="sec">—</span>}
                      </td>
                    ))}
                    <td>
                      {o.alertas.length ? (
                        <ul className="alineacion-alertas" aria-label={`Alertas de ${o.id}`}>{o.alertas.map((a) => <li key={a} className="nota aviso">{a}</li>)}</ul>
                      ) : <span className="chip validado">✓ Alineado</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {informe.totalAlertas ? null : <div className="nota">Todos los objetivos se presentan, se practican y se evalúan a su nivel.</div>}
      <p className="sec">P = presenta (contenido y video) · A = practica (actividad formativa) · E = evalúa (actividad sumativa; en el reto final cuenta cada pregunta). Pulsa una pantalla para ver su nivel o abrirla en Revisión.</p>
    </>
  );
}
