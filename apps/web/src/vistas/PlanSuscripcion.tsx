// HU-1706 · Plan y suscripción (REQ-086, CP-147, RN-18-7), solo el administrador: el plan actual con su cuota, los planes
// publicados con «Cambiar a {Plan}» y el resumen del prorrateo antes de confirmar; la subida se paga con la pasarela de
// la suscripción (formulario simulado en pruebas, página alojada de Stripe que vuelve a /plan?cambio=, o Culqi Checkout)
// y rige de inmediato; la bajada queda programada para la renovación. «Cancelar al fin del período» con confirmación y
// «Seguir con mi plan». La tarjeta nunca pasa por Aptio SCORM.
// HU-1708 · Con el pago de la renovación pendiente o la cuenta suspendida, «Pagar ahora» con el total y la fecha de la
// suspensión; la página alojada vuelve a /plan?renovacion=.
import { Cabecera } from '@aptio/ui';
import { monto2 } from '@aptio/schema/suscripciones';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, type CambioPlan, type CuotaCapsulas, ErrorApi, type PagoCompra, type PagoRenovacion, type PlanOpcion, type SuscripcionOrg } from '../api';
import { avisarCobranza } from '../cobranza';
import { IndicadorCuota } from './CuotaCapsulas';
import { cargarCulqi, mensajeDe } from './pagos';

const CONSULTA_MS = 1500;
const CONSULTAS = 20;
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });
const cuotaDe = (n: number | null) => (n === null ? 'cápsulas sin límite' : `${n} ${n === 1 ? 'cápsula' : 'cápsulas'} al mes`);
const porCiclo = (ciclo: 'MENSUAL' | 'ANUAL') => (ciclo === 'ANUAL' ? 'al año' : 'al mes');
const listo = (c: CambioPlan) => `Listo: ya tienes el plan ${c.planDestino.nombre}. Tu cuota es de ${cuotaDe(c.planDestino.capsulasMes)} desde ahora.`;

/** El resumen del cambio antes de confirmar: el prorrateo de la subida o la fecha de la bajada. */
function ResumenCambio({ cambio, ocupado, alConfirmar, alVolver }: { cambio: CambioPlan; ocupado: boolean; alConfirmar: () => void; alVolver: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  const subida = cambio.tipo === 'SUBIDA';
  return (
    <section className="tarjeta resumen-cambio" aria-labelledby="resumen-cambio">
      <h2 id="resumen-cambio" ref={titulo} tabIndex={-1}>Cambiar a {cambio.planDestino.nombre}</h2>
      {subida ? (
        <>
          <p>Pasas de {cambio.planOrigen.nombre} a {cambio.planDestino.nombre} hoy y tu cuota sube a {cuotaDe(cambio.planDestino.capsulasMes)}.</p>
          <dl className="desglose">
            <div><dt>Días que faltan del período</dt><dd>{cambio.diasRestantes} de {cambio.diasPeriodo}</dd></div>
            <div><dt>Diferencia prorrateada</dt><dd>{monto2(cambio.diferenciaSinIgv, cambio.moneda)}</dd></div>
            <div><dt>IGV (18 %)</dt><dd>{monto2(cambio.igv, cambio.moneda)}</dd></div>
            <div className="total"><dt>Total a pagar hoy</dt><dd>{monto2(cambio.total, cambio.moneda)}</dd></div>
          </dl>
          <p className="sec">Desde la renovación pagas {monto2(cambio.precioNuevoSinIgv, cambio.moneda)} {porCiclo(cambio.ciclo)} sin IGV.</p>
        </>
      ) : (
        <p>
          Desde el {fechaLarga(cambio.rigeDesde)} pasas a {cambio.planDestino.nombre} ({cuotaDe(cambio.planDestino.capsulasMes)}, {monto2(cambio.precioNuevoSinIgv, cambio.moneda)} {porCiclo(cambio.ciclo)} sin IGV).
          Hasta entonces sigues con {cambio.planOrigen.nombre}. No se cobra nada ahora ni se devuelve la diferencia.
        </p>
      )}
      <div className="acciones-form">
        <button className="boton primario" type="button" disabled={ocupado} onClick={alConfirmar}>
          {subida ? `Confirmar y pagar ${monto2(cambio.total, cambio.moneda)}` : 'Confirmar el cambio'}
        </button>
        <button className="boton" type="button" disabled={ocupado} onClick={alVolver}>Volver</button>
      </div>
    </section>
  );
}

/** El pago de la diferencia con la pasarela de pruebas. */
function PagoPrueba({ total, etiqueta, ocupado, error, alPagar, alVolver }: { total: string; etiqueta: string; ocupado: boolean; error: string; alPagar: (tarjeta: string) => void; alVolver: () => void }) {
  const id = useId();
  const [tarjeta, setTarjeta] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);
  return (
    <form className="tarjeta compra-pago" aria-label={etiqueta} onSubmit={(e) => { e.preventDefault(); alPagar(tarjeta); }}>
      <label className="campo" htmlFor={`${id}-tarjeta`}>
        Tarjeta de prueba
        <input ref={campo} id={`${id}-tarjeta`} inputMode="numeric" autoComplete="off" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} aria-describedby={`${id}-ayuda`} aria-invalid={error ? true : undefined} />
      </label>
      <p id={`${id}-ayuda`} className="sec">Pasarela de pruebas, no cobra: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza.</p>
      <div className="acciones-form">
        <button className="boton primario" type="submit" disabled={ocupado}>Pagar {total}</button>
        <button className="boton" type="button" disabled={ocupado} onClick={alVolver}>Volver</button>
      </div>
    </form>
  );
}

