// HU-1702 · Ventas › Planes (PNT-35, REQ-082, CP-141, CP-142): una tarjeta por plan con «Mostrar plan» y «Destacar
// como Más elegido», sus campos, el orden y sus características (agregar, ocultar, quitar); y la tarjeta «Página de
// precios» con la opción anual, el descuento y el IGV. Los planes no se borran: se ocultan. Lo que ve el visitante
// en /precios sale de la versión publicada: los cambios se ven al publicar. Solo el superadmin (ADR-011).
// Los indicadores de ingresos llegan con las suscripciones (HU-1710). HU-1704: precios opcionales en dólares (para
// cobrar con Stripe a clientes del exterior, RN-18-9).
import { type AjustesPlanes, type Caracteristica, conIgv, dolares, LIMITES_PLAN, SLUG_PLAN, soles, validarAjustesPlanes, validarPlan, validarPlanCompleto, type DatosPlan } from '@aptio/schema/planes';
import { Cabecera } from '@aptio/ui';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi, type EntradaPlan, type PlanVenta } from '../api';
import { usePublicacionSitio } from './publicacion-sitio';
import { AccionPublicar, AvisosPublicacion } from './SitioVersiones';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
const PAGINA_PRECIOS = '/s/precios';

/** «S/ 490 al mes + IGV · S/ 4,704 al año», como lo verá el visitante. */
function resumenPrecio(p: PlanVenta, a: AjustesPlanes): string {
  if (p.precioMes === null) return 'A medida: el botón lleva a agendar con ventas';
  const precio = (n: number) => soles(a.conIgv ? conIgv(n) : n);
  const mes = `${precio(p.precioMes)} al mes ${a.conIgv ? 'con IGV' : '+ IGV'}`;
  const pen = a.mostrarAnual && p.precioAnualEfectivo !== null ? `${mes} · ${precio(p.precioAnualEfectivo)} al año` : mes;
  return p.precioMesUsd === null ? pen : `${pen} · ${dolares(p.precioMesUsd)} al mes en dólares`;
}

