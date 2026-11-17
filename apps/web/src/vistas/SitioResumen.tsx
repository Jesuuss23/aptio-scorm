// HU-1501 · Sitio web › Resumen (PNT-24, M16). Solo el superadmin de plataforma (ADR-011).
// HU-1607 · Rendimiento del sitio comercial (REQ-080, CP-138): 4 indicadores contra el período anterior (7 días, 30 días
// o trimestre, en hora de Lima), el gráfico de visitas y conversiones con su tabla, el origen de los leads (suma 100 %),
// las páginas con más conversiones y las próximas demos. Las cifras salen de las tablas de leads y citas y del contador
// anónimo de visitas; las suscripciones llegan en el S13. Sigue la tarjeta de páginas por estado (HU-1502).
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type IndicadorResumen, type PaginaSitio, type PeriodoResumen, type ResumenSitio } from '../api';
import { navegar } from '../ruta';

const PERIODOS: { id: PeriodoResumen; nombre: string }[] = [{ id: '7d', nombre: '7 días' }, { id: '30d', nombre: '30 días' }, { id: '90d', nombre: 'Trimestre' }];
const NUM = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });
const DEC = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 1 });
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.'];
/** `2026-11-16` → «16 nov.» (con el año si se pide). */
const dia = (f: string, anio = false) => { const [a, m, d] = f.split('-').map(Number) as [number, number, number]; return `${d} ${MESES[m - 1]}${anio ? ` ${a}` : ''}`; };

function enlace(ruta: string, texto: string) {
  return <a className="boton chico" href={ruta} onClick={(e) => { e.preventDefault(); navegar(ruta); }}>{texto}</a>;
}

function Variacion({ i }: { i: IndicadorResumen }) {
  if (i.variacion === null) return <span className="res-var">Sin datos del período anterior</span>;
  const signo = i.variacion > 0 ? '+' : i.variacion < 0 ? '−' : '';
  const clase = i.variacion > 0 ? 'sube' : i.variacion < 0 ? 'baja' : '';
  return <span className={`res-var ${clase}`}>{signo}{DEC.format(Math.abs(i.variacion))} % frente al período anterior ({NUM.format(i.anterior)})</span>;
}

