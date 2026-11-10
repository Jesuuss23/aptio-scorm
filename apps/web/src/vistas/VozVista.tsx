// HU-0701 · Resultado de la etapa 6 «Voz en español»: cada narración con su duración y el estado «Lista». Mientras la
// etapa corre, las listas aparecen sin esperar al resto; al terminar se pueden escuchar (audio firmado por 15 minutos).
import { duracionLegible, type VozCurso } from '@aptio/schema/generacion';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Narracion } from '../api';

const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function VozVista({ generacionId, clave }: { generacionId: string; clave?: string }) {
  const [d, setD] = useState<VozCurso | null>(null);
  const [audios, setAudios] = useState<Map<string, Narracion>>(new Map());
  const [error, setError] = useState('');
  const terminado = clave === undefined;

  useEffect(() => {
    api.etapaGeneracion<VozCurso>(generacionId, 'VOZ_ES').then(
      (e) => {
        if (!e.datos) return setError('La etapa todavía no tiene narraciones');
        setD(e.datos);
        // Los audios se piden al terminar: mientras corre basta la lista.
        if (terminado) api.narraciones(e.datos.cursoId).then((l) => setAudios(new Map(l.map((n) => [n.pantallaId, n]))), () => undefined);
      },
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las narraciones'),
    );
  }, [generacionId, clave, terminado]);

  if (error && !d) return <div className="nota error" role="alert">{error}</div>;
  if (!d) return <p className="sec" role="status">Cargando narraciones…</p>;
  const total = d.narraciones.reduce((n, x) => n + x.duracionMs, 0);
  return (
    <div className="voz-vista" role="region" aria-label="Narraciones en español">
      <p className="sec num" role="status">
        {d.narraciones.length} de {d.total} narraciones listas{total ? ` · ${duracionLegible(total)} de audio` : ''}
      </p>
      {d.simulada ? <p className="nota">Voz simulada: el audio es silencio con la duración que tendría la voz. Con la voz de Google configurada se escucha a la narradora.</p> : null}
      <ol className="voz-lista" aria-label="Narraciones">
        {d.narraciones.map((n) => {
          const audio = audios.get(n.pantallaId);
          return (
            <li key={n.pantallaId} className="voz-item" aria-label={`Narración ${n.pantallaId}`}>
              <div className="voz-cabeza">
                <span><span className="num">{n.pantallaId}</span> · {n.titulo}</span>
                <span className="fila-chips">
                  <span className="num sec">{segundos(n.duracionMs)}</span>
                  <span className={`chip ${audio && audio.estado !== 'ACTUALIZADA' ? 'aviso' : 'validado'}`}>{audio && audio.estado !== 'ACTUALIZADA' ? 'Por regenerar' : 'Lista'}</span>
                </span>
              </div>
              <p className="voz-texto">{n.texto}</p>
              {n.pronunciados.length ? <p className="sec">Pronunciación del diccionario: {n.pronunciados.join(', ')}</p> : null}
              {audio?.audioUrl ? <audio controls preload="none" src={audio.audioUrl} aria-label={`Escuchar la narración de ${n.pantallaId}`} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
