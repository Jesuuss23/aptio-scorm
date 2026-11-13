// HU-0302 · Detalle del proyecto: resumen, datos técnicos que se completan después y perfil de entrega propuesto (CP-031).
// HU-0304 · Material del cliente con el texto por página. HU-0401 · Generación del SCORM con sus 11 etapas.
import { Cabecera } from '@aptio/ui';
import { FORMATOS, LMS_DESTINO, NOMBRE_ESTADO, NOMBRE_PERFIL, perfilPropuesto } from '@aptio/schema/proyecto';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, CREAN_PROYECTOS, ErrorApi, type Material, type Proyecto, REGENERAN_VOZ, type Rol } from '../api';
import { navegar } from '../ruta';
import { usd } from '../formato';
import { GeneracionScorm } from './GeneracionScorm';
import { MaterialCliente } from './MaterialCliente';

const NOMBRE_FORMATO: Record<(typeof FORMATOS)[number], string> = {
  SCORM12: 'SCORM 1.2', SCORM2004: 'SCORM 2004', HTML: 'HTML autocontenido', NO_DEFINIDO: 'Aún no se sabe',
};

export function ProyectoDetalle({ id, rol, alCargar }: { id: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [lms, setLms] = useState('');
  const [materiales, setMateriales] = useState<Material[]>([]);
  const puedeEditar = CREAN_PROYECTOS.includes(rol);
  // Tras lanzar, cancelar o terminar una generación cambian el estado y el costo del proyecto.
  const recargar = useCallback(() => {
    api.proyecto(id).then(setProyecto, () => undefined);
  }, [id]);

  useEffect(() => {
    api.proyecto(id).then(
      (p) => {
        setProyecto(p);
        setLms(p.datosTecnicos.lms ?? '');
        alCargar(p.nombre);
      },
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el proyecto'),
    );
  }, [id, alCargar]);

  async function guardarDatos(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!proyecto) return;
    const f = new FormData(e.currentTarget);
    const texto = (k: string) => String(f.get(k) ?? '').trim();
    const num = (k: string) => (texto(k) === '' ? undefined : Number(texto(k)));
    const datosTecnicos = {
      ...(texto('lms') && texto('lms') !== LMS_DESTINO[0] ? { lms: texto('lms') } : {}),
      ...(texto('formato') ? { formato: texto('formato') as (typeof FORMATOS)[number] } : {}),
      ...(num('horas') !== undefined ? { horasCapacitacion: num('horas')! } : {}),
      ...(num('porcentaje') !== undefined ? { porcentajeScorm: num('porcentaje')! } : {}),
      ...(texto('fecha') ? { fechaEntrega: texto('fecha') } : {}),
    };
    setError('');
    setAviso('');
    try {
      setProyecto(await api.editarProyecto(proyecto.id, { datosTecnicos }));
      setAviso('Datos técnicos guardados');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudieron guardar los datos técnicos');
    }
  }

  async function archivar() {
    if (!proyecto) return;
    try {
      await api.archivarProyecto(proyecto.id);
      navegar('/');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo archivar el proyecto');
    }
  }

  if (!proyecto) {
    return error ? <div className="nota error" role="alert">{error}</div> : <p className="sec" role="status">Cargando proyecto…</p>;
  }
  const d = proyecto.datosTecnicos;
  const perfil = perfilPropuesto({ ...d, lms });
  return (
    <>
      <Cabecera
        titulo={proyecto.nombre}
        subtitulo={`${proyecto.clienteNombre} · ${NOMBRE_ESTADO[proyecto.estado]}`}
        accion={
          <div className="acciones-form">
            {proyecto.avance.total ? (
              <>
                <a className="boton primario" href={`/proyectos/${proyecto.id}/revision`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/revision`); }}>Revisión</a>
                <a className="boton" href={`/proyectos/${proyecto.id}/vista-previa`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/vista-previa`); }}>Vista previa</a>
                <a className="boton" href={`/proyectos/${proyecto.id}/idiomas`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/idiomas`); }}>Idiomas</a>
                {rol !== 'REVISOR_CLIENTE' ? <a className="boton" href={`/proyectos/${proyecto.id}/alineacion`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/alineacion`); }}>Alineación</a> : null}
                {rol !== 'REVISOR_CLIENTE' ? <a className="boton" href={`/proyectos/${proyecto.id}/navegacion`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/navegacion`); }}>Navegación</a> : null}
                {rol !== 'REVISOR_CLIENTE' ? <a className="boton" href={`/proyectos/${proyecto.id}/voz`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/voz`); }}>Personaje y voz</a> : null}
                {rol !== 'REVISOR_CLIENTE' ? <a className="boton" href={`/proyectos/${proyecto.id}/video`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/video`); }}>Video interactivo</a> : null}
                {rol !== 'REVISOR_CLIENTE' ? <a className="boton" href={`/proyectos/${proyecto.id}/entrega`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyecto.id}/entrega`); }}>Exportar SCORM</a> : null}
              </>
            ) : null}
            {puedeEditar && proyecto.estado !== 'ARCHIVADO' ? <button className="boton" type="button" onClick={() => void archivar()}>Archivar</button> : null}
          </div>
        }
      />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <div className="columnas">
        <section className="tarjeta kit-bloque" aria-label="Resumen del proyecto">
          <h2>Resumen</h2>
          <dl className="resumen">
            <div>
              <dt>Cliente</dt>
              <dd><a href={`/clientes/${proyecto.clienteId}`} onClick={(e) => { e.preventDefault(); navegar(`/clientes/${proyecto.clienteId}`); }}>{proyecto.clienteNombre}</a></dd>
            </div>
            <div><dt>Idiomas</dt><dd>{proyecto.idiomas.map((i) => i.toUpperCase()).join(' + ')}</dd></div>
            <div><dt>Pantallas</dt><dd>{proyecto.pantallasObjetivo ?? 'Las propone la IA'}</dd></div>
            <div><dt>Público</dt><dd>{proyecto.publico ?? 'Por definir'}</dd></div>
            <div><dt>Tono</dt><dd>{proyecto.tono ?? 'Lo propone la IA'}</dd></div>
            <div><dt>Pantallas con actividad</dt><dd>{proyecto.porcentajeActividades !== null ? `${proyecto.porcentajeActividades} %` : '—'}</dd></div>
            <div><dt>Avance</dt><dd>{proyecto.avance.total ? `${proyecto.avance.aprobadas} de ${proyecto.avance.total} pantallas aprobadas` : 'Sin generar'}</dd></div>
            <div><dt>Costo de IA</dt><dd>{usd(proyecto.costoIaUsd)}</dd></div>
          </dl>
        </section>

        <form className="tarjeta kit-bloque" onSubmit={guardarDatos} aria-label="Datos técnicos">
          <h2>Datos técnicos (opcional)</h2>
          <p className="sec">Nada aquí bloquea la generación. Sin LMS se entrega con el perfil Genérico, que cumple el estándar en cualquier LMS.</p>
          <fieldset className="sin-borde" disabled={!puedeEditar}>
            <div className="kit-fila">
              <label className="campo">
                LMS destino
                <select name="lms" value={lms || LMS_DESTINO[0]} onChange={(e) => setLms(e.target.value === LMS_DESTINO[0] ? '' : e.target.value)}>
                  {[...LMS_DESTINO, ...(d.lms && !LMS_DESTINO.includes(d.lms as (typeof LMS_DESTINO)[number]) ? [d.lms] : [])].map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
              <label className="campo">
                Formato
                <select name="formato" defaultValue={d.formato ?? ''}>
                  <option value="">Aún no se sabe</option>
                  {FORMATOS.filter((x) => x !== 'NO_DEFINIDO').map((x) => <option key={x} value={x}>{NOMBRE_FORMATO[x]}</option>)}
                </select>
              </label>
            </div>
            <div className="kit-fila">
              <label className="campo">Horas de capacitación<input name="horas" type="number" min={0} defaultValue={d.horasCapacitacion ?? ''} /></label>
              <label className="campo">% en SCORM<input name="porcentaje" type="number" min={0} max={100} defaultValue={d.porcentajeScorm ?? ''} /></label>
              <label className="campo">Fecha de entrega<input name="fecha" type="date" defaultValue={d.fechaEntrega ?? ''} /></label>
            </div>
          </fieldset>
          <div className="nota" role="status" aria-label="Perfil de entrega">Entrega · perfil propuesto: <b>{NOMBRE_PERFIL[perfil]}</b></div>
          {aviso ? <div className="nota" role="status">{aviso}</div> : null}
          {puedeEditar ? <div className="acciones-form"><button className="boton primario" type="submit">Guardar datos técnicos</button></div> : null}
        </form>
      </div>
      <GeneracionScorm
        proyectoId={proyecto.id}
        puedeGenerar={puedeEditar && proyecto.estado !== 'ARCHIVADO'}
        puedeRegenerar={REGENERAN_VOZ.includes(rol) && proyecto.estado !== 'ARCHIVADO'}
        materialListo={materiales.some((m) => m.estado === 'listo') && !materiales.some((m) => m.estado === 'pendiente' || m.estado === 'procesando')}
        alCambiar={recargar}
      />
      <MaterialCliente proyectoId={proyecto.id} puedeEditar={puedeEditar && proyecto.estado !== 'ARCHIVADO'} alCambiar={setMateriales} />
    </>
  );
}