function Indicadores({ r }: { r: ResumenSitio }) {
  const filas: [string, IndicadorResumen | null][] = [['Visitas', r.indicadores.visitas], ['Leads', r.indicadores.leads], ['Demos agendadas', r.indicadores.demos], ['Suscripciones nuevas', r.indicadores.suscripciones]];
  return (
    <dl className="res-indicadores" aria-label="Indicadores del período">
      {filas.map(([nombre, i]) => (
        <div key={nombre}>
          <dt>{nombre}</dt>
          <dd className="res-dato num">{i ? NUM.format(i.actual) : '—'}</dd>
          <dd>{i ? <Variacion i={i} /> : <span className="res-var">Llega con las suscripciones (S13)</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** El gráfico en SVG: visitas (eje izquierdo) y leads y demos (eje derecho), con su resumen para lectores y la tabla. */
function Grafico({ r }: { r: ResumenSitio }) {
  const s = r.serie;
  const ancho = 640, alto = 200, mx = 36, my = 16;
  const maxV = Math.max(1, ...s.map((d) => d.visitas));
  const maxC = Math.max(1, ...s.map((d) => Math.max(d.leads, d.demos)));
  const x = (i: number) => mx + (s.length <= 1 ? 0 : (i * (ancho - 2 * mx)) / (s.length - 1));
  const y = (v: number, max: number) => alto - my - (v / max) * (alto - 2 * my);
  const linea = (k: 'visitas' | 'leads' | 'demos', max: number) => s.map((d, i) => `${x(i).toFixed(1)},${y(d[k], max).toFixed(1)}`).join(' ');
  const total = (k: 'visitas' | 'leads' | 'demos') => s.reduce((t, d) => t + d[k], 0);
  const pico = s.reduce((m, d) => (d.visitas > m.visitas ? d : m), s[0] ?? { dia: r.hasta, visitas: 0, leads: 0, demos: 0 });
  const resumen = `Del ${dia(r.desde, true)} al ${dia(r.hasta, true)}: ${NUM.format(total('visitas'))} visitas, ${NUM.format(total('leads'))} leads y ${NUM.format(total('demos'))} demos.`
    + (pico.visitas > 0 ? ` El día con más visitas fue el ${dia(pico.dia)}, con ${NUM.format(pico.visitas)}.` : '');
  return (
    <section className="tarjeta res-grafico" aria-labelledby="res-grafico-titulo">
      <h2 id="res-grafico-titulo">Visitas y conversiones</h2>
      <ul className="res-leyenda" aria-hidden="true">
        <li><i className="visitas" />Visitas</li><li><i className="leads" />Leads</li><li><i className="demos" />Demos</li>
      </ul>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-labelledby="res-grafico-titulo" aria-describedby="res-grafico-desc" preserveAspectRatio="none">
        {[0, 0.5, 1].map((t) => <line key={t} className="guia" x1={mx} x2={ancho - mx} y1={y(t, 1)} y2={y(t, 1)} />)}
        <text className="eje" x={mx - 6} y={y(maxV, maxV) + 4} textAnchor="end">{NUM.format(maxV)}</text>
        <text className="eje" x={mx - 6} y={y(0, maxV) + 4} textAnchor="end">0</text>
        <text className="eje" x={ancho - mx + 6} y={y(maxC, maxC) + 4}>{NUM.format(maxC)}</text>
        <polyline className="visitas" points={linea('visitas', maxV)} />
        <polyline className="leads" points={linea('leads', maxC)} />
        <polyline className="demos" points={linea('demos', maxC)} />
      </svg>
      <p className="sec" id="res-grafico-desc">{resumen} Las visitas usan la escala de la izquierda; los leads y las demos, la de la derecha.</p>
      <details>
        <summary>Ver los datos por día</summary>
        <div className="tabla-costos res-tabla" tabIndex={0} role="region" aria-label="Datos por día">
          <table>
            <caption className="sr">Visitas, leads y demos por día</caption>
            <thead><tr><th scope="col">Día</th><th scope="col" className="d">Visitas</th><th scope="col" className="d">Leads</th><th scope="col" className="d">Demos</th></tr></thead>
            <tbody>{s.map((d) => <tr key={d.dia}><th scope="row">{dia(d.dia, true)}</th><td className="d num">{NUM.format(d.visitas)}</td><td className="d num">{NUM.format(d.leads)}</td><td className="d num">{NUM.format(d.demos)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Origen({ r }: { r: ResumenSitio }) {
  const total = r.indicadores.leads.actual;
  return (
    <section className="tarjeta" aria-labelledby="res-origen">
      <div className="res-titulo"><h2 id="res-origen">Origen de los leads</h2><span className="chip num">{NUM.format(total)}</span></div>
      {total === 0 ? <p className="nota">Todavía no hay leads en este período.</p> : (
        <ul className="res-origenes">
          {r.origenes.filter((o) => o.leads > 0).map((o) => (
            <li key={o.origen}>
              <span>{o.etiqueta}</span>
              <span className="res-pista" aria-hidden="true"><i style={{ width: `${o.porcentaje}%` }} /></span>
              <b className="num">{o.porcentaje} %</b>
              <span className="sec num">{NUM.format(o.leads)} {o.leads === 1 ? 'lead' : 'leads'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Paginas({ r }: { r: ResumenSitio }) {
  return (
    <section className="tarjeta" aria-labelledby="res-paginas">
      <div className="res-titulo"><h2 id="res-paginas">Páginas con más conversiones</h2>{enlace('/sitio/paginas', 'Ver páginas')}</div>
      {r.paginas.length === 0 ? <p className="nota">Ninguna página del período tiene leads con visitas registradas.</p> : (
        <div className="tabla-costos">
          <table>
            <caption className="sr">Las 5 páginas con más conversiones: leads con esa página de entrada entre las visitas que empezaron en ella</caption>
            <thead><tr><th scope="col">Ruta</th><th scope="col" className="d">Visitas</th><th scope="col" className="d">Leads</th><th scope="col" className="d">Conversión</th></tr></thead>
            <tbody>{r.paginas.map((p) => <tr key={p.ruta}><th scope="row">{p.ruta}</th><td className="d num">{NUM.format(p.visitas)}</td><td className="d num">{NUM.format(p.leads)}</td><td className="d num">{DEC.format(p.conversion)} %</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="sec">Conversión = leads con esa página de entrada ÷ visitas que empezaron en ella.</p>
    </section>
  );
}

function Demos({ r }: { r: ResumenSitio }) {
  return (
    <section className="tarjeta" aria-labelledby="res-demos">
      <div className="res-titulo"><h2 id="res-demos">Próximas demos</h2>{enlace('/captacion/agendamiento', 'Agendamiento')}</div>
      {r.proximasDemos.length === 0 ? <p className="nota">No hay demos confirmadas por delante.</p> : (
        <ul className="res-demos">
          {r.proximasDemos.map((d) => (
            <li key={d.id}>
              <span className="res-cuando num">{dia(d.fecha)}<br />{d.hora}</span>
              <span><b>{d.empresa ?? d.nombre}</b><span className="sec">{d.empresa ? `${d.nombre} · ` : ''}{d.tipo} · {d.asesor}</span></span>
              <span className="chip validado">Confirmada</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SitioResumen() {
  const [periodo, setPeriodo] = useState<PeriodoResumen>('30d');
  const [resumen, setResumen] = useState<ResumenSitio | null>(null);
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.paginasSitio().then(setPaginas, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el sitio'));
  }, []);
  useEffect(() => {
    let vigente = true;
    api.resumenSitio(periodo).then((r) => { if (vigente) setResumen(r); }, (e: unknown) => { if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el resumen'); });
    return () => { vigente = false; };
  }, [periodo]);

  const cuenta = (estado: PaginaSitio['estado']) => paginas?.filter((p) => p.estado === estado).length ?? 0;
  const selector = (
    <div className="opciones" role="group" aria-label="Período">
      {PERIODOS.map((p) => <button key={p.id} type="button" className="opcion" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>{p.nombre}</button>)}
    </div>
  );
  const subtitulo = resumen ? `Rendimiento del sitio comercial del ${dia(resumen.desde, true)} al ${dia(resumen.hasta, true)}, en hora de Lima. Solo lo ve el superadmin de la plataforma.` : 'Rendimiento del sitio comercial de Aptio SCORM. Solo lo ve el superadmin de la plataforma.';
  return (
    <>
      <Cabecera titulo="Resumen" subtitulo={subtitulo} accion={selector} />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!resumen ? (!error ? <p className="sec" role="status">Cargando el resumen…</p> : null) : (
        <div className="res">
          <Indicadores r={resumen} />
          <div className="res-fila"><Grafico r={resumen} /><Origen r={resumen} /></div>
          <div className="res-fila"><Paginas r={resumen} /><Demos r={resumen} /></div>
          <p className="res-nota">Las visitas son sesiones que empezaron en el sitio, contadas sin cookies ni datos personales (no cuentan los bots ni tu sesión de superadmin). Los leads y las demos son los mismos de Captación.</p>
        </div>
      )}
      {paginas ? (
        <section className="tarjeta" aria-labelledby="sitio-paginas">
          <h2 id="sitio-paginas">Páginas</h2>
          {paginas.length === 0 ? (
            <p className="nota">El sitio todavía no tiene páginas. Cuando se creen, aquí verás cuántas están publicadas, programadas o en borrador.</p>
          ) : (
            <p className="sec">{paginas.length} {paginas.length === 1 ? 'página' : 'páginas'}: {cuenta('PUBLICADA')} publicadas, {cuenta('PROGRAMADA')} programadas y {cuenta('BORRADOR')} en borrador.</p>
          )}
          <p><a href="/sitio/paginas" onClick={(e) => { e.preventDefault(); navegar('/sitio/paginas'); }}>Ir a Páginas</a></p>
        </section>
      ) : null}
    </>
  );
}
