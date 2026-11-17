// HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6): el indicador «Cápsulas del mes: 17 de 20» en Proyectos, el
// aviso de cuota agotada al generar y la compra de adicionales (solo el administrador) con la pasarela de la suscripción:
// el formulario simulado en pruebas, la página alojada de Stripe (vuelve a /?compra=) o Culqi Checkout.
// La tarjeta nunca pasa por Aptio SCORM.
import { LIMITES_ADICIONALES, precioAdicionales } from '@aptio/schema/cuotas';
import { monto2 } from '@aptio/schema/suscripciones';
import { useEffect, useId, useRef, useState } from 'react';
import { api, type CompraCapsulas, type CuotaCapsulas, ErrorApi, type PagoCompra } from '../api';

const SCRIPT_CULQI = 'https://checkout.culqi.com/js/v4';
const CONSULTA_MS = 1500;
const CONSULTAS = 20;

interface CulqiCheckout {
  publicKey: string;
  settings: (o: Record<string, unknown>) => void;
  open: () => void;
  close?: () => void;
  token?: { id: string };
  error?: { user_message?: string };
}
declare global {
  interface Window { Culqi?: CulqiCheckout; culqi?: () => void }
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });
const capsulas = (n: number, adicional = false) => `${n} ${n === 1 ? `cápsula${adicional ? ' adicional' : ''}` : `cápsulas${adicional ? ' adicionales' : ''}`}`;
/** «Listo: se sumó 1 cápsula adicional» o «se sumaron 3 cápsulas adicionales». */
const listo = (n: number) => `Listo: ${n === 1 ? 'se sumó' : 'se sumaron'} ${capsulas(n, true)}. Ya puedes generar.`;
const totalDe = (c: CuotaCapsulas) => (c.incluidas ?? 0) + c.adicionales;
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

function cargarCulqi(): Promise<CulqiCheckout | null> {
  if (window.Culqi) return Promise.resolve(window.Culqi);
  return new Promise((resolver) => {
    const s = document.createElement('script');
    s.src = SCRIPT_CULQI;
    s.async = true;
    s.onload = () => resolver(window.Culqi ?? null);
    s.onerror = () => resolver(null);
    document.head.appendChild(s);
  });
}

/** «Cápsulas del mes: 17 de 20», con la barra y cuándo se renueva. */
export function IndicadorCuota({ cuota }: { cuota: CuotaCapsulas }) {
  if (cuota.ilimitada) {
    return (
      <section className="tarjeta cuota-capsulas" aria-label="Cuota de cápsulas">
        <p><b>Cápsulas del mes: {cuota.usadas}</b> · sin límite</p>
      </section>
    );
  }
  const total = totalDe(cuota);
  const pct = total ? Math.min(100, Math.round((cuota.usadas / total) * 100)) : 100;
  return (
    <section className="tarjeta cuota-capsulas" aria-label="Cuota de cápsulas">
      <p>
        <b>Cápsulas del mes: {cuota.usadas} de {total}</b>
        {cuota.adicionales ? <span className="sec"> · incluye {capsulas(cuota.adicionales, true)}</span> : null}
      </p>
      <span className={`barra${cuota.disponibles === 0 ? ' llena' : ''}`} role="progressbar" aria-label="Cápsulas usadas este mes" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(cuota.usadas, total)} aria-valuetext={`${cuota.usadas} de ${total}`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <p className="sec">
        {cuota.disponibles === 0 ? 'No quedan cápsulas nuevas este mes. ' : `Quedan ${capsulas(cuota.disponibles ?? 0)}. `}
        Se renueva el {fecha(cuota.ventanaFin)}. Volver a generar una cápsula en revisión no consume otra.
      </p>
    </section>
  );
}

/**
 * Comprar de 1 a 10 cápsulas adicionales (solo el administrador). Se acreditan cuando la pasarela confirma el pago; al
 * acreditarse, `alAcreditar` recibe la cuota nueva.
 */
