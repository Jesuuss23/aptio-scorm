// HU-1704 · Ventas › Pasarelas (PNT-37, REQ-084, REQ-110, RN-18-9): una tarjeta por pasarela con «Mostrar en el pago»,
// el modo (pruebas o producción), el nombre visible y el orden; en el pago cobra la primera visible y activa que cobre
// la moneda. Las llaves nunca pasan por aquí: viven en variables de entorno, y la tarjeta solo dice cuáles faltan. Abajo,
// los pagos aprobados que no crearon la cuenta (correo en uso, monto distinto o solicitud ya cerrada) con «Reembolsar»
// (SUP-291); la nota de crédito llega con la HU-1707. Solo el superadmin (ADR-011).
import { LIMITE_NOMBRE_PASARELA, type ModoPasarela, validarCambioPasarela } from '@aptio/schema/pasarelas';
import { monto2 } from '@aptio/schema/suscripciones';
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, type CobroVenta, ErrorApi, type PasarelaVenta } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
const FLUJOS: Record<PasarelaVenta['flujo'], string> = {
  simulado: 'Formulario simulado con tarjetas de prueba (solo en el entorno de pruebas)',
  redireccion: 'Página de pago alojada por la pasarela',
  formulario: 'Ventana de pago incrustada de la pasarela',
};
const MONEDAS: Record<'PEN' | 'USD', string> = { PEN: 'soles', USD: 'dólares' };
const fecha = (iso: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(iso));

