// HU-1501 · Sitio web › Resumen (PNT-24, M16). Solo el superadmin de plataforma (ADR-011). Hasta que lleguen las
// páginas (HU-1502) y la analítica del sitio, la vista muestra el estado vacío con lo que falta para publicar.
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type PaginaSitio } from '../api';

export function SitioResumen() {
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.paginasSitio().then(setPaginas, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el sitio'));
  }, []);

  const publicadas = paginas?.filter((p) => p.estado === 'PUBLICADA').length ?? 0;
  return (
    <>
      <Cabecera titulo="Resumen" subtitulo="Estado del sitio comercial de Aptio SCORM. Solo lo ve el superadmin de la plataforma." />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!paginas ? (!error ? <p className="sec" role="status">Cargando el sitio…</p> : null) : (
        <section className="tarjeta" aria-labelledby="sitio-paginas">
          <h2 id="sitio-paginas">Páginas</h2>
          {paginas.length === 0 ? (
            <p className="nota">El sitio todavía no tiene páginas. Cuando se creen, aquí verás cuántas están publicadas, programadas o en borrador.</p>
          ) : (
            <p className="sec">{paginas.length} páginas, {publicadas} publicadas.</p>
          )}
        </section>
      )}
    </>
  );
}
