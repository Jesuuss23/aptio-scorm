// HU-1501 · Sitio web › Resumen (PNT-24, M16). Solo el superadmin de plataforma (ADR-011). Mientras no llegue la
// analítica del sitio, muestra cuántas páginas hay en cada estado (HU-1502) y lleva a «Páginas».
import { Cabecera } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, type PaginaSitio } from '../api';
import { navegar } from '../ruta';

export function SitioResumen() {
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.paginasSitio().then(setPaginas, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el sitio'));
  }, []);

  const cuenta = (estado: PaginaSitio['estado']) => paginas?.filter((p) => p.estado === estado).length ?? 0;
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
            <p className="sec">{paginas.length} {paginas.length === 1 ? 'página' : 'páginas'}: {cuenta('PUBLICADA')} publicadas, {cuenta('PROGRAMADA')} programadas y {cuenta('BORRADOR')} en borrador.</p>
          )}
          <p><a href="/sitio/paginas" onClick={(e) => { e.preventDefault(); navegar('/sitio/paginas'); }}>Ir a Páginas</a></p>
        </section>
      )}
    </>
  );
}
