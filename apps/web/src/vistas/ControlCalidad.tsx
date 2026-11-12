// HU-0505 · Tarjeta «Control de calidad» de Revisión (CP-054): las observaciones abiertas de la pantalla con su
// gravedad, su categoría, la sugerencia y el chip «IA»; «Descartar» en las de la IA; «✦ Revisar con IA» (IA-12) con su
// avance por SSE y consulta cada 2 s de respaldo; y «Del curso», lo que no es de una pantalla (un objetivo sin
// actividad, el contraste del kit).
import { type CategoriaObservacion, NOMBRE_CATEGORIA, TOPE_OBSERVACIONES_IA } from '@aptio/schema/calidad';
import { ORIGEN_REVISAR_TIEMPO } from '@aptio/schema/tiempos';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi, type Observacion } from '../api';

const CONSULTA_MS = 2000;
const NOMBRE_SEVERIDAD = { info: 'Información', aviso: 'Aviso', 'bloquea-entrega': 'Bloquea la entrega' } as const;
const CLASE_SEVERIDAD = { info: '', aviso: 'aviso', 'bloquea-entrega': 'error' } as const;
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

function ListaObservaciones({ lista, editan, ocupada, alDescartar, nombre }: { lista: Observacion[]; editan: boolean; ocupada: string | null; alDescartar: (o: Observacion) => void; nombre: string }) {
  return (
    <ul className="revision-observaciones" aria-label={nombre}>
      {lista.map((o) => (
        <li key={o.id} data-origen={o.origen}>
          <span className="chips-observacion">
            <span className={`chip ${CLASE_SEVERIDAD[o.severidad]}`}>{NOMBRE_SEVERIDAD[o.severidad]}</span>
            {o.categoria && o.categoria in NOMBRE_CATEGORIA ? <span className="chip">{NOMBRE_CATEGORIA[o.categoria as CategoriaObservacion]}</span> : null}
            {o.origen === 'ia' ? <span className="chip ia">IA</span> : null}
            {o.origen === ORIGEN_REVISAR_TIEMPO ? <span className="chip lt-revisar">⚠ revisar tiempo</span> : null}
          </span>
          <span>{o.mensaje}</span>
          {o.sugerencia ? <span className="sec">Sugerencia: {o.sugerencia}</span> : null}
          {editan && o.origen === 'ia' ? (
            <button type="button" className="boton chico" disabled={ocupada === o.id} aria-label={`Descartar: ${o.mensaje}`} onClick={() => alDescartar(o)}>Descartar</button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ControlCalidad({ cursoId, pantallaId, observaciones, editan, alCambiar }: {
  cursoId: string; pantallaId: string; observaciones: Observacion[]; editan: boolean; alCambiar: () => Promise<unknown>;
}) {
  const [avance, setAvance] = useState<{ id: string; progreso: number; mensaje: string } | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const deLaPantalla = observaciones.filter((o) => o.pantallaId === pantallaId);
  const delCurso = observaciones.filter((o) => !o.pantallaId);
  const tope = observaciones.filter((o) => o.origen === 'ia').length >= TOPE_OBSERVACIONES_IA;

  const trabajoId = avance?.id;
  const terminar = useRef<(estado: string, mensaje?: string | null) => void>(() => undefined);
  useEffect(() => {
    terminar.current = (estado, mensaje) => {
      setAvance(null);
      void alCambiar();
      if (estado === 'COMPLETADO') setAviso(mensaje ? `Revisión terminada: ${mensaje}` : 'Revisión terminada');
      else setError(mensaje ? `La revisión no terminó: ${mensaje}` : 'La revisión no terminó');
    };
  }, [alCambiar]);
  useEffect(() => {
    if (!trabajoId) return;
    let fuente: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      fuente = new EventSource('/api/v1/eventos');
      fuente.addEventListener('trabajo', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent<string>).data) as { trabajoId?: string; estado?: string; progreso?: number; mensaje?: string };
          if (d.trabajoId !== trabajoId) return;
          if (d.estado === 'COMPLETADO' || d.estado === 'ERROR') return terminar.current(d.estado, d.mensaje);
          setAvance((a) => (a ? { ...a, progreso: d.progreso ?? a.progreso, mensaje: d.mensaje ?? a.mensaje } : a));
        } catch {
          // Un evento que no se entiende no cambia nada: la consulta periódica sigue.
        }
      });
      fuente.onerror = () => fuente?.close();
    }
    const t = setInterval(() => {
      api.trabajo(trabajoId).then((tr) => {
        if (tr.estado === 'COMPLETADO' || tr.estado === 'ERROR' || tr.estado === 'CANCELADO') terminar.current(tr.estado === 'COMPLETADO' ? 'COMPLETADO' : 'ERROR', tr.error);
      }, () => undefined);
    }, CONSULTA_MS);
    return () => {
      clearInterval(t);
      fuente?.close();
    };
  }, [trabajoId]);

  async function revisar() {
    setError('');
    setAviso('');
    try {
      const t = await api.controlCalidad(cursoId);
      setAvance({ id: t.id, progreso: 0, mensaje: 'En cola…' });
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo pedir la revisión'));
    }
  }

  async function descartar(o: Observacion) {
    setOcupada(o.id);
    setError('');
    try {
      await api.descartarObservacion(o.id);
      await alCambiar();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo descartar la observación'));
    } finally {
      setOcupada(null);
    }
  }

  return (
    <section className="tarjeta kit-bloque control-calidad" aria-label="Control de calidad">
      <div className="fila-titulo">
        <h2>Control de calidad</h2>
        {editan ? (
          <button type="button" className="boton ia chico" disabled={Boolean(avance)} onClick={() => void revisar()}>{avance ? 'Revisando…' : '✦ Revisar con IA'}</button>
        ) : null}
      </div>
      {avance ? (
        <div className="nota avance-traduccion" role="status" aria-live="polite">
          <span>{avance.mensaje}</span>
          <span className="barra" role="progressbar" aria-label="Avance de la revisión de calidad" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance.progreso}>
            <i style={{ width: `${avance.progreso}%` }} />
          </span>
        </div>
      ) : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
      {tope ? <div className="nota aviso">La IA llegó al tope de {TOPE_OBSERVACIONES_IA} observaciones: revisa estas y vuelve a correr la revisión.</div> : null}
      {deLaPantalla.length ? (
        <ListaObservaciones lista={deLaPantalla} editan={editan} ocupada={ocupada} alDescartar={(o) => void descartar(o)} nombre="Observaciones de la pantalla" />
      ) : <p className="sec">Sin observaciones abiertas.</p>}
      {delCurso.length ? (
        <>
          <h3>Del curso</h3>
          <ListaObservaciones lista={delCurso} editan={editan} ocupada={ocupada} alDescartar={(o) => void descartar(o)} nombre="Observaciones del curso" />
        </>
      ) : null}
    </section>
  );
}
