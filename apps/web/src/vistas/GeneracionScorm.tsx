// HU-0401 y HU-0408 · Generar el SCORM desde el proyecto: las 11 etapas con su estado, detalle y costo, en vivo
// (SSE con consulta periódica de respaldo). Se cancela conservando lo hecho (CP-045) y se continúa desde la etapa
// con error o cancelada. Una sola generación activa por proyecto (CP-037).
import { DETALLE_PROXIMAMENTE, NOMBRE_ETAPA } from '@aptio/schema/generacion';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { api, ErrorApi, type EtapaGeneracion, type Generacion } from '../api';
import { usd } from '../formato';
import { EstructuraVista } from './EstructuraVista';
import { GuionVista } from './GuionVista';
import { PantallasVista } from './PantallasVista';
import { VozVista } from './VozVista';
import { ResumenMaterialVista } from './ResumenMaterialVista';

const ACTIVAS = new Set<Generacion['estado']>(['EN_COLA', 'EN_CURSO']);
const NOMBRE_ESTADO: Record<Generacion['estado'], string> = {
  EN_COLA: 'En espera', EN_CURSO: 'Trabajando…', COMPLETADO: 'Lista', ERROR: 'Con error', CANCELADO: 'Cancelada',
};
const CHIP: Partial<Record<Generacion['estado'], string>> = { EN_CURSO: 'ia', COMPLETADO: 'validado', ERROR: 'error', CANCELADO: 'aviso' };
const CONSULTA_MS = 2000;
/**
 * Etapas cuyo resultado se puede abrir desde la lista (cada historia agrega la suya). Las `enVivo` se muestran solas
 * mientras corren (CP-043) y se vuelven a pedir con cada avance (`clave`).
 */
const RESULTADOS: Partial<Record<EtapaGeneracion['etapa'], {
  ver: string; ocultar: string; enVivo?: boolean; Vista: (p: { generacionId: string; clave?: string }) => ReactNode;
}>> = {
  RESUMEN_MATERIAL: { ver: 'Ver resumen', ocultar: 'Ocultar resumen', Vista: ResumenMaterialVista },
  OBJETIVOS_ESTRUCTURA: { ver: 'Ver estructura', ocultar: 'Ocultar estructura', Vista: EstructuraVista },
  STORYBOARD_GUION: { ver: 'Ver guion', ocultar: 'Ocultar guion', Vista: GuionVista },
  PANTALLAS: { ver: 'Ver pantallas', ocultar: 'Ocultar pantallas', enVivo: true, Vista: PantallasVista },
  VOZ_ES: { ver: 'Escuchar narraciones', ocultar: 'Ocultar narraciones', enVivo: true, Vista: VozVista },
};

function titulo(g: Generacion): string {
  if (g.estado === 'EN_COLA') return 'En cola: el generador empieza en unos segundos';
  if (g.estado === 'EN_CURSO') return 'Armando tu SCORM…';
  if (g.estado === 'CANCELADO') return 'Generación cancelada. Lo terminado se conserva.';
  if (g.estado === 'ERROR') return 'La generación se detuvo por un error. Puedes continuar desde esa etapa.';
  return g.avance === 100 ? 'Tu SCORM está listo para revisar.' : 'Se completaron las etapas disponibles.';
}

/** El chip ya dice el estado: la línea de detalle solo aparece cuando agrega algo. */
function detalle(e: EtapaGeneracion): string {
  if (e.detalle) return e.detalle;
  return e.estado === 'CANCELADO' ? 'Se detuvo antes de terminar; no se guardó nada de esta etapa' : '';
}

