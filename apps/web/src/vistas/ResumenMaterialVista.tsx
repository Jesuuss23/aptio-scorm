// HU-0402 · Resultado de la etapa 1: temas con la decisión propuesta y su motivo, ideas clave con su página de origen
// y el acta de temas omitidos para el cliente (CP-038). Todo es propuesta de la IA: el diseñador instruccional decide.
import type { DecisionTema, ResumenMaterial } from '@aptio/schema/generacion';
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';
import { paginas } from '../formato';

const NOMBRE_DECISION: Record<DecisionTema, string> = { conservar: 'Se conserva', complementario: 'Complementario', omitir: 'Se omite' };
const CHIP_DECISION: Record<DecisionTema, string> = { conservar: 'validado', complementario: '', omitir: 'aviso' };

export function ResumenMaterialVista({ generacionId }: { generacionId: string }) {
  const [r, setR] = useState<ResumenMaterial | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.etapaGeneracion<ResumenMaterial>(generacionId, 'RESUMEN_MATERIAL').then(
      (e) => (e.datos ? setR(e.datos) : setError('La etapa todavía no tiene resultado')),
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el resumen'),
    );
  }, [generacionId]);

  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!r) return <p className="sec" role="status">Cargando resumen…</p>;
  const varios = r.documentos.length > 1;
  return (
    <div className="resumen-material" role="region" aria-label="Resumen del material">
      <p className="nota">Propuesta de la IA. Revisa qué temas entran y el acta antes de enviarla al cliente.</p>
      {!r.documentos.length ? <p className="sec">Sin documento: la estructura parte del tema «{r.tema}».</p> : null}

      {r.temas.length ? (
        <section aria-label="Temas del material">
          <h3>Temas {r.minutosEstimados !== null && r.metaMinutos !== null ? <span className="sec">· ≈ {r.minutosEstimados} de {r.metaMinutos} minutos</span> : null}</h3>
          <ul className="lista-temas">
            {r.temas.map((t) => {
              const ideas = r.ideas.filter((i) => i.temaId === t.id);
              return (
                <li key={t.id} className="tema-material" aria-label={t.titulo}>
                  <div className="fila-chips">
                    <b>{t.titulo}</b>
                    <span className="chip">{paginas(t.paginas)}</span>
                    <span className={`chip ${CHIP_DECISION[t.decision]}`}>{NOMBRE_DECISION[t.decision]}</span>
                  </div>
                  <span className="sec">{t.decision === 'conservar' ? t.resumen : t.motivo}</span>
                  {ideas.length ? (
                    <ul className="ideas" aria-label={`Ideas clave de ${t.titulo}`}>
                      {ideas.map((i) => (
                        <li key={i.id}>
                          <span>{i.texto}</span>
                          <span className="fila-chips">
                            <span className="chip" title={i.archivo}>{varios ? `${i.archivo} · ` : ''}{paginas(i.paginas)}</span>
                            {i.literal ? <span className="chip">Literal</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {r.acta ? (
        <section aria-label="Acta de temas omitidos">
          <h3>{r.acta.titulo}</h3>
          <pre className="acta">{r.acta.textoActa}</pre>
        </section>
      ) : null}
      {r.observaciones.length ? (
        <section aria-label="Observaciones de la IA">
          <h3>Observaciones</h3>
          <ul>{r.observaciones.map((o) => <li key={o} className="sec">{o}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
