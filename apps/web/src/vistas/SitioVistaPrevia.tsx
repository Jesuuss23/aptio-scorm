// HU-1507 · Vista previa de una página en el Editor de página (PNT-26): lo que hay ahora en el panel, publicado o no,
// con el menú y el pie visibles, en Escritorio (1280 px) o Celular (390 px). Muestra la estructura (bloques en orden con
// los textos de sus elementos); el diseño final de cada bloque llega con su historia. Los ficticios salen marcados.
import { nombreBloque } from '@aptio/schema/sitio-bloques';
import { COLECCION_DE_BLOQUE, nombreElemento } from '@aptio/schema/sitio-contenido';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type VistaPreviaPagina } from '../api';

const ANCHOS = { escritorio: { texto: 'Escritorio', px: 1280 }, celular: { texto: 'Celular', px: 390 } } as const;
type Ancho = keyof typeof ANCHOS;

export function VistaPreviaSitio({ paginaId, refresco }: { paginaId: string; refresco: number }) {
  const [vista, setVista] = useState<VistaPreviaPagina | null>(null);
  const [error, setError] = useState('');
  const [ancho, setAncho] = useState<Ancho>('escritorio');

  useEffect(() => {
    api.vistaPreviaPagina(paginaId).then((v) => { setVista(v); setError(''); }, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la vista previa'));
  }, [paginaId, refresco]);

  const { texto, px } = ANCHOS[ancho];
  return (
    <section className="tarjeta sitio-previa" aria-labelledby="vista-previa-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="vista-previa-titulo">Vista previa</h2>
        <div className="acciones-fila" role="group" aria-label="Resolución de la vista previa">
          {(Object.keys(ANCHOS) as Ancho[]).map((a) => (
            <button key={a} type="button" className="boton" aria-pressed={ancho === a} onClick={() => setAncho(a)}>{ANCHOS[a].texto} ({ANCHOS[a].px} px)</button>
          ))}
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!vista ? (!error ? <p className="sec">Cargando la vista previa…</p> : null) : (
        <>
          <p className="sec">
            {vista.estado === 'PUBLICADA' ? 'Así quedará la página con lo que hay en el panel; el sitio la muestra así después de «Publicar cambios».'
              : `La página está en ${vista.estado === 'BORRADOR' ? 'borrador' : 'programada'}: el sitio aún no la muestra. Así se verá cuando se publique.`}
            {' '}Los datos ficticios salen marcados aquí; en producción el sitio nunca los muestra.
          </p>
          <div className="sitio-previa-marco" role="region" tabIndex={0} aria-label={`Vista previa de ${vista.pagina.titulo} en ${texto.toLowerCase()}, ${px} px`}>
            <div className={`sitio-previa-pagina ${ancho}`} style={{ width: px }} data-ancho={px}>
              <header className="vp-cabecera">
                <b>Aptio SCORM</b>
                {vista.navegacion.menu.length ? (
                  <ul className="vp-menu" aria-label="Menú principal">
                    {vista.navegacion.menu.map((e) => <li key={e.ruta + e.texto}>{e.texto}</li>)}
                  </ul>
                ) : <span className="sec">Sin menú visible</span>}
              </header>
              {vista.pagina.bloques.length === 0 ? <p className="nota">La página no tiene bloques visibles.</p> : (
                <ol className="vp-bloques" aria-label="Bloques visibles">
                  {vista.pagina.bloques.map((b, i) => {
                    const coleccion = COLECCION_DE_BLOQUE[b.tipo];
                    return (
                      <li key={`${b.tipo}-${i}`} className="vp-bloque">
                        <b>{nombreBloque(b.tipo)}</b>
                        {b.elementos ? (b.elementos.length === 0 ? <span className="sec">Sin elementos visibles</span> : (
                          <ul className="vp-elementos">
                            {b.elementos.map((e, j) => (
                              <li key={j}>{coleccion ? nombreElemento(coleccion, e.datos) : String(Object.values(e.datos)[0] ?? '')}{e.ficticio ? <span className="chip aviso">Ficticio</span> : null}</li>
                            ))}
                          </ul>
                        )) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              <footer className="vp-pie">
                {vista.navegacion.pie.length === 0 ? <span className="sec">Sin pie visible</span> : vista.navegacion.pie.map((c) => (
                  <div key={c.titulo} className="vp-columna">
                    <b>{c.titulo}</b>
                    <ul aria-label={`Pie: ${c.titulo}`}>{c.enlaces.map((e) => <li key={e.ruta + e.texto}>{e.texto}</li>)}</ul>
                  </div>
                ))}
              </footer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