export function VentasPlanes() {
  const [planes, setPlanes] = useState<PlanVenta[] | null>(null);
  const [ajustes, setAjustes] = useState<AjustesPlanes | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const publicacion = usePublicacionSitio();

  const cargar = () => api.planes().then((r) => { setPlanes(r.planes); setAjustes(r.ajustes); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los planes')));
  useEffect(() => { void cargar(); }, []);

  /** Corre un cambio, vuelve a leer los planes (el destacado puede haber cambiado en otro) y avisa. */
  async function hacer(accion: () => Promise<unknown>, ok: string, fallo: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    publicacion.limpiar();
    try {
      await accion();
      await cargar();
      publicacion.recargar();
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function mover(p: PlanVenta, paso: -1 | 1) {
    if (!planes) return;
    const i = planes.findIndex((x) => x.id === p.id);
    const ids = planes.map((x) => x.id);
    [ids[i], ids[i + paso]] = [ids[i + paso]!, ids[i]!];
    void hacer(() => api.ordenarPlanes(ids), `«${p.nombre}» quedó en la posición ${i + paso + 1}.`, 'No se cambió el orden');
  }

  return (
    <>
      <Cabecera titulo="Planes" subtitulo="Planes, precios y características de la página de precios. Se ven en el sitio al publicar."
        accion={<div className="acciones-cabecera"><a className="boton" href={PAGINA_PRECIOS} target="_blank" rel="noopener">Ver /precios<span className="sr"> (se abre en una pestaña nueva)</span></a><AccionPublicar estado={publicacion} /></div>} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      <AvisosPublicacion estado={publicacion} />
      {!planes || !ajustes ? (!error ? <p className="sec" role="status">Cargando los planes…</p> : null) : (
        <>
          <ul className="planes-panel" aria-label="Planes">
            {planes.map((p, i) => (
              <li key={p.id}>
                <TarjetaPlan
                  key={`${p.id}-${p.actualizadoEn}`} plan={p} ajustes={ajustes} ocupado={ocupado} primero={i === 0} ultimo={i === planes.length - 1}
                  alMover={(paso) => mover(p, paso)}
                  alCambiar={(d, ok) => hacer(() => api.cambiarPlan(p.id, d), ok, `No se guardó «${p.nombre}»`)}
                />
              </li>
            ))}
          </ul>
          {planes.length === 0 ? <p className="nota">Aún no hay planes. Crea el primero con «Nuevo plan».</p> : null}
          <div className="planes-pie">
            {nuevo ? (
              <NuevoPlan ocupado={ocupado} alCancelar={() => setNuevo(false)} alCrear={async (d) => {
                if (await hacer(() => api.crearPlan(d), `Se creó «${d.nombre}», oculto: complétalo y muéstralo cuando esté listo.`, 'No se creó el plan')) setNuevo(false);
              }} />
            ) : <button type="button" className="boton" disabled={ocupado} onClick={() => { setNuevo(true); setAviso(null); }}>Nuevo plan</button>}
          </div>
          <PaginaPrecios key={JSON.stringify(ajustes)} ajustes={ajustes} ocupado={ocupado}
            alGuardar={(a) => hacer(() => api.guardarAjustesPlanes(a), 'Se guardaron los ajustes de la página de precios.', 'No se guardaron los ajustes')} />
        </>
      )}
    </>
  );
}

type Borrador = { nombre: string; descripcion: string; aMedida: boolean; precioMes: string; precioAnual: string; precioMesUsd: string; precioAnualUsd: string; capsulasMes: string; usuarios: string; capsulaAdicional: string; textoBoton: string; ficticio: boolean; caracteristicas: Caracteristica[] };
const txt = (n: number | null) => (n === null ? '' : String(n));
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const aBorrador = (p: PlanVenta): Borrador => ({
  nombre: p.nombre, descripcion: p.descripcion, aMedida: p.precioMes === null, precioMes: txt(p.precioMes), precioAnual: txt(p.precioAnual), precioMesUsd: txt(p.precioMesUsd), precioAnualUsd: txt(p.precioAnualUsd), capsulasMes: txt(p.capsulasMes), usuarios: txt(p.usuarios),
  capsulaAdicional: txt(p.capsulaAdicional), textoBoton: p.textoBoton, ficticio: p.ficticio, caracteristicas: p.caracteristicas.map((c) => ({ ...c })),
});
const aDatos = (b: Borrador): Omit<DatosPlan, 'slug' | 'destacado' | 'visible'> => ({
  nombre: b.nombre, descripcion: b.descripcion, textoBoton: b.textoBoton, capsulasMes: num(b.capsulasMes), usuarios: num(b.usuarios),
  precioMes: b.aMedida ? null : num(b.precioMes), precioAnual: b.aMedida ? null : num(b.precioAnual), capsulaAdicional: b.aMedida ? null : num(b.capsulaAdicional),
  precioMesUsd: b.aMedida ? null : num(b.precioMesUsd), precioAnualUsd: b.aMedida ? null : num(b.precioAnualUsd),
  caracteristicas: b.caracteristicas.filter((c) => c.texto.trim() !== ''),
});

function Interruptor({ activo, etiqueta, texto, ocupado, alCambiar }: { activo: boolean; etiqueta: string; texto: string; ocupado: boolean; alCambiar: () => void }) {
  return (
    <div className="fila-interruptor">
      <span>{texto}</span>
      <button type="button" role="switch" className="interruptor" aria-checked={activo} aria-label={etiqueta} disabled={ocupado} onClick={alCambiar}><span aria-hidden="true" /></button>
    </div>
  );
}

function TarjetaPlan({ plan: p, ajustes, ocupado, primero, ultimo, alMover, alCambiar }: {
  plan: PlanVenta; ajustes: AjustesPlanes; ocupado: boolean; primero: boolean; ultimo: boolean; alMover: (paso: -1 | 1) => void; alCambiar: (d: EntradaPlan, ok: string) => Promise<boolean>;
}) {
  const [b, setB] = useState<Borrador>(() => aBorrador(p));
  const [errores, setErrores] = useState<string[]>([]);
  const nueva = useRef<HTMLInputElement>(null);
  const enfocar = useRef(false);
  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const rasgo = (j: number, c: Partial<Caracteristica>) => setB((x) => ({ ...x, caracteristicas: x.caracteristicas.map((y, k) => (k === j ? { ...y, ...c } : y)) }));
  const id = `plan-${p.slug}`;
  // Al agregar una característica, el foco va a su campo (después de que se pinta).
  useEffect(() => {
    if (!enfocar.current) return;
    enfocar.current = false;
    nueva.current?.focus();
  }, [b.caracteristicas.length]);

  function guardar() {
    const datos = aDatos(b);
    const numeros = (['precioMes', 'precioAnual', 'precioMesUsd', 'precioAnualUsd', 'capsulasMes', 'usuarios', 'capsulaAdicional'] as const).filter((k) => datos[k] !== null && !Number.isInteger(datos[k]));
    const e = [
      ...numeros.map(() => 'Los precios y cantidades van en números enteros'),
      ...validarPlan(datos, { parcial: true }).map((x) => x.mensaje),
    ];
    if (!e.length) e.push(...validarPlanCompleto({ ...datos, slug: p.slug, destacado: p.destacado, visible: p.visible }).map((x) => x.mensaje));
    setErrores([...new Set(e)]);
    if (!e.length) void alCambiar({ ...datos, ficticio: b.ficticio }, `Se guardó «${datos.nombre.trim()}». Publica el sitio para que se vea en /precios.`);
  }

  return (
    <article className={`tarjeta plan-panel${p.destacado ? ' destacado' : ''}${p.visible ? '' : ' oculto'}`} aria-labelledby={`${id}-titulo`}>
      <div className="tarjeta-cabeza">
        <h2 id={`${id}-titulo`}>{p.nombre}</h2>
        <span className="plan-chips">
          {p.destacado ? <span className="chip validado">Más elegido</span> : null}
          {p.ficticio ? <span className="chip aviso">Ficticio</span> : null}
          {p.visible ? null : <span className="chip">Oculto</span>}
        </span>
      </div>
      <p className="sec plan-resumen"><span className="seo-ruta">/{p.slug}</span> · {resumenPrecio(p, ajustes)}</p>
      <Interruptor activo={p.visible} etiqueta={`Mostrar plan ${p.nombre}`} texto="Mostrar plan" ocupado={ocupado}
        alCambiar={() => void alCambiar({ visible: !p.visible }, `«${p.nombre}» quedó ${p.visible ? 'oculto' : 'visible'}. Publica el sitio para que se vea en /precios.`)} />
      <Interruptor activo={p.destacado} etiqueta={`Destacar ${p.nombre} como Más elegido`} texto="Destacar como «Más elegido»" ocupado={ocupado}
        alCambiar={() => void alCambiar({ destacado: !p.destacado }, p.destacado ? `«${p.nombre}» ya no está destacado.` : `«${p.nombre}» es ahora el plan «Más elegido»; los demás dejaron de estarlo.`)} />
      <form className="formulario-ajustes" aria-label={`Datos del plan ${p.nombre}`} noValidate onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        {errores.length ? (
          <div className="nota error" role="alert"><p>Revisa el plan:</p><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div>
        ) : null}
        <p className="campo"><label htmlFor={`${id}-nombre`}>Nombre</label><input id={`${id}-nombre`} type="text" value={b.nombre} maxLength={LIMITES_PLAN.nombre} onChange={(e) => cambiar('nombre', e.target.value)} /></p>
        <p className="campo"><label htmlFor={`${id}-descripcion`}>Descripción</label><textarea id={`${id}-descripcion`} rows={2} value={b.descripcion} maxLength={LIMITES_PLAN.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} /></p>
        <label className="casilla"><input type="checkbox" checked={b.aMedida} onChange={(e) => cambiar('aMedida', e.target.checked)} /> Precio a medida (sin precio; el botón lleva a agendar con ventas)</label>
        <div className="plan-campos">
          {b.aMedida ? null : (
            <>
              <p className="campo"><label htmlFor={`${id}-mes`}>Precio al mes (S/, sin IGV)</label><input id={`${id}-mes`} type="number" inputMode="numeric" min={1} value={b.precioMes} onChange={(e) => cambiar('precioMes', e.target.value)} /></p>
              <p className="campo">
                <label htmlFor={`${id}-anual`}>Precio al año (S/)</label>
                <input id={`${id}-anual`} type="number" inputMode="numeric" min={1} value={b.precioAnual} placeholder={p.precioAnual === null && p.precioAnualEfectivo !== null ? String(p.precioAnualEfectivo) : ''} aria-describedby={`${id}-anual-ayuda`} onChange={(e) => cambiar('precioAnual', e.target.value)} />
                <span id={`${id}-anual-ayuda`} className="sec">Vacío: el mensual × 12 con el {ajustes.descuentoAnual} % de descuento.</span>
              </p>
              <p className="campo">
                <label htmlFor={`${id}-mes-usd`}>Precio al mes en dólares (US$, opcional)</label>
                <input id={`${id}-mes-usd`} type="number" inputMode="numeric" min={1} value={b.precioMesUsd} aria-describedby={`${id}-usd-ayuda`} onChange={(e) => cambiar('precioMesUsd', e.target.value)} />
                <span id={`${id}-usd-ayuda`} className="sec">Vacío: el plan se cobra solo en soles. En dólares cobra Stripe, si está visible y activa en Pasarelas.</span>
              </p>
              <p className="campo">
                <label htmlFor={`${id}-anual-usd`}>Precio al año en dólares (US$)</label>
                <input id={`${id}-anual-usd`} type="number" inputMode="numeric" min={1} value={b.precioAnualUsd} placeholder={p.precioAnualUsd === null && p.precioAnualUsdEfectivo !== null ? String(p.precioAnualUsdEfectivo) : ''} onChange={(e) => cambiar('precioAnualUsd', e.target.value)} />
              </p>
              <p className="campo"><label htmlFor={`${id}-extra`}>Cápsula adicional (S/)</label><input id={`${id}-extra`} type="number" inputMode="numeric" min={1} value={b.capsulaAdicional} onChange={(e) => cambiar('capsulaAdicional', e.target.value)} /></p>
            </>
          )}
          <p className="campo"><label htmlFor={`${id}-capsulas`}>Cápsulas al mes</label><input id={`${id}-capsulas`} type="number" inputMode="numeric" min={0} value={b.capsulasMes} onChange={(e) => cambiar('capsulasMes', e.target.value)} /></p>
          <p className="campo"><label htmlFor={`${id}-usuarios`}>Usuarios</label><input id={`${id}-usuarios`} type="number" inputMode="numeric" min={0} value={b.usuarios} onChange={(e) => cambiar('usuarios', e.target.value)} /></p>
          <p className="campo"><label htmlFor={`${id}-boton`}>Texto del botón</label><input id={`${id}-boton`} type="text" value={b.textoBoton} maxLength={LIMITES_PLAN.textoBoton} onChange={(e) => cambiar('textoBoton', e.target.value)} /></p>
        </div>
        <fieldset className="plan-rasgos">
          <legend>Características</legend>
          {b.caracteristicas.length === 0 ? <p className="sec">Sin características.</p> : null}
          <ul>
            {b.caracteristicas.map((c, j) => (
              <li key={j} className={c.visible ? '' : 'oculto'}>
                <button type="button" role="switch" className="interruptor" aria-checked={c.visible} aria-label={`Mostrar característica ${j + 1}`} onClick={() => rasgo(j, { visible: !c.visible })}><span aria-hidden="true" /></button>
                <input type="text" value={c.texto} maxLength={LIMITES_PLAN.caracteristica} aria-label={`Característica ${j + 1}`} ref={j === b.caracteristicas.length - 1 ? nueva : undefined} onChange={(e) => rasgo(j, { texto: e.target.value })} />
                <button type="button" className="boton icono" aria-label={`Quitar característica ${j + 1}`} onClick={() => setB((x) => ({ ...x, caracteristicas: x.caracteristicas.filter((_, k) => k !== j) }))}>×</button>
              </li>
            ))}
          </ul>
          <button type="button" className="boton chico" disabled={b.caracteristicas.length >= LIMITES_PLAN.caracteristicas}
            onClick={() => { setB((x) => ({ ...x, caracteristicas: [...x.caracteristicas, { texto: '', visible: true }] })); enfocar.current = true; }}>Agregar característica</button>
        </fieldset>
        <label className="casilla"><input type="checkbox" checked={b.ficticio} onChange={(e) => cambiar('ficticio', e.target.checked)} /> Dato ficticio (nunca se muestra en producción)</label>
        <div className="acciones-fila">
          <button type="submit" className="boton primario" disabled={ocupado}>Guardar plan</button>
          <button type="button" className="boton icono" disabled={ocupado || primero} onClick={() => alMover(-1)} aria-label={`Subir ${p.nombre}`}>↑</button>
          <button type="button" className="boton icono" disabled={ocupado || ultimo} onClick={() => alMover(1)} aria-label={`Bajar ${p.nombre}`}>↓</button>
        </div>
      </form>
    </article>
  );
}

function NuevoPlan({ ocupado, alCrear, alCancelar }: { ocupado: boolean; alCrear: (d: EntradaPlan & { nombre: string }) => Promise<void>; alCancelar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [tocado, setTocado] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const primero = useRef<HTMLInputElement>(null);
  useEffect(() => { primero.current?.focus(); }, []);
  const sugerido = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const valor = tocado ? slug : sugerido;
  return (
    <form className="tarjeta formulario-ajustes" aria-labelledby="plan-nuevo-titulo" noValidate onSubmit={(e) => {
      e.preventDefault();
      const errs = [...(nombre.trim() ? [] : ['Escribe el nombre del plan']), ...(SLUG_PLAN.test(valor) ? [] : ['El identificador va en minúsculas, números y guiones'])];
      setErrores(errs);
      if (!errs.length) void alCrear({ nombre: nombre.trim(), slug: valor });
    }}>
      <h2 id="plan-nuevo-titulo">Nuevo plan</h2>
      {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      <div className="plan-campos">
        <p className="campo"><label htmlFor="plan-nuevo-nombre">Nombre</label><input id="plan-nuevo-nombre" ref={primero} type="text" value={nombre} maxLength={LIMITES_PLAN.nombre} onChange={(e) => setNombre(e.target.value)} /></p>
        <p className="campo">
          <label htmlFor="plan-nuevo-slug">Identificador</label>
          <input id="plan-nuevo-slug" type="text" value={valor} spellCheck={false} aria-describedby="plan-nuevo-slug-ayuda" onChange={(e) => { setTocado(true); setSlug(e.target.value); }} />
          <span id="plan-nuevo-slug-ayuda" className="sec">Va en el enlace del plan y no cambia después.</span>
        </p>
      </div>
      <div className="acciones-fila">
        <button type="submit" className="boton primario" disabled={ocupado}>Crear plan</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function PaginaPrecios({ ajustes, ocupado, alGuardar }: { ajustes: AjustesPlanes; ocupado: boolean; alGuardar: (a: AjustesPlanes) => Promise<boolean> }) {
  const [mostrarAnual, setMostrarAnual] = useState(ajustes.mostrarAnual);
  const [descuento, setDescuento] = useState(String(ajustes.descuentoAnual));
  const [igv, setIgv] = useState(ajustes.conIgv);
  const [errores, setErrores] = useState<string[]>([]);
  return (
    <section className="tarjeta plan-precios" aria-labelledby="plan-precios-titulo">
      <div className="tarjeta-cabeza"><h2 id="plan-precios-titulo">Página de precios</h2></div>
      <form className="formulario-ajustes" aria-label="Ajustes de la página de precios" noValidate onSubmit={(e) => {
        e.preventDefault();
        const a = { mostrarAnual, descuentoAnual: Number(descuento), conIgv: igv };
        const errs = descuento.trim() === '' ? ['Escribe el descuento anual'] : validarAjustesPlanes(a).map((x) => x.mensaje);
        setErrores(errs);
        if (!errs.length) void alGuardar(a);
      }}>
        {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        <Interruptor activo={mostrarAnual} etiqueta="Mostrar opción anual" texto="Mostrar opción anual" ocupado={ocupado} alCambiar={() => setMostrarAnual((v) => !v)} />
        <p className="campo">
          <label htmlFor="plan-descuento">Descuento anual (%)</label>
          <input id="plan-descuento" type="number" inputMode="numeric" min={0} max={90} value={descuento} aria-describedby="plan-descuento-ayuda" onChange={(e) => setDescuento(e.target.value)} />
          <span id="plan-descuento-ayuda" className="sec">Se aplica a los planes sin precio anual propio.</span>
        </p>
        <Interruptor activo={igv} etiqueta="Mostrar precios con IGV" texto="Precios con IGV incluido" ocupado={ocupado} alCambiar={() => setIgv((v) => !v)} />
        <p className="sec">Los precios se guardan sin IGV (18 %); con esta opción el sitio los muestra con IGV.</p>
        <div className="acciones-fila"><button type="submit" className="boton primario" disabled={ocupado}>Guardar ajustes</button></div>
      </form>
    </section>
  );
}
