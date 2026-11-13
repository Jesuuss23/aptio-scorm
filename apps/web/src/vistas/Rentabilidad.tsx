// HU-1302 y HU-1303 · Empresa › Rentabilidad (PNT-22): la calculadora del prototipo (RN-13-1, hoy frente a con el
// generador, con supuestos o con las horas medidas), el registro de mediciones y la sección «Costo de IA» con lo que
// registra cada llamada a un proveedor (CP-096). El cálculo es `@aptio/schema/rentabilidad`, el mismo de la API.
import { Cabecera } from '@aptio/ui';
import {
  calcularRentabilidad, CLAVES_ETAPA, ESCENARIOS, ETAPAS_NEGOCIO, type FuenteRentabilidad, NOMBRE_ETAPA, type EtapaNegocio, type ParametrosNegocio,
} from '@aptio/schema/rentabilidad';
import { type FormEvent, useEffect, useState } from 'react';
import {
  api, type Cliente, EDITAN_PARAMETROS, ErrorApi, type MedicionHoras, type ParametrosGuardados, type Proyecto, type ResumenCostos, type Rol,
} from '../api';
import { decimal, NOMBRE_TAREA, porcentaje, soles, usd } from '../formato';
import { navegar } from '../ruta';
import { type Periodo, PERIODOS, rangoPeriodo } from './costos-periodo';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);

