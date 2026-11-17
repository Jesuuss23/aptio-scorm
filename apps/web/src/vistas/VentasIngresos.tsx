// HU-1710 · Panel de ingresos de Ventas › Planes (REQ-090, CP-152, PNT-35): la fila de 4 indicadores del prototipo
// (ingreso mensual recurrente con los dólares aparte y el ingreso en riesgo, suscripciones activas, cancelación mensual
// con su variación frente al mes anterior e ingreso promedio por cliente) y el selector de mes con «Mes anterior» y
// «Mes siguiente». Montos sin IGV; soles y dólares por separado, sin tipo de cambio (SUP-329). Solo el superadmin.
import { mesAnterior, mesLima, mesSiguiente } from '@aptio/schema/ingresos';
import { dolares, soles } from '@aptio/schema/planes';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type IngresoMoneda, type PanelIngresos } from '../api';

const nombreMes = (mes: string) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-15T12:00:00Z`));
const PORC = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const monto = (m: IngresoMoneda | undefined, campo: 'mrr' | 'arpu' | 'enRiesgo') => (!m ? '—' : m.moneda === 'USD' ? dolares(m[campo]) : soles(m[campo]));

/** «0.6 puntos menos que octubre de 2026»: en la cancelación, bajar es bueno. */
function VariacionCancelacion({ puntos, anterior }: { puntos: number; anterior: string }) {
  if (puntos === 0) return <span className="res-var">Igual que {nombreMes(anterior)}</span>;
  const menos = puntos < 0;
  return (
    <span className={`res-var ${menos ? 'sube' : 'baja'}`}>
      <span aria-hidden="true">{menos ? '▼' : '▲'} </span>{PORC.format(Math.abs(puntos))} {Math.abs(puntos) === 1 ? 'punto' : 'puntos'} {menos ? 'menos' : 'más'} que {nombreMes(anterior)}
    </span>
  );
}

export function IndicadoresIngresos() {
  const [hoy] = useState(() => mesLima(new Date()));
  const [mes, setMes] = useState(hoy);
  const [panel, setPanel] = useState<PanelIngresos | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    api.ingresos(mes).then((p) => { if (vigente) { setPanel(p); setError(''); } }, (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los ingresos'); });
    return () => { vigente = false; };
  }, [mes]);

  const actual = panel?.actual.mes === mes ? panel : null;
  const pen = actual?.actual.monedas.find((m) => m.moneda === 'PEN');
  const usd = actual?.actual.monedas.find((m) => m.moneda === 'USD');
  const conUsd = Boolean(usd && usd.activas > 0);

  return (
    <section className="tarjeta ingresos" aria-labelledby="ingresos-titulo">
      <div className="res-titulo">
        <h2 id="ingresos-titulo">Ingresos de {nombreMes(mes)}</h2>
        <div className="ingresos-mes" role="group" aria-label="Mes de los ingresos">
          <button type="button" className="boton" aria-label={`Mes anterior: ${nombreMes(mesAnterior(mes))}`} onClick={() => setMes(mesAnterior(mes))}>
            <span aria-hidden="true">← </span>Mes anterior
          </button>
          <button type="button" className="boton" aria-label={`Mes siguiente: ${nombreMes(mesSiguiente(mes))}`} disabled={mes >= hoy} onClick={() => setMes(mesSiguiente(mes))}>
            Mes siguiente<span aria-hidden="true"> →</span>
          </button>
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      <p className="sr" role="status" aria-live="polite">{actual ? `Ingresos de ${nombreMes(mes)}: ${monto(pen, 'mrr')} al mes${conUsd ? ` y ${monto(usd, 'mrr')}` : ''}.` : !error ? `Cargando los ingresos de ${nombreMes(mes)}…` : ''}</p>
      <dl className="res-indicadores" aria-label={`Indicadores de ${nombreMes(mes)}`} aria-busy={!actual && !error}>
        <div>
          <dt>Ingreso mensual recurrente</dt>
          <dd className="res-dato num">{actual ? monto(pen, 'mrr') : '—'}</dd>
          {actual && conUsd ? <dd className="num">y {monto(usd, 'mrr')} en dólares</dd> : null}
          <dd className="res-var">Sin IGV · activas y con pago pendiente</dd>
          {actual && (pen!.enRiesgo > 0 || (usd?.enRiesgo ?? 0) > 0) ? (
            <dd className="res-var baja">En riesgo: {[pen!.enRiesgo > 0 ? monto(pen, 'enRiesgo') : null, usd && usd.enRiesgo > 0 ? monto(usd, 'enRiesgo') : null].filter(Boolean).join(' y ')} de las que cancelan al fin del período</dd>
          ) : null}
        </div>
        <div>
          <dt>Suscripciones activas</dt>
          <dd className="res-dato num">{actual ? actual.actual.activas : '—'}</dd>
          <dd className="res-var">{actual && conUsd ? `${pen!.activas} en soles y ${usd!.activas} en dólares · ` : ''}incluye las de pago pendiente</dd>
        </div>
        <div>
          <dt>Cancelación mensual</dt>
          <dd className="res-dato num">{actual ? `${PORC.format(actual.actual.tasaCancelacion)} %` : '—'}</dd>
          <dd>{actual ? <VariacionCancelacion puntos={actual.variacionCancelacion} anterior={actual.anterior.mes} /> : null}</dd>
          <dd className="res-var">{actual ? `${actual.actual.canceladas} de ${actual.actual.vigentesAlInicio} vigentes al empezar el mes` : ''}</dd>
        </div>
        <div>
          <dt>Ingreso promedio por cliente</dt>
          <dd className="res-dato num">{actual ? monto(pen, 'arpu') : '—'}</dd>
          {actual && conUsd ? <dd className="num">y {monto(usd, 'arpu')} en dólares</dd> : null}
          <dd className="res-var">Al mes, sin IGV</dd>
        </div>
      </dl>
    </section>
  );
}