export function GeneracionScorm({ proyectoId, puedeGenerar, materialListo, alCambiar }: {
  proyectoId: string;
  puedeGenerar: boolean;
  /** Hay material leído y nada en lectura (la API lo vuelve a verificar). */
  materialListo: boolean;
  /** Avisa al detalle del proyecto para refrescar su estado y costo. */
  alCambiar: () => void;
}) {
  const [g, setG] = useState<Generacion | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abierta, setAbierta] = useState<EtapaGeneracion['etapa'] | null>(null);
  const activa = Boolean(g && ACTIVAS.has(g.estado));

  useEffect(() => {
    api.generaciones(proyectoId).then((l) => setG(l[0] ?? null), (e: unknown) => {
      setG(null);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la generación');
    });
  }, [proyectoId]);

  const refrescar = useCallback((id: string) => {
    api.generacion(id).then((nueva) => {
      setG((antes) => {
        if (antes && antes.estado !== nueva.estado) alCambiar();
        return nueva;
      });
    }, () => undefined);
  }, [alCambiar]);

  // En vivo: cada evento de etapa trae de nuevo la generación; la consulta periódica cubre un SSE caído.
  const id = g?.id;
  useEffect(() => {
    if (!id || !activa) return;
    let fuente: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      fuente = new EventSource(`/api/v1/generaciones/${id}/eventos`);
      fuente.addEventListener('etapa', () => refrescar(id));
      fuente.onerror = () => fuente?.close();
    }
    const t = setInterval(() => refrescar(id), CONSULTA_MS);
    return () => {
      clearInterval(t);
      fuente?.close();
    };
  }, [id, activa, refrescar]);

  async function accion(hacer: () => Promise<Generacion>, mensajeError: string) {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      setG(await hacer());
      alCambiar();
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'GENERACION_ACTIVA') {
        // CP-037: otra persona ya la lanzó; se muestra la que está en curso.
        setAviso(e.message);
        api.generaciones(proyectoId).then((l) => setG(l[0] ?? null), () => undefined);
      } else {
        setError(e instanceof ErrorApi ? e.message : mensajeError);
      }
    } finally {
      setOcupado(false);
    }
  }

  const retomable = g && (g.estado === 'ERROR' || g.estado === 'CANCELADO');
  const pendientes = g?.etapas.filter((e) => e.detalle === DETALLE_PROXIMAMENTE).length ?? 0;
  return (
    <section className="tarjeta kit-bloque" aria-label="Generación del SCORM">
      <div className="fila-titulo">
        <h2>Generación del SCORM</h2>
        {puedeGenerar ? (
          <div className="fila-chips">
            {activa ? (
              <button className="boton" type="button" disabled={ocupado} onClick={() => void accion(() => api.cancelarGeneracion(g!.id), 'No se pudo cancelar')}>Cancelar</button>
            ) : null}
            {retomable ? (
              <button className="boton" type="button" disabled={ocupado} onClick={() => void accion(() => api.continuarGeneracion(g.id), 'No se pudo continuar')}>Continuar</button>
            ) : null}
            {!activa ? (
              <button className="boton primario" type="button" disabled={ocupado || !materialListo} onClick={() => void accion(() => api.generar(proyectoId), 'No se pudo lanzar la generación')}>
                {g ? 'Generar de nuevo' : 'Generar SCORM'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota aviso" role="status">{aviso}</div> : null}
      {g === undefined ? <p className="sec" role="status">Cargando generación…</p> : g === null ? (
        <p className="sec">
          {materialListo
            ? 'Todo listo. La IA arma estructura, guion, pantallas, voz, inglés y el paquete; tu equipo revisa y ajusta.'
            : 'Agrega el material del cliente o el tema y espera a que termine su lectura para generar.'}
        </p>
      ) : (
        <>
          <div className="generacion-resumen">
            <p className="generacion-titulo" role="status">{titulo(g)}</p>
            <dl className="generacion-cifras">
              <div><dt>Avance</dt><dd className="num">{g.avance} %</dd></div>
              <div><dt>Costo de IA</dt><dd className="num">{usd(g.costoUsd)}</dd></div>
            </dl>
          </div>
          <span className="barra" aria-hidden="true"><i style={{ width: `${g.avance}%` }} /></span>
          <ol className="etapas" aria-label="Etapas de la generación">
            {g.etapas.map((e) => {
              const resultado = e.estado === 'COMPLETADO' ? RESULTADOS[e.etapa] : undefined;
              const enVivo = e.estado === 'EN_CURSO' && RESULTADOS[e.etapa]?.enVivo ? RESULTADOS[e.etapa] : undefined;
              return (
              <li key={e.etapa} className={`etapa ${e.estado === 'COMPLETADO' ? 'hecha' : e.estado === 'EN_CURSO' ? 'en-curso' : ''}`} aria-label={NOMBRE_ETAPA[e.etapa]}>
                <span className="etapa-numero" aria-hidden="true">{e.estado === 'COMPLETADO' ? '✓' : e.orden}</span>
                <span className="etapa-texto">
                  <b>{NOMBRE_ETAPA[e.etapa]}</b>
                  {detalle(e) ? <span className={e.estado === 'ERROR' ? 'sec texto-error' : 'sec'}>{detalle(e)}</span> : null}
                </span>
                <span className="etapa-estado">
                  <span className={`chip ${CHIP[e.estado] ?? ''}`}>{NOMBRE_ESTADO[e.estado]}</span>
                  {e.costoUsd > 0 ? <span className="sec num">{usd(e.costoUsd)}</span> : null}
                </span>
                {resultado ? (
                  <button className="boton etapa-ver" type="button" aria-expanded={abierta === e.etapa} onClick={() => setAbierta(abierta === e.etapa ? null : e.etapa)}>
                    {abierta === e.etapa ? resultado.ocultar : resultado.ver}
                  </button>
                ) : null}
                {resultado && abierta === e.etapa ? <div className="etapa-resultado"><resultado.Vista generacionId={g.id} /></div> : null}
                {enVivo ? <div className="etapa-resultado"><enVivo.Vista generacionId={g.id} clave={e.detalle ?? ''} /></div> : null}
              </li>
              );
            })}
          </ol>
          {pendientes ? <p className="sec">{pendientes} etapas se habilitan en los próximos sprints; por ahora quedan en espera.</p> : null}
        </>
      )}
    </section>
  );
}