export function Rentabilidad({ rol }: { rol: Rol }) {
  const [guardados, setGuardados] = useState<ParametrosGuardados | null>(null);
  const [mediciones, setMediciones] = useState<MedicionHoras[] | null>(null);
  const [error, setError] = useState('');
  const [errorMediciones, setErrorMediciones] = useState('');

  useEffect(() => {
    api.parametrosNegocio().then(setGuardados, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los datos del negocio')));
    api.mediciones().then(setMediciones, (e: unknown) => setErrorMediciones(mensajeDe(e, 'No se pudieron cargar las mediciones')));
  }, []);

  return (
    <>
      <Cabecera titulo="Rentabilidad" subtitulo="Compara tu proceso actual con el generador y mira cuánto cuesta en IA cada SCORM." />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {guardados ? (
        <>
          <Calculadora inicial={guardados} editable={EDITAN_PARAMETROS.includes(rol)} alGuardar={setGuardados} mediciones={mediciones ?? []} />
          <Mediciones lista={mediciones} error={errorMediciones} alCambiar={setMediciones} />
        </>
      ) : !error ? <p className="sec" role="status">Cargando los datos del negocio…</p> : null}
      <CostoIA tipoCambio={guardados?.tipoCambio} />
    </>
  );
}

// ---------- Calculadora (HU-1303) ----------

type Campo = Exclude<keyof ParametrosNegocio, 'etapas'>;
const CAMPOS: { campo: Campo; nombre: string; paso: number }[] = [
  { campo: 'precioHoy', nombre: 'Tu precio hoy (S/)', paso: 100 },
  { campo: 'precioCompetencia', nombre: 'Precio competencia (S/)', paso: 100 },
  { campo: 'precioNuevo', nombre: 'Tu nuevo precio (S/)', paso: 100 },
  { campo: 'personas', nombre: 'Personas del equipo', paso: 1 },
  { campo: 'horasProductivasDia', nombre: 'Horas productivas al día', paso: 0.5 },
  { campo: 'tarifaHora', nombre: 'Costo hora del equipo (S/)', paso: 1 },
  { campo: 'diasEsperaHoy', nombre: 'Días de espera del cliente, hoy', paso: 1 },
  { campo: 'diasEsperaGenerador', nombre: 'Días de espera, con generador', paso: 1 },
  { campo: 'licenciasMesHoy', nombre: 'Licencias y suscripciones al mes hoy (S/)', paso: 50 },
  { campo: 'licenciasMesGenerador', nombre: 'Licencias, API y servidor al mes (S/)', paso: 50 },
  { campo: 'iaPorScormUsd', nombre: 'IA por API por SCORM (US$)', paso: 0.5 },
  { campo: 'tipoCambio', nombre: 'Tipo de cambio', paso: 0.01 },
];

type Formulario = { campos: Record<Campo, string>; etapas: { etapa: string; hoy: string; generador: string }[] };
const aFormulario = (p: ParametrosNegocio): Formulario => ({
  campos: Object.fromEntries(CAMPOS.map(({ campo }) => [campo, String(p[campo])])) as Record<Campo, string>,
  etapas: p.etapas.map((e) => ({ etapa: e.etapa, hoy: String(e.horasHoy), generador: String(e.horasGenerador) })),
});
const leerNumero = (t: string) => (t.trim() === '' ? NaN : Number(t));
const aParametros = (f: Formulario): ParametrosNegocio => ({
  ...(Object.fromEntries(CAMPOS.map(({ campo }) => [campo, leerNumero(f.campos[campo])])) as Record<Campo, number>),
  etapas: f.etapas.map((e) => ({ etapa: e.etapa, horasHoy: leerNumero(e.hoy), horasGenerador: leerNumero(e.generador) })),
});

/** Lo que la API rechazaría (422), dicho antes de guardar. */
function erroresFormulario(p: ParametrosNegocio): string[] {
  const e: string[] = [];
  for (const { campo, nombre } of CAMPOS) if (!Number.isFinite(p[campo]) || p[campo] < 0) e.push(`${nombre}: escribe un número de 0 o más`);
  if (Number.isFinite(p.personas) && (p.personas < 1 || !Number.isInteger(p.personas))) e.push('Personas del equipo: un número entero desde 1');
  if (Number.isFinite(p.horasProductivasDia) && (p.horasProductivasDia < 0.5 || p.horasProductivasDia > 24)) e.push('Horas productivas al día: entre 0,5 y 24');
  if (Number.isFinite(p.tipoCambio) && p.tipoCambio <= 0) e.push('Tipo de cambio: mayor que 0');
  for (const h of p.etapas) if (![h.horasHoy, h.horasGenerador].every((n) => Number.isFinite(n) && n >= 0)) e.push(`${NOMBRE_ETAPA[h.etapa as EtapaNegocio]}: horas de 0 o más`);
  return e;
}

function Calculadora({ inicial, editable, alGuardar, mediciones }: { inicial: ParametrosGuardados; editable: boolean; alGuardar: (p: ParametrosGuardados) => void; mediciones: MedicionHoras[] }) {
  const [form, setForm] = useState(() => aFormulario(inicial));
  const [base, setBase] = useState(() => JSON.stringify(aParametros(aFormulario(inicial))));
  const [ejemplo, setEjemplo] = useState(inicial.ejemplo);
  const [fuente, setFuente] = useState<FuenteRentabilidad>('supuestos');
  const [iaReal, setIaReal] = useState<number | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.costos().then((c) => setIaReal(c.promedioPorScormUsd > 0 ? c.promedioPorScormUsd : null), () => undefined);
  }, []);

  const p = aParametros(form);
  // Lo que aún no es un número cuenta 0 en el cálculo en vivo; «Guardar» lo explica antes de enviar.
  const finito = (n: number) => (Number.isFinite(n) ? n : 0);
  const seguro: ParametrosNegocio = {
    ...p, ...(Object.fromEntries(CAMPOS.map(({ campo }) => [campo, finito(p[campo])])) as Record<Campo, number>),
    etapas: p.etapas.map((e) => ({ ...e, horasHoy: finito(e.horasHoy), horasGenerador: finito(e.horasGenerador) })),
  };
  const r = calcularRentabilidad(seguro, fuente, mediciones);
  const sinGuardar = editable && JSON.stringify(p) !== base;
  const competencia = seguro.precioCompetencia;

  const cambiar = (campo: Campo, valor: string) => { setEstado(null); setForm((f) => ({ ...f, campos: { ...f.campos, [campo]: valor } })); };
  const cambiarHoras = (i: number, esc: 'hoy' | 'generador', valor: string) => {
    setEstado(null);
    setForm((f) => ({ ...f, etapas: f.etapas.map((e, j) => (j === i ? { ...e, [esc]: valor } : e)) }));
  };

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    const errores = erroresFormulario(p);
    if (errores.length) return setEstado({ tipo: 'error', texto: `Revisa los datos. ${errores.join('. ')}.` });
    setGuardando(true);
    try {
      const g = await api.guardarParametrosNegocio(p);
      setBase(JSON.stringify(aParametros(aFormulario(g))));
      setEjemplo(false);
      alGuardar(g);
      setEstado({ tipo: 'ok', texto: 'Datos guardados' });
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron guardar los datos') });
    }
    setGuardando(false);
  }

  const aviso = fuente === 'mediciones'
    ? ESCENARIOS.every((e) => r.respaldo[e] === 'supuestos')
      ? 'Aún no hay mediciones registradas: se usan los supuestos en los dos escenarios.'
      : r.respaldo.hoy === 'supuestos'
        ? '«Hoy» aún no tiene mediciones: usa los supuestos.'
        : r.respaldo.generador === 'supuestos' ? '«Con el generador» aún no tiene mediciones: usa los supuestos.' : ''
    : '';
  const medidos = ESCENARIOS.filter((e) => r.respaldo[e] === 'mediciones')
    .map((e) => `${e === 'hoy' ? 'hoy' : 'con el generador'}, promedio de ${r.proyectosMedidos[e]} proyecto${r.proyectosMedidos[e] === 1 ? '' : 's'}`);
  const maximo = Math.max(r.costoHoy, r.costoGenerador, seguro.precioHoy, competencia, seguro.precioNuevo, 1) * 1.05;
  const barras = [
    { nombre: 'Costo hoy', valor: r.costoHoy, clase: 'costo-hoy' },
    { nombre: 'Costo con generador', valor: r.costoGenerador, clase: 'costo-generador' },
    { nombre: 'Tu precio hoy', valor: seguro.precioHoy, clase: 'precio-hoy' },
    { nombre: 'Precio competencia', valor: competencia, clase: 'precio-competencia' },
    { nombre: 'Tu nuevo precio', valor: seguro.precioNuevo, clase: 'precio-nuevo' },
  ];
  const editableEsc = (esc: 'hoy' | 'generador') => editable && r.respaldo[esc] === 'supuestos';

  return (
    <section className="tarjeta rent" role="region" aria-labelledby="rent-titulo">
      <div className="rent-cabecera">
        <div>
          <h2 id="rent-titulo">¿Puedes competir a {soles(competencia)} por SCORM?</h2>
          <p className="sec">Costo = horas × tarifa del equipo + IA por API + licencias del mes repartidas entre los SCORM que produces.</p>
        </div>
        <div className="opciones" role="group" aria-label="Horas por etapa">
          <button type="button" className="opcion" aria-pressed={fuente === 'supuestos'} onClick={() => setFuente('supuestos')}>Supuestos</button>
          <button type="button" className="opcion" aria-pressed={fuente === 'mediciones'} onClick={() => setFuente('mediciones')}>Mediciones</button>
        </div>
      </div>
      {aviso ? <div className="nota aviso" role="status">{aviso}</div> : null}
      {medidos.length ? <p className="sec">Horas medidas: {medidos.join('; ')}.</p> : null}
      <dl className="rent-cifras" aria-label="Hoy frente a con el generador">
        <Cifra nombre="Días por SCORM" hoy={decimal(r.diasHoy)} generador={decimal(r.diasGenerador)} nota="incluye espera del cliente" />
        <Cifra nombre="SCORM al mes con tu equipo" hoy={decimal(r.scormMesHoy)} generador={decimal(r.scormMesGenerador)} nota="si tienes la demanda" />
        <Cifra nombre="Costo por SCORM" hoy={soles(r.costoHoy)} generador={soles(r.costoGenerador)} />
        <Cifra
          nombre={`Margen a ${soles(competencia)} (competencia)`} hoy={porcentaje(r.margenCompetenciaHoy)} generador={porcentaje(r.margenCompetenciaGenerador)}
          bajo={r.margenCompetenciaGenerador < 0.2} nota={`A tu nuevo precio ${soles(seguro.precioNuevo)}: ${porcentaje(r.margenPrecioNuevo)}`}
        />
      </dl>
      <div className="rent-columnas">
        <div className="rent-principal">
          <div className="tabla-costos">
            <table aria-label="Horas por SCORM de 30 pantallas">
              <caption>Horas por SCORM de 30 pantallas</caption>
              <thead><tr><th scope="col">Etapa</th><th scope="col" className="d">Hoy (h)</th><th scope="col" className="d">Con el generador (h)</th></tr></thead>
              <tbody>
                {r.etapas.map((e, i) => (
                  <tr key={e.etapa}>
                    <th scope="row">{e.nombre}</th>
                    {(['hoy', 'generador'] as const).map((esc) => (
                      <td key={esc} className="d">
                        {editableEsc(esc) ? (
                          <input
                            type="number" min="0" step="0.5" inputMode="decimal" className="horas"
                            aria-label={`${e.nombre}, ${esc === 'hoy' ? 'hoy' : 'con el generador'}`}
                            value={form.etapas[i]![esc]} onChange={(ev) => cambiarHoras(i, esc, ev.target.value)}
                          />
                        ) : (
                          <span className="num">{decimal(esc === 'hoy' ? e.horasHoy : e.horasGenerador)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Total de horas del equipo</th><td className="d num">{decimal(r.horasHoy)}</td><td className="d num">{decimal(r.horasGenerador)}</td></tr></tfoot>
            </table>
          </div>
          <div className="rent-barras">
            <h3>Costo por SCORM frente a los precios</h3>
            <ul aria-label="Costo por SCORM frente a los precios">
              {barras.map((b) => (
                <li key={b.nombre}>
                  <span>{b.nombre}</span>
                  <span className="rent-pista" aria-hidden="true">
                    <i className={b.clase} style={{ width: `${(b.valor / maximo) * 100}%` }} />
                    {b.clase.startsWith('costo') ? <span className="rent-marca" style={{ left: `${(competencia / maximo) * 100}%` }} /> : null}
                  </span>
                  <b className="num">{soles(b.valor)}</b>
                </li>
              ))}
            </ul>
            <p className="sec">La línea vertical marca el precio de la competencia.</p>
          </div>
        </div>
        <form className="rent-datos" onSubmit={guardar} aria-label="Tus datos" noValidate>
          <h3>Tus datos</h3>
          {CAMPOS.map(({ campo, nombre, paso }) => (
            <div key={campo} className="rent-campo">
              <label className="campo">
                {nombre}
                <input type="number" min="0" step={paso} inputMode="decimal" readOnly={!editable} value={form.campos[campo]} onChange={(e) => cambiar(campo, e.target.value)} />
              </label>
              {campo === 'iaPorScormUsd' && iaReal !== null ? (
                <span className="rent-real">
                  Real: <b className="num">{usd(iaReal)}</b> por SCORM
                  {editable ? <button type="button" className="boton" onClick={() => cambiar('iaPorScormUsd', String(Math.round(iaReal * 100) / 100))}>Usar el real</button> : null}
                </span>
              ) : null}
            </div>
          ))}
          {ejemplo ? <div className="nota aviso">Ejemplo con supuestos. Para decidir, mide 2 proyectos reales por etapa y repite el cálculo con «Mediciones».</div> : null}
          {estado ? <div className={`nota ${estado.tipo === 'ok' ? 'validado' : 'error'}`} role={estado.tipo === 'ok' ? 'status' : 'alert'}>{estado.texto}</div> : null}
          {editable ? (
            <div className="acciones-form">
              <button className="boton primario" type="submit" disabled={guardando || !sinGuardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              {sinGuardar ? <span className="sec">Hay cambios sin guardar</span> : null}
            </div>
          ) : <p className="sec">Solo administración cambia estos datos.</p>}
        </form>
      </div>
    </section>
  );
}

function Cifra({ nombre, hoy, generador, nota, bajo }: { nombre: string; hoy: string; generador: string; nota?: string; bajo?: boolean }) {
  return (
    <div>
      <dt>{nombre}</dt>
      <dd>
        <span className="sr">Hoy </span><span className="desde num">{hoy}</span>
        <span aria-hidden="true"> → </span>
        <span className="sr">, con el generador </span><span className={`hacia num${bajo ? ' bajo' : ''}`}>{generador}</span>
      </dd>
      {nota ? <dd className="costos-nota">{nota}</dd> : null}
    </div>
  );
}

// ---------- Mediciones (HU-1303) ----------

function Mediciones({ lista, error, alCambiar }: { lista: MedicionHoras[] | null; error: string; alCambiar: (l: MedicionHoras[]) => void }) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [escenario, setEscenario] = useState<'hoy' | 'generador'>('hoy');
  const [etapa, setEtapa] = useState<string>(CLAVES_ETAPA[0]!);
  const [horas, setHoras] = useState('');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.proyectos().then(setProyectos, () => undefined);
  }, []);

  async function registrar(ev: FormEvent) {
    ev.preventDefault();
    const nombre = proyecto.trim();
    const n = leerNumero(horas);
    if (nombre.length < 2) return setEstado({ tipo: 'error', texto: 'Escribe el nombre del proyecto medido' });
    if (!Number.isFinite(n) || n < 0) return setEstado({ tipo: 'error', texto: 'Escribe las horas: un número de 0 o más' });
    const deLaHerramienta = proyectos.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
    setEnviando(true);
    try {
      const m = await api.registrarMedicion({ ...(deLaHerramienta ? { proyectoId: deLaHerramienta.id } : {}), proyectoRef: nombre, escenario, etapa, horas: n, ...(notas.trim() ? { notas: notas.trim() } : {}) });
      alCambiar([m, ...(lista ?? [])]);
      setHoras('');
      setNotas('');
      setEstado({ tipo: 'ok', texto: `Medición registrada: ${m.proyectoRef}, ${NOMBRE_ETAPA[m.etapa as EtapaNegocio]}` });
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDe(e, 'No se pudo registrar la medición') });
    }
    setEnviando(false);
  }

  async function borrar(m: MedicionHoras) {
    try {
      await api.borrarMedicion(m.id);
      alCambiar((lista ?? []).filter((x) => x.id !== m.id));
      setEstado({ tipo: 'ok', texto: `Medición borrada: ${m.proyectoRef}, ${NOMBRE_ETAPA[m.etapa as EtapaNegocio]}` });
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDe(e, 'No se pudo borrar la medición') });
    }
  }

  return (
    <section className="tarjeta mediciones" role="region" aria-labelledby="medic-titulo">
      <h2 id="medic-titulo">Mediciones</h2>
      <p className="sec">Registra las horas reales del equipo por etapa, sin contar los días de espera del cliente. Con «Mediciones», cada escenario usa el promedio de sus proyectos medidos.</p>
      <form className="mediciones-form" onSubmit={registrar} aria-label="Registrar medición" noValidate>
        <label className="campo">
          Proyecto
          <input list="proyectos-medibles" value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Nombre del proyecto" maxLength={120} />
          <datalist id="proyectos-medibles">{proyectos.map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
        </label>
        <label className="campo">
          Escenario
          <select value={escenario} onChange={(e) => setEscenario(e.target.value as 'hoy' | 'generador')}>
            <option value="hoy">Hoy</option>
            <option value="generador">Con el generador</option>
          </select>
        </label>
        <label className="campo">
          Etapa
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {ETAPAS_NEGOCIO.map((e) => <option key={e.etapa} value={e.etapa}>{e.nombre}</option>)}
          </select>
        </label>
        <label className="campo">
          Horas
          <input type="number" min="0" step="0.25" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
        </label>
        <label className="campo">
          Notas (opcional)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} />
        </label>
        <button className="boton primario" type="submit" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar'}</button>
      </form>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {estado ? <div className={`nota ${estado.tipo === 'ok' ? 'validado' : 'error'}`} role={estado.tipo === 'ok' ? 'status' : 'alert'}>{estado.texto}</div> : null}
      {lista === null ? null : lista.length === 0 ? (
        <p className="sec">Aún no hay mediciones.</p>
      ) : (
        <div className="tabla-costos">
          <table aria-label="Mediciones registradas">
            <caption>Mediciones registradas</caption>
            <thead><tr><th scope="col">Proyecto</th><th scope="col">Escenario</th><th scope="col">Etapa</th><th scope="col" className="d">Horas</th><th scope="col">Registró</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>{m.proyectoRef}{m.notas ? <span className="sec"> · {m.notas}</span> : null}</td>
                  <td>{m.escenario === 'hoy' ? 'Hoy' : 'Con el generador'}</td>
                  <td>{NOMBRE_ETAPA[m.etapa as EtapaNegocio] ?? m.etapa}</td>
                  <td className="d num">{decimal(m.horas, 2)}</td>
                  <td>{m.registradoPor ?? '—'}</td>
                  <td><button type="button" className="boton" aria-label={`Borrar la medición de ${m.proyectoRef}, ${NOMBRE_ETAPA[m.etapa as EtapaNegocio] ?? m.etapa}`} onClick={() => void borrar(m)}>Borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Costo de IA (HU-1302) ----------

function CostoIA({ tipoCambio }: { tipoCambio?: number }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumen, setResumen] = useState<{ clave: string; datos: ResumenCostos } | null>(null);
  const [error, setError] = useState('');
  const clave = `${periodo}|${clienteId}`;

  useEffect(() => {
    api.clientes().then(setClientes, () => undefined);
  }, []);

  useEffect(() => {
    let vigente = true;
    api.costos({ ...rangoPeriodo(periodo, new Date()), clienteId: clienteId || undefined }).then(
      (datos) => { if (vigente) { setResumen({ clave: `${periodo}|${clienteId}`, datos }); setError(''); } },
      (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el costo de IA'); },
    );
    return () => { vigente = false; };
  }, [periodo, clienteId]);

  const r = resumen?.datos;
  const cargando = resumen?.clave !== clave && !error;
  const nombrePeriodo = PERIODOS.find((p) => p.valor === periodo)!.nombre.toLowerCase();
  return (
    <section className="tarjeta costos" role="region" aria-labelledby="costos-titulo">
      <div className="costos-cabecera">
        <h2 id="costos-titulo">Costo de IA</h2>
        <div className="costos-filtros">
          <div className="opciones" role="group" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button key={p.valor} type="button" className="opcion" aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>
                {p.nombre}
              </button>
            ))}
          </div>
          <label className="campo">
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {cargando ? <p className="sec" role="status">Calculando el costo de IA…</p> : null}
      {r ? (
        <div className="costos-cuerpo" aria-busy={cargando}>
          <dl className="costos-cifras" aria-label="Resumen del periodo">
            <div>
              <dt>Total del periodo</dt>
              <dd className="num">{usd(r.totalUsd)}</dd>
              {tipoCambio ? <dd className="costos-nota">≈ {soles(r.totalUsd * tipoCambio, 2)}</dd> : null}
            </div>
            <div>
              <dt>Promedio por SCORM</dt>
              <dd className="num">{usd(r.promedioPorScormUsd)}</dd>
              {tipoCambio ? <dd className="costos-nota">≈ {soles(r.promedioPorScormUsd * tipoCambio, 2)}</dd> : null}
              <dd className="costos-nota">{r.criterioPromedio === 'exportados' ? 'Sobre los proyectos con paquete exportado' : 'Aún sin paquetes exportados: sobre los proyectos con gasto'}</dd>
            </div>
            <div>
              <dt>SCORM contados</dt>
              <dd className="num">{r.scormContados}</dd>
            </div>
          </dl>
          {r.porProveedorTarea.length === 0 ? (
            <p className="sec">No hay consumo de IA registrado en {periodo === 'todo' ? 'ningún periodo' : nombrePeriodo}{clienteId ? ' para este cliente' : ''}.</p>
          ) : (
            <>
              <div className="tabla-costos">
                <table aria-label="Por proyecto">
                  <caption>Por proyecto</caption>
                  <thead><tr><th scope="col">Proyecto</th><th scope="col">Cliente</th><th scope="col" className="d">Llamadas</th><th scope="col">Paquete</th><th scope="col" className="d">Costo</th></tr></thead>
                  <tbody>
                    {r.porProyecto.map((p) => (
                      <tr key={p.proyectoId}>
                        <td><a href={`/proyectos/${p.proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${p.proyectoId}`); }}>{p.nombre}</a></td>
                        <td>{p.cliente}</td>
                        <td className="d num">{p.llamadas}</td>
                        <td>{p.exportado ? <span className="chip validado">Exportado</span> : <span className="chip">Sin exportar</span>}</td>
                        <td className="d num">{usd(p.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tabla-costos">
                <table aria-label="Por cliente">
                  <caption>Por cliente</caption>
                  <thead><tr><th scope="col">Cliente</th><th scope="col" className="d">Proyectos</th><th scope="col" className="d">Sin proyecto</th><th scope="col" className="d">Total</th></tr></thead>
                  <tbody>
                    {r.porCliente.map((c) => (
                      <tr key={c.clienteId}>
                        <td>{c.nombre}</td>
                        <td className="d num">{usd(c.proyectosUsd)}</td>
                        <td className="d num">{usd(c.sinProyectoUsd)}</td>
                        <td className="d num">{usd(c.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="sec">«Sin proyecto» es lo que se hizo para el cliente fuera de un proyecto, como la propuesta del kit desde un curso anterior.</p>
              </div>
              <div className="tabla-costos">
                <table aria-label="Por proveedor y tarea">
                  <caption>Por proveedor y tarea</caption>
                  <thead><tr><th scope="col">Proveedor</th><th scope="col">Tarea</th><th scope="col" className="d">Llamadas</th><th scope="col" className="d">Costo</th></tr></thead>
                  <tbody>
                    {r.porProveedorTarea.map((f) => (
                      <tr key={`${f.proveedor}|${f.tarea}`}>
                        <td>{f.proveedor}</td>
                        <td>{NOMBRE_TAREA[f.tarea] ? <>{NOMBRE_TAREA[f.tarea]} <span className="sec">{f.tarea}</span></> : f.tarea}</td>
                        <td className="d num">{f.llamadas}</td>
                        <td className="d num">{usd(f.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="sec">Montos en dólares, como los cobra cada proveedor{tipoCambio ? `; en soles con el tipo de cambio guardado (${tipoCambio})` : ''}.</p>
        </div>
      ) : null}
    </section>
  );
}
