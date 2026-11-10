// HU-0404 · Resultado de la etapa 3: por pantalla, título, texto en pantalla, narración, visual, actividad y origen.
// CP-040: el texto que pasa de 30 palabras en pantalla (o 45 de narración) se muestra con advertencia y su conteo.
import { type AdvertenciaGuion, type CampoGuion, type GuionCurso, LIMITE_PALABRAS } from '@aptio/schema/generacion';
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';
import { NOMBRE_INTERACCION, NOMBRE_TIPO_PANTALLA, paginas } from '../formato';

const NOMBRE_CAMPO: Record<CampoGuion, string> = { textoPantalla: 'en pantalla', narracion: 'de narración' };

function Conteo({ campo, palabras, aviso }: { campo: CampoGuion; palabras: number; aviso: AdvertenciaGuion | undefined }) {
  return (
    <span className="guion-conteo">
      {aviso
        ? <span className="chip aviso">Supera el límite: {palabras} palabras {NOMBRE_CAMPO[campo]} (máximo {LIMITE_PALABRAS[campo]})</span>
        : <span className="sec num">{palabras} / {LIMITE_PALABRAS[campo]} palabras</span>}
    </span>
  );
}

export function GuionVista({ generacionId }: { generacionId: string }) {
  const [g, setG] = useState<GuionCurso | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.etapaGeneracion<GuionCurso>(generacionId, 'STORYBOARD_GUION').then(
      (e) => (e.datos ? setG(e.datos) : setError('La etapa todavía no tiene resultado')),
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el guion'),
    );
  }, [generacionId]);

  if (error) return <div className="nota error" role="alert">{error}</div>;
  if (!g) return <p className="sec" role="status">Cargando guion…</p>;
  const aviso = (id: string, campo: CampoGuion) => g.advertencias.find((a) => a.pantallaId === id && a.campo === campo);
  const largas = new Set(g.advertencias.map((a) => a.pantallaId)).size;
  return (
    <div className="resumen-material" role="region" aria-label="Guion por pantalla">
      {largas ? (
        <p className="nota aviso" role="status">
          {largas === 1 ? '1 pantalla supera' : `${largas} pantallas superan`} el límite de palabras. Acórtala antes de armar las pantallas.
        </p>
      ) : (
        <p className="nota">Propuesta de la IA. Todas las pantallas están dentro del límite de palabras; revisa el tono y la narración.</p>
      )}
      {g.capsulas.map((c) => (
        <section key={c.id} aria-label={`Cápsula ${c.titulo.es ?? c.titulo.en ?? c.id}`}>
          <h3>{c.titulo.es ?? c.titulo.en ?? c.id} <span className="sec">· {c.pantallas.length} pantallas</span></h3>
          <ol className="lista-temas">
            {c.pantallas.map((p) => (
              <li key={p.id} className="tema-material guion-pantalla" aria-label={`Pantalla ${p.id}`}>
                <div className="fila-chips">
                  <span className="sec num">{p.id}</span>
                  <b>{p.titulo}</b>
                  <span className="chip">{NOMBRE_TIPO_PANTALLA[p.tipo] ?? p.tipo}</span>
                  {p.origen.tipo === 'documento'
                    ? <span className="chip">{p.origen.paginas?.length ? paginas(p.origen.paginas) : 'Documento'}{p.origen.archivo ? ` · ${p.origen.archivo}` : ''}</span>
                    : <span className="chip ia">Agregado por la IA</span>}
                </div>
                <dl className="guion-campos">
                  <div>
                    <dt>En pantalla</dt>
                    <dd>{p.textoPantalla || <span className="sec">Sin texto</span>}<Conteo campo="textoPantalla" palabras={p.palabras.textoPantalla} aviso={aviso(p.id, 'textoPantalla')} /></dd>
                  </div>
                  <div>
                    <dt>Narración</dt>
                    <dd>{p.narracion}<Conteo campo="narracion" palabras={p.palabras.narracion} aviso={aviso(p.id, 'narracion')} /></dd>
                  </div>
                  <div><dt>Visual</dt><dd className="sec">{p.visual}</dd></div>
                  {p.actividad ? (
                    <div><dt>Actividad</dt><dd>{p.actividad.tipo} · {NOMBRE_INTERACCION[p.actividad.tipo] ?? 'Interacción'}: {p.actividad.consigna}</dd></div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
