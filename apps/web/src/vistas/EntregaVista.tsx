// HU-1202 · Entrega (PNT-13): exportar el SCORM 1.2, seguir su avance y descargarlo, con el historial de exportaciones.
// El perfil del LMS destino solo agrega recomendaciones: el paquete cumple el estándar y es el mismo para todos (RN-12-1).
// Cada exportación queda ligada a la versión del curso (RN-12-4). El avance llega por SSE con consulta cada 2 s de respaldo.
import { Cabecera } from '@aptio/ui';
import { perfilPropuesto } from '@aptio/schema/proyecto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Curso, ErrorApi, EXPORTAN, type Exportacion, type PerfilExportacion, type Proyecto, type Rol } from '../api';
import { navegar } from '../ruta';
import { megas, PERFILES } from './entrega';

const CONSULTA_MS = 2000;
const ACTIVAS = new Set<Exportacion['estado']>(['EN_COLA', 'EN_CURSO']);

const NOMBRE_ESTADO: Record<Exportacion['estado'], string> = {
  EN_COLA: 'En cola', EN_CURSO: 'Armando el paquete…', COMPLETADO: 'Listo', ERROR: 'Error', CANCELADO: 'Cancelado',
};

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

export function EntregaVista({ proyectoId, rol, alCargar }: { proyectoId: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [lista, setLista] = useState<Exportacion[]>([]);
  const [perfil, setPerfil] = useState<PerfilExportacion>('generico');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const puedeExportar = EXPORTAN.includes(rol);
  // El historial es del equipo: el revisor del cliente no lo ve (la API responde 403).
  const veHistorial = rol !== 'REVISOR_CLIENTE';
  const cursoId = curso?.id;

  useEffect(() => {
    api.proyecto(proyectoId).then((p) => {
      setProyecto(p);
      alCargar(p.nombre);
      setPerfil(perfilPropuesto(p.datosTecnicos).toLowerCase() as PerfilExportacion);
      api.curso(proyectoId).then(setCurso, (e: unknown) => {
        if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
        else setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el curso');
      });
    }, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el proyecto'));
  }, [proyectoId, alCargar]);

  const recargar = useCallback(() => {
    if (!cursoId || !veHistorial) return;
    api.exportaciones(cursoId).then(setLista, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el historial'));
  }, [cursoId, veHistorial]);
  useEffect(recargar, [recargar]);

  // En vivo: un evento de una exportación de la lista la vuelve a pedir; la consulta cada 2 s cubre un SSE caído.
  const activa = lista.some((e) => ACTIVAS.has(e.estado));
  const ids = useRef(new Set<string>());
  useEffect(() => {
    ids.current = new Set(lista.map((e) => e.id));
  }, [lista]);
  useEffect(() => {
    if (!activa) return;
    let fuente: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      fuente = new EventSource('/api/v1/eventos');
      fuente.addEventListener('trabajo', (ev) => {
        try {
          const dato = JSON.parse((ev as MessageEvent<string>).data) as { trabajoId?: string };
          if (dato.trabajoId && ids.current.has(dato.trabajoId)) recargar();
        } catch {
          // Un evento que no se entiende no cambia nada: la consulta periódica sigue.
        }
      });
      fuente.onerror = () => fuente?.close();
    }
    const t = setInterval(recargar, CONSULTA_MS);
    return () => {
      clearInterval(t);
      fuente?.close();
    };
  }, [activa, recargar]);

  async function exportar() {
    if (!cursoId) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const nueva = await api.exportar(cursoId, { formato: 'SCORM12', perfilLms: perfil });
      setLista((l) => [nueva, ...l]);
      setAviso(`Exportación pedida: se arma el paquete con la versión ${nueva.versionCurso} del curso.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo exportar');
    } finally {
      setOcupado(false);
    }
  }

  async function descargar(id: string) {
    setError('');
    try {
      const e = await api.exportacion(id);
      if (!e.descargaUrl) throw new Error('sin enlace');
      window.location.assign(e.descargaUrl);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo descargar el paquete');
    }
  }

  const volver = (
    <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>
  );
  if (error && !proyecto) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Entrega" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="nota">Este proyecto aún no tiene pantallas. Genera el SCORM y, cuando termine, vuelve aquí para exportarlo.</p>
      </>
    );
  }
  if (!proyecto || !curso) return <p className="sec" role="status">Cargando entrega…</p>;

  const elegido = PERFILES.find((p) => p.id === perfil)!;
  const { aprobadas, total } = proyecto.avance;
  return (
    <>
      <Cabecera titulo="Entrega" subtitulo={`${proyecto.nombre} · versión ${curso.version} del curso`} accion={volver} />
      <p className="sec">Paquetes para cualquier LMS. El paquete cumple el estándar de forma estricta, para que funcione también en LMS que no conoces.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota" role="status">{aviso}</div> : null}
      <div className="columnas">
        <section className="tarjeta kit-bloque" aria-label="Exportar">
          <h2>Formato</h2>
          <div className="opciones" role="group" aria-label="Formato">
            <button type="button" className="opcion" aria-pressed="true">SCORM 1.2 · un solo SCO</button>
          </div>
          <p className="sec">SCORM 2004, HTML y ES + EN en el mismo paquete llegan en las próximas entregas.</p>
          <h2>LMS destino</h2>
          <div className="opciones" role="group" aria-label="LMS destino">
            {PERFILES.map((p) => (
              <button key={p.id} type="button" className="opcion" aria-pressed={perfil === p.id} onClick={() => setPerfil(p.id)}>{p.nombre}</button>
            ))}
          </div>
          <p className="nota" aria-live="polite" data-perfil={elegido.id}>{elegido.recomendacion}</p>
          {total && aprobadas < total ? (
            <p className="nota aviso">
              {total - aprobadas} de {total} pantallas sin aprobar. Puedes exportar igual; revísalas antes de entregar al cliente.{' '}
              <a href={`/proyectos/${proyectoId}/revision`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}/revision`); }}>Ir a revisión</a>
            </p>
          ) : null}
          {puedeExportar ? (
            <div className="acciones-form">
              <button className="boton primario" type="button" disabled={ocupado} onClick={() => void exportar()}>{ocupado ? 'Exportando…' : 'Exportar SCORM 1.2'}</button>
            </div>
          ) : <p className="sec">Solo administración, diseño instruccional y producción exportan.</p>}
        </section>

        <section className="tarjeta kit-bloque" aria-label="Historial de exportaciones">
          <h2>Historial</h2>
          {!veHistorial ? <p className="sec">El historial y la descarga son del equipo de producción.</p> : lista.length ? (
            <div className="tabla-entrega">
              <table>
                <thead>
                  <tr><th scope="col">Fecha</th><th scope="col">Formato</th><th scope="col">Versión</th><th scope="col">LMS</th><th scope="col">Estado</th><th scope="col">Peso</th><th scope="col"><span className="sr">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {lista.map((e) => (
                    <tr key={e.id} data-exportacion={e.id}>
                      <td>{fecha(e.creadoEn)}</td>
                      <td>SCORM 1.2</td>
                      <td>v{e.versionCurso}</td>
                      <td>{PERFILES.find((p) => p.id === e.perfilLms)?.nombre ?? e.perfilLms}</td>
                      <td>
                        <span role={ACTIVAS.has(e.estado) ? 'status' : undefined}>{NOMBRE_ESTADO[e.estado]}</span>
                        {e.estado === 'ERROR' && e.motivo ? <div className="sec">{e.motivo}</div> : null}
                        {e.estado === 'COMPLETADO' && e.informe?.advertencias.length ? (
                          <details>
                            <summary>{e.informe.advertencias.length} advertencias</summary>
                            <ul>{e.informe.advertencias.map((a) => <li key={a}>{a}</li>)}</ul>
                          </details>
                        ) : null}
                      </td>
                      <td>{megas(e.bytes)}</td>
                      <td>
                        {e.estado === 'COMPLETADO' ? (
                          <button className="boton" type="button" onClick={() => void descargar(e.id)} aria-label={`Descargar ${e.nombreArchivo ?? 'paquete'}`}>Descargar</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="sec">Todavía no hay exportaciones de este curso.</p>}
        </section>
      </div>
    </>
  );
}
