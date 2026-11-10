// HU-0403 · Resultado de la etapa 2: objetivos con verbo y nivel de Bloom y la lista de pantallas con su tipo, objetivo,
// actividad sugerida y páginas de origen (CP-039). Es propuesta de la IA: el diseñador instruccional decide.
import { conActividad, type EstructuraCurso, type NivelBloom, type TipoPantalla } from '@aptio/schema/generacion';
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';
import { paginas } from '../formato';

const NOMBRE_TIPO: Record<TipoPantalla, string> = {
  portada: 'Portada', objetivos: 'Objetivos', contenido: 'Contenido', actividad: 'Actividad', evaluacion: 'Reto final',
  seccion: 'Sección', resumen: 'Resumen', resultados: 'Resultados', cierre: 'Cierre',
};
const NOMBRE_BLOOM: Record<NivelBloom, string> = {
  recordar: 'Recordar', comprender: 'Comprender', aplicar: 'Aplicar', analizar: 'Analizar', evaluar: 'Evaluar', crear: 'Crear',
};
/** Catálogo cerrado de interacciones (docs/05-interacciones.md). */
const NOMBRE_INTERACCION: Record<string, string> = {
  'INT-01': 'Memoria', 'INT-02': 'Clasificar', 'INT-03': 'Ordenar pasos', 'INT-04': 'Tarjetas', 'INT-05': 'Quiz',
  'INT-06': 'Exploración', 'INT-07': 'Deslizar', 'INT-08': 'Decisión',
};

export function EstructuraVista({ generacionId }: { generacionId: string }) {
  const [s, setS] = useState<EstructuraCurso | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.etapaGeneracion<EstructuraCurso>(generacionId, 'OBJETIVOS_ESTRUCTURA').then(
      (e) => (e.datos ? setS(e.datos) : setError('La etapa todavía no tiene resultado')),
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la estructura'),
    );
  }, [generacionId]);

  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!s) return <p className="sec" role="status">Cargando estructura…</p>;
  const numero = new Map(s.objetivos.map((o, i) => [o.id, i + 1]));
  const lista = s.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
  return (
    <div className="resumen-material" role="region" aria-label="Estructura del curso">
      <p className="nota">Propuesta de la IA. Revisa los objetivos y la secuencia antes de seguir con el guion.</p>
      <section aria-label="Objetivos de aprendizaje">
        <h3>Objetivos</h3>
        <ol className="lista-temas">
          {s.objetivos.map((o) => (
            <li key={o.id} className="tema-material">
              <div className="fila-chips"><b>{o.texto.es ?? o.texto.en}</b><span className="chip ia">{NOMBRE_BLOOM[o.nivelBloom]}</span></div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Pantallas">
        <h3>
          Pantallas <span className="sec">· {lista.length} en total · {s.actividades.total} con actividad{s.actividades.minimas !== null ? ` (mínimo ${s.actividades.minimas})` : ''}</span>
        </h3>
        <ol className="lista-temas">
          {lista.map((p) => (
            <li key={p.id} className="tema-material" aria-label={`Pantalla ${p.id}`}>
              <div className="fila-chips">
                <span className="sec num">{p.id}</span>
                <b>{p.proposito}</b>
              </div>
              <div className="fila-chips">
                <span className={`chip ${conActividad(p) ? 'validado' : ''}`}>{NOMBRE_TIPO[p.tipo]}</span>
                {p.actividadSugerida ? <span className="chip">{p.actividadSugerida} · {NOMBRE_INTERACCION[p.actividadSugerida] ?? 'Interacción'}</span> : null}
                {p.objetivoIds.map((o) => <span key={o} className="chip">Objetivo {numero.get(o) ?? o}</span>)}
                {p.paginas.length ? <span className="chip">{paginas(p.paginas)}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
      {s.supuestos.length ? (
        <section aria-label="Supuestos de la IA">
          <h3>Supuestos</h3>
          <ul>{s.supuestos.map((x) => <li key={x} className="sec">{x}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
