// HU-0302 y HU-0303 · Nuevo SCORM: solo cliente y nombre son obligatorios (RN-03-1, CP-030); los datos técnicos y la
// estimación van plegados y son opcionales (RN-03-2, CP-032). El material del cliente se sube en el detalle del proyecto (HU-0304, SUP-21).
import { Cabecera } from '@aptio/ui';
import { estimar, LMS_DESTINO, NOMBRE_PERFIL, perfilPropuesto, SUPUESTOS_ESTIMACION, TONOS } from '@aptio/schema/proyecto';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type Cliente, ErrorApi, type ProyectoEntrada } from '../api';
import { navegar } from '../ruta';

const PANTALLAS = [10, 20, 30, 45, 60];
const numero = (v: string) => (v.trim() === '' ? undefined : Number(v));
/** Miles con punto, como se escriben los montos del proyecto (1.200). */
const miles = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 1 });

export function NuevoScorm() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [clienteId, setClienteId] = useState('');
  const [nombre, setNombre] = useState('');
  const [es, setEs] = useState(true);
  const [en, setEn] = useState(false);
  const [pantallas, setPantallas] = useState<number | null>(null);
  const [publico, setPublico] = useState('');
  const [tono, setTono] = useState('');
  const [actividades, setActividades] = useState(40);
  const [lms, setLms] = useState<string>(LMS_DESTINO[0]);
  const [horas, setHoras] = useState('');
  const [porcentaje, setPorcentaje] = useState('50');
  const [fecha, setFecha] = useState('');
  const [minutos, setMinutos] = useState(String(SUPUESTOS_ESTIMACION.minutosPorPantalla));
  const [porScorm, setPorScorm] = useState(String(SUPUESTOS_ESTIMACION.pantallasPorScorm));
  const [porMes, setPorMes] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.clientes().then(setClientes, (e: unknown) => setErrores([e instanceof ErrorApi ? e.message : 'No se pudieron cargar los clientes']));
  }, []);

  // Al elegir cliente, se proponen sus idiomas.
  function elegirCliente(id: string) {
    setClienteId(id);
    const c = clientes?.find((x) => x.id === id);
    if (c) {
      setEs(c.idiomas.includes('es') || !c.idiomas.length);
      setEn(c.idiomas.includes('en'));
    }
  }

  const datosTecnicos = {
    ...(lms !== LMS_DESTINO[0] ? { lms } : {}),
    ...(lms === 'Solo HTML' ? { formato: 'HTML' as const } : {}),
    ...(numero(horas) !== undefined ? { horasCapacitacion: numero(horas)! } : {}),
    ...(horas.trim() && numero(porcentaje) !== undefined ? { porcentajeScorm: numero(porcentaje)! } : {}),
    ...(fecha ? { fechaEntrega: fecha } : {}),
  };
  const estimacion = estimar({
    horas: numero(horas) ?? 0, porcentajeScorm: numero(porcentaje) ?? 0,
    minutosPorPantalla: numero(minutos) ?? 0, pantallasPorScorm: numero(porScorm) ?? 0, scormPorMes: numero(porMes) ?? null,
  });
  const idiomas = [...(es ? ['es' as const] : []), ...(en ? ['en' as const] : [])];
  const listo = Boolean(clienteId) && nombre.trim().length >= 2 && idiomas.length > 0;

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrores([]);
    const datos: ProyectoEntrada = {
      clienteId, nombre: nombre.trim(), idiomas, porcentajeActividades: actividades,
      ...(pantallas ? { pantallasObjetivo: pantallas } : {}),
      ...(publico.trim() ? { publico: publico.trim() } : {}),
      ...(tono ? { tono } : {}),
      ...(Object.keys(datosTecnicos).length ? { datosTecnicos } : {}),
    };
    try {
      const p = await api.crearProyecto(datos);
      navegar(`/proyectos/${p.id}`);
    } catch (err) {
      setErrores(err instanceof ErrorApi && err.detalles.length
        ? err.detalles.map((d) => String(d.error ?? d.mensaje ?? (Array.isArray(d.restricciones) ? d.restricciones.join(', ') : '')))
        : [err instanceof ErrorApi ? err.message : 'No se pudo crear el proyecto']);
      setEnviando(false);
    }
  }

  return (
    <>
      <Cabecera titulo="Nuevo SCORM" subtitulo="Del material del cliente a un SCORM listo para revisar. Solo el cliente y el nombre son obligatorios." />
      <form className="nuevo-scorm" onSubmit={crear} aria-label="Nuevo SCORM">
        <div className="nuevo-columnas">
          <div className="nuevo-principal">
            <section className="tarjeta kit-bloque" aria-label="Cliente y nombre">
              <h2>1. Cliente y nombre</h2>
              {clientes && !clientes.length ? (
                <div className="nota">
                  Aún no hay clientes. <a href="/clientes" onClick={(e) => { e.preventDefault(); navegar('/clientes'); }}>Crea el primero</a> para elegir su kit.
                </div>
              ) : null}
              <div className="kit-fila">
                <label className="campo">
                  Cliente
                  <select required value={clienteId} onChange={(e) => elegirCliente(e.target.value)}>
                    <option value="" disabled>Elige un cliente</option>
                    {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.tieneKit ? '' : ' (sin kit)'}</option>)}
                  </select>
                </label>
                <label className="campo">
                  Nombre del SCORM
                  <input required minLength={2} maxLength={160} value={nombre} placeholder="Bloqueo y etiquetado" onChange={(e) => setNombre(e.target.value)} />
                </label>
              </div>
              <p className="sec">La IA usará el kit del cliente: colores, tipografías, personaje, voz y pantallas modelo.</p>
            </section>

            <section className="tarjeta kit-bloque" aria-label="Extensión y estilo">
              <h2>2. Extensión y estilo</h2>
              <div className="kit-fila">
                <div className="campo">
                  <span id="etq-pantallas">Pantallas</span>
                  <div className="opciones" role="group" aria-labelledby="etq-pantallas">
                    {PANTALLAS.map((n) => (
                      <button key={n} type="button" className="opcion" aria-pressed={pantallas === n} onClick={() => setPantallas(pantallas === n ? null : n)}>{n}</button>
                    ))}
                  </div>
                  <span className="sec">{pantallas ? `≈ ${Math.round(pantallas * SUPUESTOS_ESTIMACION.minutosPorPantalla)} min para el participante` : 'Si no eliges, la IA lo propone con el material'}</span>
                </div>
                <fieldset className="campo sin-borde">
                  <legend>Idiomas</legend>
                  <span className="kit-fila">
                    <label className="casilla"><input type="checkbox" checked={es} onChange={(e) => setEs(e.target.checked)} /> Español</label>
                    <label className="casilla"><input type="checkbox" checked={en} onChange={(e) => setEn(e.target.checked)} /> Inglés</label>
                  </span>
                  <span className="sec">{idiomas.length > 1 ? 'Ambos en un mismo SCORM, con selector' : idiomas.length ? 'Un idioma' : 'Elige al menos un idioma'}</span>
                </fieldset>
              </div>
              <div className="kit-fila">
                <label className="campo">
                  Público (opcional)
                  <input value={publico} maxLength={200} placeholder="Operarios de mantenimiento" onChange={(e) => setPublico(e.target.value)} />
                </label>
                <label className="campo">
                  Tono (opcional)
                  <select value={tono} onChange={(e) => setTono(e.target.value)}>
                    <option value="">Que lo proponga la IA</option>
                    {TONOS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="campo">
                  Pantallas con actividad: {actividades} %
                  <input type="range" min={20} max={70} step={5} value={actividades} onChange={(e) => setActividades(Number(e.target.value))} />
                </label>
              </div>
            </section>

            <details className="tarjeta datos-tecnicos">
              <summary>Datos técnicos y estimación (opcional)</summary>
              <div className="kit-bloque">
              <p className="sec">Muchos clientes no los definen. Puedes dejarlos vacíos y completarlos en Entrega.</p>
              <div className="kit-fila">
                <label className="campo">
                  LMS destino
                  <select value={lms} onChange={(e) => setLms(e.target.value)}>
                    {LMS_DESTINO.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label className="campo">
                  Fecha de entrega
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
              </div>
              <p className="sec">Perfil de entrega propuesto: <b>{NOMBRE_PERFIL[perfilPropuesto(datosTecnicos)]}</b></p>
              <div className="kit-fila">
                <label className="campo">
                  Horas de capacitación que pide el cliente
                  <input type="number" min={0} value={horas} placeholder="48" onChange={(e) => setHoras(e.target.value)} />
                </label>
                <label className="campo">
                  % del tiempo en SCORM
                  <input type="number" min={0} max={100} value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
                </label>
              </div>
              <fieldset className="sin-borde">
                <legend className="sec">Supuestos de la estimación (editables)</legend>
                <div className="kit-fila">
                  <label className="campo">
                    Minutos por pantalla
                    <input type="number" min={0.1} step={0.1} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
                  </label>
                  <label className="campo">
                    Pantallas por SCORM
                    <input type="number" min={1} value={porScorm} onChange={(e) => setPorScorm(e.target.value)} />
                  </label>
                  <label className="campo">
                    SCORM por mes del equipo
                    <input type="number" min={0} value={porMes} placeholder="Opcional" onChange={(e) => setPorMes(e.target.value)} />
                  </label>
                </div>
              </fieldset>
              <div className="nota" role="status" aria-label="Estimación">
                {estimacion
                  ? `≈ ${miles.format(estimacion.pantallas)} pantallas y ${miles.format(estimacion.scorm)} SCORM${estimacion.meses !== null ? ` · ≈ ${miles.format(estimacion.meses)} meses con el equipo` : ''}`
                  : 'Escribe las horas y el % en SCORM para estimar pantallas y SCORM.'}
              </div>
              </div>
            </details>
          </div>

          <aside className="tarjeta kit-bloque nuevo-resumen" aria-label="Vas a recibir">
            <h2>Vas a recibir</h2>
            <dl className="resumen">
              <div><dt>Pantallas animadas</dt><dd>{pantallas ?? 'Según el material'}</dd></div>
              <div><dt>Actividades interactivas</dt><dd>{pantallas ? Math.round((pantallas * actividades) / 100) : `${actividades} %`}</dd></div>
              <div><dt>Idiomas</dt><dd>{idiomas.map((i) => i.toUpperCase()).join(' + ') || '—'}</dd></div>
              <div><dt>Subtítulos</dt><dd>WebVTT</dd></div>
              <div><dt>Entrega</dt><dd>{lms === 'Solo HTML' ? 'HTML' : 'SCORM 1.2 + HTML'}</dd></div>
            </dl>
            <p className="nota">La IA propone. Diseño instruccional aprueba cada pantalla antes de entregar.</p>
            {errores.length ? (
              <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div>
            ) : null}
            <button className="boton primario" type="submit" disabled={!listo || enviando}>{enviando ? 'Creando…' : 'Crear proyecto'}</button>
          </aside>
        </div>
      </form>
    </>
  );
}