export function VentasPasarelas() {
  const [pasarelas, setPasarelas] = useState<PasarelaVenta[] | null>(null);
  const [cobros, setCobros] = useState<CobroVenta[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = () => Promise.all([api.pasarelas(), api.cobros(true)]).then(([p, c]) => { setPasarelas(p.pasarelas); setCobros(c.cobros); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las pasarelas')));
  useEffect(() => { void cargar(); }, []);

  async function hacer(accion: () => Promise<unknown>, ok: string, fallo: string): Promise<boolean> {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      await cargar();
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: `${fallo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function mover(p: PasarelaVenta, paso: -1 | 1) {
    if (!pasarelas) return;
    const i = pasarelas.findIndex((x) => x.codigo === p.codigo);
    const codigos = pasarelas.map((x) => x.codigo);
    [codigos[i], codigos[i + paso]] = [codigos[i + paso]!, codigos[i]!];
    void hacer(() => api.ordenarPasarelas(codigos), `«${p.nombre}» quedó en la posición ${i + paso + 1}.`, 'No se cambió el orden');
  }

  return (
    <>
      <Cabecera titulo="Pasarelas" subtitulo="Cómo se cobra en el pago: en cada moneda cobra la primera pasarela visible y activa. Las llaves van en variables de entorno, nunca aquí." />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {!pasarelas || !cobros ? (!error ? <p className="sec" role="status">Cargando las pasarelas…</p> : null) : (
        <>
          <ul className="planes-panel" aria-label="Pasarelas">
            {pasarelas.map((p, i) => (
              <li key={p.codigo}>
                <TarjetaPasarela key={`${p.codigo}-${p.nombre}-${p.modo}`} p={p} ocupado={ocupado} primero={i === 0} ultimo={i === pasarelas.length - 1} alMover={(paso) => mover(p, paso)}
                  alCambiar={(d, ok) => hacer(() => api.cambiarPasarela(p.codigo, d), ok, `No se guardó «${p.nombre}»`)} />
              </li>
            ))}
          </ul>
          <section className="tarjeta cobros-sin-alta" aria-labelledby="cobros-titulo">
            <div className="tarjeta-cabeza"><h2 id="cobros-titulo">Pagos aprobados sin cuenta</h2></div>
            <p className="sec">Pagos que la pasarela aprobó pero no crearon la organización. Revísalos y reembolsa los que correspondan; la nota de crédito se emite con la facturación electrónica.</p>
            {cobros.length === 0 ? <p className="nota">No hay pagos aprobados sin cuenta.</p> : (
              <table className="tabla-popups" aria-labelledby="cobros-titulo">
                <thead><tr><th scope="col">Empresa</th><th scope="col">Pago</th><th scope="col">Motivo</th><th scope="col">Acción</th></tr></thead>
                <tbody>
                  {cobros.map((c) => <FilaCobro key={c.id} c={c} ocupado={ocupado}
                    alReembolsar={() => hacer(() => api.reembolsarCobro(c.id), `Se reembolsaron ${monto2(c.monto, c.moneda)} a ${c.razonSocial}.`, 'No se reembolsó')} />)}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}

function TarjetaPasarela({ p, ocupado, primero, ultimo, alMover, alCambiar }: {
  p: PasarelaVenta; ocupado: boolean; primero: boolean; ultimo: boolean; alMover: (paso: -1 | 1) => void;
  alCambiar: (d: Partial<Pick<PasarelaVenta, 'nombre' | 'visible' | 'modo'>>, ok: string) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState(p.nombre);
  const [modo, setModo] = useState<ModoPasarela>(p.modo);
  const [errores, setErrores] = useState<string[]>([]);
  const id = `pasarela-${p.codigo}`;
  return (
    <article className={`tarjeta plan-panel${p.visible ? '' : ' oculto'}`} aria-labelledby={`${id}-titulo`}>
      <div className="tarjeta-cabeza">
        <h2 id={`${id}-titulo`}>{p.nombre}</h2>
        <span className="plan-chips">
          {p.activa ? <span className="chip validado">Activa</span> : <span className="chip aviso">Sin llaves</span>}
          {p.simulada ? <span className="chip">Simulada</span> : null}
          {p.visible ? null : <span className="chip">Oculta</span>}
        </span>
      </div>
      <p className="sec plan-resumen">Cobra en {p.monedas.map((m) => MONEDAS[m]).join(' y ')} · {FLUJOS[p.flujo]}</p>
      {p.variablesFaltantes.length ? (
        <p className="nota" id={`${id}-faltan`}>Para activarla en modo {p.modo === 'produccion' ? 'producción' : 'pruebas'}, configura en el servidor: {p.variablesFaltantes.map((v, i) => <span key={v}>{i ? ', ' : ''}<code>{v}</code></span>)}.</p>
      ) : null}
      <div className="fila-interruptor">
        <span>Mostrar en el pago</span>
        <button type="button" role="switch" className="interruptor" aria-checked={p.visible} aria-label={`Mostrar ${p.nombre} en el pago`} disabled={ocupado}
          onClick={() => void alCambiar({ visible: !p.visible }, `«${p.nombre}» quedó ${p.visible ? 'oculta' : 'visible'} en el pago.`)}><span aria-hidden="true" /></button>
      </div>
      <form className="formulario-ajustes" aria-label={`Datos de ${p.nombre}`} noValidate onSubmit={(e) => {
        e.preventDefault();
        const cambio = { nombre: nombre.trim(), modo };
        const errs = validarCambioPasarela(p.codigo, cambio).map((x) => x.mensaje);
        setErrores(errs);
        if (!errs.length) void alCambiar(cambio, `Se guardó «${cambio.nombre}».`);
      }}>
        {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        <div className="plan-campos">
          <p className="campo"><label htmlFor={`${id}-nombre`}>Nombre visible</label><input id={`${id}-nombre`} type="text" value={nombre} maxLength={LIMITE_NOMBRE_PASARELA} onChange={(e) => setNombre(e.target.value)} /></p>
          <p className="campo">
            <label htmlFor={`${id}-modo`}>Modo</label>
            <select id={`${id}-modo`} value={modo} disabled={p.simulada} aria-describedby={`${id}-modo-ayuda`} onChange={(e) => setModo(e.target.value as ModoPasarela)}>
              <option value="pruebas">Pruebas (sandbox)</option>
              <option value="produccion">Producción</option>
            </select>
            <span id={`${id}-modo-ayuda`} className="sec">{p.simulada ? 'La simulada no cobra de verdad.' : 'Elige qué juego de llaves usa.'}</span>
          </p>
        </div>
        <div className="acciones-fila">
          <button type="submit" className="boton primario" disabled={ocupado}>Guardar</button>
          <button type="button" className="boton icono" disabled={ocupado || primero} onClick={() => alMover(-1)} aria-label={`Subir ${p.nombre}`}>↑</button>
          <button type="button" className="boton icono" disabled={ocupado || ultimo} onClick={() => alMover(1)} aria-label={`Bajar ${p.nombre}`}>↓</button>
        </div>
      </form>
    </article>
  );
}

function FilaCobro({ c, ocupado, alReembolsar }: { c: CobroVenta; ocupado: boolean; alReembolsar: () => Promise<boolean> }) {
  const [confirmar, setConfirmar] = useState(false);
  const motivo = (c.motivoSinAlta ?? '').replace(/^[A-Z_]+: /, '');
  return (
    <tr>
      <th scope="row"><b>{c.razonSocial}</b><br /><span className="sec">{c.correoAdmin} · {c.nombrePlan}</span></th>
      <td>{monto2(c.monto, c.moneda)}<br /><span className="sec">{c.pasarela}{c.ultimos4Digitos ? ` · tarjeta •••• ${c.ultimos4Digitos}` : ''} · {fecha(c.creadoEn)}</span></td>
      <td>{motivo}</td>
      <td>
        {c.estado === 'REEMBOLSADO' ? <span className="chip">Reembolsado</span> : confirmar ? (
          <div className="popup-acciones" role="group" aria-label={`Confirmar el reembolso a ${c.razonSocial}`}>
            <span>¿Reembolsar {monto2(c.monto, c.moneda)}?</span>
            <button type="button" className="boton primario" disabled={ocupado} onClick={() => void alReembolsar().then(() => setConfirmar(false))}>Sí, reembolsar</button>
            <button type="button" className="boton" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
          </div>
        ) : <button type="button" className="boton" disabled={ocupado || !c.reembolsable} onClick={() => setConfirmar(true)}>Reembolsar<span className="sr"> {monto2(c.monto, c.moneda)} a {c.razonSocial}</span></button>}
      </td>
    </tr>
  );
}