export function PlanSuscripcion() {
  // La vuelta de la página alojada (`?cambio=` y, si se canceló, `&cancelado=1`) se lee una sola vez, al montar.
  const [vuelta] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return { cambio: q.get('cambio'), renovacion: q.get('renovacion'), cancelado: Boolean(q.get('cancelado')) };
  });
  const [s, setS] = useState<SuscripcionOrg | null>(null);
  const [cuota, setCuota] = useState<CuotaCapsulas | null>(null);
  const [sinSuscripcion, setSinSuscripcion] = useState(false);
  const [resumen, setResumen] = useState<CambioPlan | null>(null);
  const [pagando, setPagando] = useState<CambioPlan | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(() => vuelta.renovacion && !vuelta.cambio
    ? (vuelta.cancelado ? 'Cancelaste el pago: la renovación sigue pendiente.' : '')
    : !vuelta.cambio ? '' : vuelta.cancelado ? 'Cancelaste el pago: tu plan no cambió.' : 'Confirmando el pago del cambio de plan…');
  // HU-1708 · «Pagar ahora» la renovación con la pasarela de pruebas.
  const [pagandoRenovacion, setPagandoRenovacion] = useState(false);
  const [error, setError] = useState('');
  const vivo = useRef(true);

  const recargar = useCallback(() => Promise.all([api.suscripcion(), api.cuota()]).then(([sus, c]) => {
    if (!vivo.current) return;
    setS(sus);
    setCuota(c);
  }, (e: unknown) => {
    if (e instanceof ErrorApi && e.codigo === 'SIN_SUSCRIPCION') setSinSuscripcion(true);
    else setError(mensajeDe(e, 'No se pudo cargar tu suscripción'));
  }), []);

  const terminar = useCallback((c: CambioPlan) => {
    setPagando(null);
    setResumen(null);
    if (c.estado === 'APROBADO') { setError(''); setAviso(listo(c)); }
    else if (c.estado === 'RECHAZADO') { setAviso(''); setError(c.motivoRechazo ?? 'La pasarela rechazó el pago'); }
    setS(c.suscripcion);
    api.cuota().then((x) => vivo.current && setCuota(x), () => undefined);
  }, []);

  const esperar = useCallback(async (id: string) => {
    for (let i = 0; i < CONSULTAS && vivo.current; i++) {
      const c = await api.cambioPlan(id);
      if (c.estado !== 'PENDIENTE') return terminar(c);
      await new Promise((r) => setTimeout(r, CONSULTA_MS));
    }
    if (vivo.current) setAviso('El pago sigue en revisión: tu plan cambia solo cuando la pasarela lo confirme.');
  }, [terminar]);

  /** HU-1708 · Terminó el pago de la renovación: aprobado, la cuenta vuelve a la normalidad; rechazado, el motivo. */
  const terminarRenovacion = useCallback((r: PagoRenovacion) => {
    setPagandoRenovacion(false);
    setS(r.suscripcion);
    if (r.renovacion.estado === 'APROBADA') {
      setError('');
      setAviso(`Listo: pagaste la renovación de ${monto2(r.renovacion.total, r.renovacion.moneda)}. Tu plan sigue activo hasta el ${fechaLarga(r.suscripcion.finPeriodo)}.`);
      avisarCobranza();
    } else if (r.renovacion.motivoRechazo) { setAviso(''); setError(r.renovacion.motivoRechazo); }
  }, []);

  /** Tras la página alojada o el formulario de Culqi: espera a que el webhook confirme la renovación. */
  const esperarRenovacion = useCallback(async () => {
    setAviso('Confirmando el pago de la renovación…');
    for (let i = 0; i < CONSULTAS && vivo.current; i++) {
      const sus = await api.suscripcion();
      if (sus.estado === 'ACTIVA' || sus.estado === 'CANCELADA') {
        setS(sus);
        setAviso(`Listo: pagaste la renovación. Tu plan sigue activo hasta el ${fechaLarga(sus.finPeriodo)}.`);
        avisarCobranza();
        return;
      }
      await new Promise((r) => setTimeout(r, CONSULTA_MS));
    }
    if (vivo.current) setAviso('El pago sigue en revisión: la cuenta se reactiva sola cuando la pasarela lo confirme.');
  }, []);

  useEffect(() => {
    vivo.current = true;
    void recargar();
    if (vuelta.renovacion && !vuelta.cambio) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (!vuelta.cancelado) Promise.resolve().then(esperarRenovacion).catch(() => setAviso(''));
    }
    if (vuelta.cambio) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      // La consulta empieza tras el montaje: los estados cambian solo cuando responde la API.
      if (!vuelta.cancelado) Promise.resolve(vuelta.cambio).then(esperar).catch(() => setAviso(''));
    }
    return () => { vivo.current = false; };
  }, [recargar, esperar, esperarRenovacion, vuelta]);

  async function ver(p: PlanOpcion) {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      setResumen(await api.cambiarDePlan(p.slug, false));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo calcular el cambio'));
    } finally {
      setOcupado(false);
    }
  }

  async function seguirPago(c: CambioPlan, pago: PagoCompra) {
    if (pago.tipo === 'simulado') return setPagando(c);
    if (pago.tipo === 'redireccion') return window.location.assign(pago.url);
    const C = await cargarCulqi();
    if (!C) return setError('No se pudo abrir la ventana de pago: intenta de nuevo en unos minutos');
    C.publicKey = pago.llavePublica;
    C.settings({ title: 'Aptio SCORM', currency: pago.moneda, amount: pago.montoCentimos, description: pago.descripcion });
    Object.assign(window, { culqi: () => {
      if (C.token?.id) {
        const token = C.token.id;
        C.close?.();
        setOcupado(true);
        api.tokenCambio(c.id!, token).then(() => esperar(c.id!), (e: unknown) => setError(mensajeDe(e, 'La pasarela no pudo procesar el pago'))).finally(() => setOcupado(false));
      } else if (C.error) setError(C.error.user_message ?? 'La pasarela no pudo procesar el pago');
    } });
    C.open();
  }

  async function confirmar() {
    if (!resumen) return;
    setOcupado(true);
    setError('');
    try {
      const c = await api.cambiarDePlan(resumen.planDestino.slug, true);
      if (c.estado === 'PROGRAMADO') {
        setResumen(null);
        setS(c.suscripcion);
        setAviso(`Listo: desde el ${fechaLarga(c.rigeDesde)} pasas a ${c.planDestino.nombre}.`);
      } else if (c.pago) {
        setResumen(null);
        await seguirPago(c, c.pago);
      }
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo cambiar de plan'));
    } finally {
      setOcupado(false);
    }
  }

  async function pagarPrueba(tarjeta: string) {
    if (!pagando?.id) return;
    if (!tarjeta.replace(/\D/g, '')) return setError('Escribe la tarjeta de prueba');
    setOcupado(true);
    setError('');
    try {
      terminar(await api.pagarPruebaCambio(pagando.id, tarjeta));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pagar'));
    } finally {
      setOcupado(false);
    }
  }

  async function pagarAhora() {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await api.pagarRenovacion();
      const pago = r.pago;
      if (!pago || pago.tipo === 'simulado') setPagandoRenovacion(true);
      else if (pago.tipo === 'redireccion') window.location.assign(pago.url);
      else {
        const C = await cargarCulqi();
        if (!C) return setError('No se pudo abrir la ventana de pago: intenta de nuevo en unos minutos');
        C.publicKey = pago.llavePublica;
        C.settings({ title: 'Aptio SCORM', currency: pago.moneda, amount: pago.montoCentimos, description: pago.descripcion });
        Object.assign(window, { culqi: () => {
          if (C.token?.id) {
            const token = C.token.id;
            C.close?.();
            setOcupado(true);
            api.tokenRenovacion(token).then(() => esperarRenovacion(), (e: unknown) => setError(mensajeDe(e, 'La pasarela no pudo procesar el pago'))).finally(() => setOcupado(false));
          } else if (C.error) setError(C.error.user_message ?? 'La pasarela no pudo procesar el pago');
        } });
        C.open();
      }
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo iniciar el pago'));
    } finally {
      setOcupado(false);
    }
  }

  async function pagarPruebaRenovacion(tarjeta: string) {
    if (!tarjeta.replace(/\D/g, '')) return setError('Escribe la tarjeta de prueba');
    setOcupado(true);
    setError('');
    try {
      terminarRenovacion(await api.pagarPruebaRenovacion(tarjeta));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pagar'));
    } finally {
      setOcupado(false);
    }
  }

  async function accion(hacer: () => Promise<SuscripcionOrg>, mensaje: (x: SuscripcionOrg) => string) {
    setOcupado(true);
    setError('');
    try {
      const x = await hacer();
      setS(x);
      setConfirmarCancelar(false);
      setAviso(mensaje(x));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar el cambio'));
    } finally {
      setOcupado(false);
    }
  }

  const cancelada = s?.estado === 'CANCELADA';
  return (
    <>
      <Cabecera titulo="Plan y suscripción" subtitulo="Tu plan, la cuota de cápsulas, el cambio de plan y la cancelación." />
      {aviso ? <div className="nota" role="status">{aviso}</div> : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {sinSuscripcion ? (
        <p className="nota">Tu organización no tiene una suscripción: no tiene límite de cápsulas.</p>
      ) : !s ? (!error ? <p className="sec" role="status">Cargando tu suscripción…</p> : null) : (
        <div className="plan-suscripcion">
          <section className="tarjeta" aria-labelledby="plan-actual">
            <h2 id="plan-actual">Tu plan: {s.plan.nombre}</h2>
            <p>{cuotaDe(s.plan.capsulasMes)} · {monto2(s.precioPactadoSinIgv, s.moneda)} {porCiclo(s.ciclo)} sin IGV ({s.ciclo === 'ANUAL' ? 'pago anual' : 'pago mensual'})</p>
            {s.descuento ? <p className="nota validado">Cupón {s.descuento.codigo}: −{s.descuento.porcentaje} % {s.descuento.ciclosRestantes === null ? 'en cada renovación' : s.descuento.ciclosRestantes === 1 ? 'en la próxima renovación' : `en las próximas ${s.descuento.ciclosRestantes} renovaciones`}.</p> : null}
            <p className="sec">
              {cancelada ? `Tu suscripción terminó el ${fechaLarga(s.canceladaEn ?? s.finPeriodo)}.`
                : s.renovacion ? `El período terminó el ${fechaLarga(s.finPeriodo)}: falta pagar la renovación.`
                : s.cancelarAlFin ? `Tu suscripción termina el ${fechaLarga(s.finPeriodo)}.`
                  : `Se renueva el ${fechaLarga(s.finPeriodo)}.`}
            </p>
            {!cancelada && (s.cancelarAlFin || s.planProgramado) ? (
              <div className="nota aviso">
                <p>
                  {s.cancelarAlFin
                    ? `Pediste cancelar: hasta el ${fechaLarga(s.finPeriodo)} sigues con ${s.plan.nombre}; después no podrás generar cápsulas nuevas.`
                    : `El ${fechaLarga(s.finPeriodo)} pasas a ${s.planProgramado!.nombre} (${cuotaDe(s.planProgramado!.capsulasMes)}).`}
                </p>
                <button className="boton" type="button" disabled={ocupado} onClick={() => void accion(api.reanudarSuscripcion, (x) => `Listo: sigues con ${x.plan.nombre}.`)}>Seguir con mi plan</button>
              </div>
            ) : null}
          </section>
          {s.renovacion ? (
            <section className="tarjeta renovacion-pago" aria-labelledby="renovacion-pago">
              <h2 id="renovacion-pago">{s.estado === 'SUSPENDIDA' ? 'Reactiva tu cuenta' : 'Paga la renovación'}</h2>
              <p>
                {s.estado === 'SUSPENDIDA'
                  ? `Tu cuenta está en solo lectura desde el ${fechaLarga(s.renovacion.suspensionEn)}. Al pagar, vuelve a la normalidad y el período nuevo empieza ese día.`
                  : `Tu período terminó el ${fechaLarga(s.renovacion.periodoInicio)}. Si no pagas antes del ${fechaLarga(s.renovacion.suspensionEn)}, la cuenta queda en solo lectura.`}
              </p>
              <dl className="desglose">
                <div><dt>Plan {s.renovacion.plan.nombre} ({s.ciclo === 'ANUAL' ? 'anual' : 'mensual'})</dt><dd>{monto2(s.renovacion.montoSinIgv, s.renovacion.moneda)}</dd></div>
                <div><dt>IGV (18 %)</dt><dd>{monto2(s.renovacion.igv, s.renovacion.moneda)}</dd></div>
                <div className="total"><dt>Total a pagar</dt><dd>{monto2(s.renovacion.total, s.renovacion.moneda)}</dd></div>
              </dl>
              {s.renovacion.motivoRechazo ? <p className="sec">Último intento rechazado: {s.renovacion.motivoRechazo}.</p> : null}
              {pagandoRenovacion ? (
                <PagoPrueba total={monto2(s.renovacion.total, s.renovacion.moneda)} etiqueta="Pago de la renovación" ocupado={ocupado} error={error} alPagar={(t) => void pagarPruebaRenovacion(t)} alVolver={() => setPagandoRenovacion(false)} />
              ) : (
                <div className="acciones-form">
                  <button className="boton primario" type="button" disabled={ocupado || !s.pagoDisponible} onClick={() => void pagarAhora()}>Pagar ahora {monto2(s.renovacion.total, s.renovacion.moneda)}</button>
                </div>
              )}
              {!s.pagoDisponible ? <p className="sec">El pago en línea no está disponible ahora: escríbenos para regularizar tu cuenta.</p> : null}
            </section>
          ) : null}
          {cuota ? <IndicadorCuota cuota={cuota} /> : null}

          {pagando ? (
            <PagoPrueba total={monto2(pagando.total, pagando.moneda)} etiqueta="Pago del cambio de plan" ocupado={ocupado} error={error} alPagar={(t) => void pagarPrueba(t)} alVolver={() => setPagando(null)} />
          ) : resumen ? (
            <ResumenCambio cambio={resumen} ocupado={ocupado} alConfirmar={() => void confirmar()} alVolver={() => setResumen(null)} />
          ) : !cancelada && !s.renovacion ? (
            <section className="tarjeta" aria-labelledby="cambiar-plan">
              <h2 id="cambiar-plan">Cambiar de plan</h2>
              <p className="sec">Subir de plan rige hoy y pagas solo la diferencia por los días que faltan. Bajar de plan rige al renovar, sin cobro ni devolución.</p>
              <ul className="planes-opciones">
                {s.planes.map((p) => (
                  <li key={p.slug} className={p.actual ? 'actual' : undefined}>
                    <b>{p.nombre}</b>
                    <span>{cuotaDe(p.capsulasMes)}</span>
                    <span className="sec">{p.precioCiclo === null ? 'Precio a medida' : `${monto2(p.precioCiclo, s.moneda)} ${porCiclo(s.ciclo)} sin IGV`}</span>
                    {p.actual ? <span className="etiqueta">Tu plan</span>
                      : p.tipo ? (
                        <button className="boton" type="button" disabled={ocupado || (p.tipo === 'SUBIDA' && !s.pagoDisponible)} onClick={() => void ver(p)}>Cambiar a {p.nombre}</button>
                      ) : <span className="sec">Con una demo</span>}
                  </li>
                ))}
              </ul>
              {!s.pagoDisponible ? <p className="sec">El pago en línea no está disponible ahora: para subir de plan, escríbenos.</p> : null}
            </section>
          ) : null}

          {!cancelada && !s.cancelarAlFin && !pagando && !resumen && !pagandoRenovacion ? (
            <section className="tarjeta" aria-labelledby="cancelar-suscripcion">
              <h2 id="cancelar-suscripcion">Cancelar la suscripción</h2>
              {confirmarCancelar ? (
                <div role="group" aria-label="Confirmar la cancelación">
                  <p>¿Cancelar la suscripción? Sigues con tu plan hasta el {fechaLarga(s.finPeriodo)}; después no podrás generar cápsulas nuevas. No se devuelve lo pagado.</p>
                  <div className="acciones-form">
                    <button className="boton peligro" type="button" disabled={ocupado} onClick={() => void accion(api.cancelarSuscripcion, (x) => `Listo: tu suscripción termina el ${fechaLarga(x.finPeriodo)}.`)}>Sí, cancelar al fin del período</button>
                    <button className="boton" type="button" disabled={ocupado} onClick={() => setConfirmarCancelar(false)}>No, seguir</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="sec">La cancelación rige al fin del período pagado. Lo exportado se puede descargar siempre.</p>
                  <button className="boton" type="button" onClick={() => setConfirmarCancelar(true)}>Cancelar al fin del período</button>
                </>
              )}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