export function CompraAdicionales({ cuota, alAcreditar }: { cuota: CuotaCapsulas; alAcreditar: (c: CuotaCapsulas, mensaje: string) => void }) {
  const id = useId();
  const [cantidad, setCantidad] = useState(1);
  const [compra, setCompra] = useState<CompraCapsulas | null>(null);
  const [tarjeta, setTarjeta] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const oferta = cuota.oferta!;
  const precio = precioAdicionales(oferta.unitario, cantidad, oferta.moneda);

  useEffect(() => {
    if (compra) campo.current?.focus();
  }, [compra]);

  function terminar(c: CompraCapsulas) {
    setCompra(null);
    setTarjeta('');
    if (c.estado === 'APROBADA') alAcreditar(c.cuota, listo(c.cantidad));
    else if (c.estado === 'RECHAZADA') setError(c.motivoRechazo ?? 'La pasarela rechazó el pago');
  }

  async function seguir(c: CompraCapsulas, pago: PagoCompra) {
    if (pago.tipo === 'simulado') return setCompra(c);
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
        api.tokenCompra(c.id, token).then(() => esperar(c.id), (e: unknown) => setError(mensajeDe(e, 'La pasarela no pudo procesar el pago'))).finally(() => setOcupado(false));
      } else if (C.error) setError(C.error.user_message ?? 'La pasarela no pudo procesar el pago');
    } });
    C.open();
  }

  async function esperar(compraId: string) {
    for (let i = 0; i < CONSULTAS; i++) {
      const c = await api.compraCapsulas(compraId);
      if (c.estado !== 'PENDIENTE') return terminar(c);
      await new Promise((r) => setTimeout(r, CONSULTA_MS));
    }
    setError('El pago sigue en revisión: la cuota se actualiza sola cuando la pasarela lo confirme.');
  }

  async function comprar() {
    setOcupado(true);
    setError('');
    try {
      const c = await api.comprarCapsulas(cantidad);
      if (c.pago) await seguir(c, c.pago);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo iniciar la compra'));
    } finally {
      setOcupado(false);
    }
  }

  async function pagar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!compra) return;
    if (!tarjeta.replace(/\D/g, '')) {
      setError('Escribe la tarjeta de prueba');
      campo.current?.focus();
      return;
    }
    setOcupado(true);
    setError('');
    try {
      terminar(await api.pagarPruebaCompra(compra.id, tarjeta));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pagar'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="compra-adicionales">
      {compra ? (
        <form className="compra-pago" onSubmit={(e) => void pagar(e)} aria-label="Pago de cápsulas adicionales">
          <label className="campo" htmlFor={`${id}-tarjeta`}>
            Tarjeta de prueba
            <input ref={campo} id={`${id}-tarjeta`} inputMode="numeric" autoComplete="off" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} aria-describedby={`${id}-ayuda`} aria-invalid={error ? true : undefined} />
          </label>
          <p id={`${id}-ayuda`} className="sec">Pasarela de pruebas, no cobra: 4111 1111 1111 1111 aprueba y 4000 0000 0000 0002 rechaza.</p>
          <div className="acciones-form">
            <button className="boton primario" type="submit" disabled={ocupado}>Pagar {monto2(compra.total, compra.moneda)}</button>
            <button className="boton" type="button" disabled={ocupado} onClick={() => setCompra(null)}>Volver</button>
          </div>
        </form>
      ) : (
        <div className="compra-elegir">
          <label className="campo" htmlFor={`${id}-cantidad`}>
            Cantidad
            <select id={`${id}-cantidad`} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}>
              {Array.from({ length: LIMITES_ADICIONALES.max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="boton primario" type="button" disabled={ocupado} onClick={() => void comprar()}>
            Comprar {capsulas(cantidad, true)} ({monto2(precio.total, precio.moneda)})
          </button>
          <a className="boton" href={cuota.planes}>Ver planes</a>
        </div>
      )}
      {!compra ? <p className="sec">IGV de 18 % incluido. Valen hasta el {fecha(cuota.ventanaFin)}; no se acumulan.</p> : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
    </div>
  );
}

/** El aviso de cuota agotada (402 CUOTA_AGOTADA): el administrador compra o sube de plan; los demás se lo piden. */
export function AvisoCuotaAgotada({ cuota, alAcreditar }: { cuota: CuotaCapsulas; alAcreditar: (c: CuotaCapsulas, mensaje: string) => void }) {
  return (
    <div className="nota aviso cuota-agotada" role="alert">
      <p>
        <b>Se agotaron las cápsulas de este mes</b> ({cuota.usadas} de {totalDe(cuota)}).{' '}
        {cuota.puedeComprar
          ? 'Compra una cápsula adicional o sube de plan para generar esta.'
          : 'Pide al administrador de tu organización que compre una cápsula adicional o suba de plan.'}{' '}
        Las cápsulas en revisión siguen editables.
      </p>
      {cuota.puedeComprar ? <CompraAdicionales cuota={cuota} alAcreditar={alAcreditar} /> : null}
    </div>
  );
}

/**
 * La cuota en Proyectos. Al volver de la página alojada de la pasarela (`?compra=` y, si se canceló, `&cancelado=1`),
 * consulta la compra hasta que se resuelva y muestra el resultado.
 */
export function CuotaProyectos() {
  // La vuelta de la pasarela se lee una sola vez, al montar: el aviso inicial sale de ahí, sin otro render.
  const [vuelta] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return { compra: q.get('compra'), cancelado: Boolean(q.get('cancelado')) };
  });
  const [cuota, setCuota] = useState<CuotaCapsulas | null>(null);
  const [aviso, setAviso] = useState(() => !vuelta.compra ? '' : vuelta.cancelado
    ? 'Cancelaste el pago de las cápsulas adicionales. Puedes intentarlo de nuevo cuando quieras.'
    : 'Confirmando el pago de las cápsulas adicionales…');
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api.cuota().then((c) => vivo && setCuota(c), () => undefined);
    const { compra, cancelado } = vuelta;
    if (compra) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (!cancelado) {
        void (async () => {
          for (let i = 0; i < CONSULTAS && vivo; i++) {
            try {
              const c = await api.compraCapsulas(compra);
              if (c.estado === 'APROBADA') { setCuota(c.cuota); setAviso(listo(c.cantidad)); return; }
              if (c.estado === 'RECHAZADA') { setAviso(''); setError(c.motivoRechazo ?? 'La pasarela rechazó el pago'); return; }
            } catch {
              setAviso('');
              return;
            }
            await new Promise((r) => setTimeout(r, CONSULTA_MS));
          }
          if (vivo) setAviso('El pago sigue en revisión: la cuota se actualiza sola cuando la pasarela lo confirme.');
        })();
      }
    }
    return () => { vivo = false; };
  }, [vuelta]);

  if (!cuota) return null;
  return (
    <>
      <IndicadorCuota cuota={cuota} />
      {aviso ? <div className="nota" role="status">{aviso}</div> : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {cuota.disponibles === 0 && cuota.puedeComprar ? (
        <section className="tarjeta" aria-label="Cápsulas adicionales">
          <h2>Cápsulas adicionales</h2>
          <CompraAdicionales cuota={cuota} alAcreditar={(c, m) => { setCuota(c); setError(''); setAviso(m); }} />
        </section>
      ) : null}
    </>
  );
}
