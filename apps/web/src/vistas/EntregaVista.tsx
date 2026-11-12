// HU-1202 · Entrega (PNT-13): exportar el SCORM 1.2, seguir su avance y descargarlo, con el historial de exportaciones.
// El perfil del LMS destino solo agrega recomendaciones: el paquete cumple el estándar y es el mismo para todos (RN-12-1).
// Cada exportación queda ligada a la versión del curso (RN-12-4). El avance llega por SSE con consulta cada 2 s de respaldo.
// HU-1201 · «Verificación automática»: peso estimado contra el límite del destino (advierte con alternativas y nunca
// bloquea, RN-12-2, CP-090), suspend_data, archivos y pantallas sin aprobar. Los errores de esquema deshabilitan Exportar;
// con pantallas sin aprobar se pide confirmación (RN-12-3). Se vuelve a validar al cambiar el LMS destino.
// HU-1203 · Formato HTML autocontenido: sin LMS destino, sin límite de subida ni suspend_data; la confirmación sigue.
import { Cabecera } from '@aptio/ui';
import { perfilPropuesto } from '@aptio/schema/proyecto';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api, type Curso, ErrorApi, EXPORTAN, type Exportacion, type FormatoExportacion, type PerfilExportacion, type Proyecto, type Rol, type Validacion } from '../api';
import { navegar } from '../ruta';
import { FORMATOS, LIMITE_SUSPEND, mb, megas, NOMBRE_FORMATO, PERFILES } from './entrega';

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
  const [formato, setFormato] = useState<FormatoExportacion>('SCORM12');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /** La última validación y para qué formato y LMS fue: si no coincide con lo elegido, se está validando de nuevo. */
  const [validada, setValidada] = useState<{ clave: string; v: Validacion } | null>(null);
  const confirmar = useRef<HTMLDialogElement>(null);
  const puedeExportar = EXPORTAN.includes(rol);
  // El historial es del equipo: el revisor del cliente no lo ve (la API responde 403).
  const veHistorial = rol !== 'REVISOR_CLIENTE';
  const cursoId = curso?.id;
  const html = formato === 'HTML';
  // En HTML el LMS no cambia nada: la validación es la misma para cualquier perfil.
  const clave = html ? 'HTML' : `SCORM12|${perfil}`;
  const validacion = validada?.clave === clave ? validada.v : null;
  const validando = validada?.clave !== clave;

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

  // HU-1201 · Validar el curso para el LMS elegido (la vista del revisor del cliente no valida: no exporta ni ve el historial).
  useEffect(() => {
    if (!cursoId || !veHistorial) return;
    let vigente = true;
    api.validar(cursoId, { formato: html ? 'HTML' : 'SCORM12', perfilLms: html ? 'generico' : perfil }).then(
      (v) => { if (vigente) setValidada({ clave, v }); },
      (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo validar el curso'); },
    );
    return () => { vigente = false; };
  }, [cursoId, perfil, html, clave, veHistorial]);

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

  /** Con pantallas sin aprobar se confirma antes de exportar (RN-12-3); el peso nunca frena (RN-12-2). */
  function pedirExportar() {
    if (validacion?.pantallasSinAprobar && confirmar.current) confirmar.current.showModal();
    else void exportar();
  }

  async function exportar() {
    confirmar.current?.close();
    if (!cursoId) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const nueva = await api.exportar(cursoId, { formato, perfilLms: html ? 'generico' : perfil });
      setLista((l) => [nueva, ...l]);
      setAviso(`Exportación pedida: se arma ${html ? 'la carpeta HTML' : 'el paquete'} con la versión ${nueva.versionCurso} del curso.`);
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
  const v = validacion;
  const total = v?.pantallasTotal ?? proyecto.avance.total;
  const sinAprobar = v ? v.pantallasSinAprobar : Math.max(0, proyecto.avance.total - proyecto.avance.aprobadas);
  const conErrores = Boolean(v?.errores.length);
  const otrasAdvertencias = v?.advertencias.filter((a) => /^Falta/.test(a)) ?? [];
  const irARevision = (
    <a href={`/proyectos/${proyectoId}/revision`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}/revision`); }}>Ir a revisión</a>
  );
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
            {FORMATOS.map((f) => (
              <button key={f.id} type="button" className="opcion" aria-pressed={formato === f.id} onClick={() => setFormato(f.id)}>{f.nombre}</button>
            ))}
          </div>
          <p className="sec">SCORM 2004 y ES + EN en el mismo paquete llegan en las próximas entregas.</p>
          {html ? (
            <p className="nota" aria-live="polite" data-formato="HTML">Una carpeta que abre con doble clic en <span className="num">index.html</span>, sin internet y sin LMS. No guarda el avance ni la nota: para el seguimiento, exporta SCORM 1.2.</p>
          ) : (
            <>
              <h2>LMS destino</h2>
              <div className="opciones" role="group" aria-label="LMS destino">
                {PERFILES.map((p) => (
                  <button key={p.id} type="button" className="opcion" aria-pressed={perfil === p.id} onClick={() => setPerfil(p.id)}>{p.nombre}</button>
                ))}
              </div>
              <p className="nota" aria-live="polite" data-perfil={elegido.id}>{elegido.recomendacion}</p>
            </>
          )}
          {veHistorial ? (
            <section className="verificacion" aria-label="Verificación automática" aria-busy={validando}>
              <h2>Verificación automática</h2>
              {v ? (
                <>
                  <div className="cifras-entrega">
                    <div className={v.superaLimite ? 'aviso' : ''}><span>Peso estimado</span><b className="num">{mb(v.pesoEstimadoMb)} MB</b><small>{v.limiteMb === null ? 'sin límite de subida: no hay LMS' : `de ${v.limiteMb} MB ${v.origenLimite === 'ficha' ? 'según la ficha del cliente' : 'de referencia'}`}</small></div>
                    <div className={sinAprobar ? 'aviso' : ''}><span>Pantallas aprobadas</span><b className="num">{total - sinAprobar} / {total}</b></div>
                  </div>
                  <ul className="comprobaciones">
                    <Comprobacion ok={!conErrores} grave>
                      {conErrores ? (
                        <>El curso no cumple el esquema: corrígelo antes de exportar.<ul>{v.errores.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul></>
                      ) : html ? 'Carpeta HTML autocontenida: abre sin internet y sin LMS · el curso cumple el esquema' : 'Manifiesto SCORM 1.2 de un solo SCO · el curso cumple el esquema (perfil estricto)'}
                    </Comprobacion>
                    {v.limiteMb === null || v.suspendDataCaracteres === null ? null : (
                      <>
                        <Comprobacion ok={!v.superaLimite}>
                          {v.superaLimite ? v.advertencias.find((a) => a.startsWith('El paquete pesaría')) : `El peso cabe en el límite de subida del destino (${v.limiteMb} MB)`}
                        </Comprobacion>
                        <Comprobacion ok={v.suspendDataCaracteres <= LIMITE_SUSPEND}>
                          Avance, nota y reanudación caben en <span className="num">suspend_data</span> ({v.suspendDataCaracteres.toLocaleString('es-PE')} de {LIMITE_SUSPEND.toLocaleString('es-PE')} caracteres)
                        </Comprobacion>
                      </>
                    )}
                    <Comprobacion ok={!otrasAdvertencias.length}>{otrasAdvertencias[0] ?? 'Están todos los archivos del idioma exportado'}</Comprobacion>
                    <Comprobacion ok={!sinAprobar}>
                      {sinAprobar ? <>{sinAprobar} de {total} pantallas sin aprobar. Puedes exportar igual; revísalas antes de entregar al cliente. {irARevision}</> : 'Todas las pantallas están aprobadas'}
                    </Comprobacion>
                  </ul>
                  {v.superaLimite ? (
                    <div className="nota aviso alternativas-peso">
                      <p><b>Alternativas para un paquete pesado</b></p>
                      <ol>{v.alternativas.map((a) => <li key={a}>{a}</li>)}</ol>
                      <table aria-label="Recursos que más pesan">
                        <thead><tr><th scope="col">Recurso</th><th scope="col">Peso</th></tr></thead>
                        <tbody>{v.recursosPesados.map((r) => <tr key={r.id}><td>{r.nombre}</td><td className="num">{megas(r.bytes)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : <p className="sec" role="status">Validando el curso…</p>}
            </section>
          ) : null}
          {puedeExportar ? (
            <div className="acciones-form">
              <button className="boton primario" type="button" disabled={ocupado || conErrores || !v} onClick={pedirExportar}>{ocupado ? 'Exportando…' : html ? 'Exportar HTML' : 'Exportar SCORM 1.2'}</button>
            </div>
          ) : <p className="sec">Solo administración, diseño instruccional y producción exportan.</p>}
          <dialog ref={confirmar} className="confirmar-exportar" aria-labelledby="confirmar-exportar-titulo" aria-describedby="confirmar-exportar-detalle">
            <h2 id="confirmar-exportar-titulo">¿Exportar con pantallas sin aprobar?</h2>
            <p id="confirmar-exportar-detalle">{sinAprobar} de {total} pantallas no están aprobadas. {html ? 'La carpeta HTML' : 'El paquete'} saldrá con su contenido actual; revísalas antes de entregarlo al cliente.</p>
            <div className="acciones-form">
              <button className="boton" type="button" autoFocus onClick={() => confirmar.current?.close()}>Cancelar</button>
              <button className="boton primario" type="button" onClick={() => void exportar()}>Exportar igual</button>
            </div>
          </dialog>
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
                      <td>{NOMBRE_FORMATO[e.formato] ?? e.formato}</td>
                      <td>v{e.versionCurso}</td>
                      <td>{e.formato === 'HTML' ? '—' : (PERFILES.find((p) => p.id === e.perfilLms)?.nombre ?? e.perfilLms)}</td>
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

/** Una línea de la verificación: ✓ si está bien; «!» si es advertencia o, con `grave`, error que impide exportar. */
function Comprobacion({ ok, grave, children }: { ok: boolean; grave?: boolean; children: ReactNode }) {
  return (
    <li className={ok ? 'ok' : grave ? 'error' : 'aviso'}>
      <span className="icono" aria-hidden="true">{ok ? '✓' : '!'}</span>
      <span className="sr">{ok ? 'Correcto: ' : grave ? 'Error: ' : 'Advertencia: '}</span>
      <span>{children}</span>
    </li>
  );
}
