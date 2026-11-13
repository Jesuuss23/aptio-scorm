// HU-1507 · Versiones del sitio comercial (REQ-068, RN-16-5, PNT-25 y PNT-26). Lo que se edita en el panel no llega al
// sitio hasta «Publicar cambios», que crea una versión inmutable con el sitio completo; el chip avisa si hay cambios
// sin publicar. La tarjeta «Versiones» lista las últimas y permite restaurar una: el sitio vuelve a mostrar esa versión
// y se crea la siguiente, sin tocar lo que se edita en el panel (CP-119). En producción, los datos ficticios bloquean
// publicar (con «Ocultar todos los ficticios») y restaurar una versión que los tenga (RN-16-3).
import { type Coleccion, COLECCIONES_CONTENIDO } from '@aptio/schema/sitio-contenido';
import { useEffect, useRef, useState } from 'react';
import type { VersionSitio } from '../api';
import type { PublicacionSitio } from './publicacion-sitio';
import { fechaHoraLima } from './sitio-paginas';

const ORIGEN: Record<VersionSitio['origen'], string> = {
  publicacion: 'Publicar cambios',
  pagina: 'Publicar o retirar una página',
  programada: 'Publicación programada',
  restauracion: 'Restauración',
};

/** HU-1508 · El HTML que sirve el sitio público lo arma el worker después de cada versión (DA-08). */
const PRERENDER: Record<VersionSitio['prerender']['estado'], { texto: string; clase: string }> = {
  listo: { texto: 'Sitio listo', clase: 'validado' },
  en_curso: { texto: 'Preparando el sitio', clase: 'aviso' },
  error: { texto: 'Error al preparar el sitio', clase: 'error' },
};

const ESPERA_PRERENDER_MS = 3000;

const textoOrigen = (v: VersionSitio) => (v.origen === 'restauracion' && v.restauradaDe ? `Restauración de la versión ${v.restauradaDe}` : ORIGEN[v.origen]);
/** El chip «Cambios sin publicar» o «Sitio al día» y el botón «Publicar cambios», para la cabecera. */
export function AccionPublicar({ estado }: { estado: PublicacionSitio }) {
  const pendientes = estado.versiones?.pendientes ?? false;
  return (
    <div className="publicar-cambios">
      {estado.versiones ? (
        <span className={`chip ${pendientes ? 'aviso' : 'validado'}`}>{pendientes ? 'Cambios sin publicar' : 'Sitio al día'}</span>
      ) : null}
      <button type="button" className="boton primario" disabled={estado.ocupado || !pendientes} onClick={() => void estado.publicar()}>Publicar cambios</button>
    </div>
  );
}

/** El resultado de publicar o restaurar y, si los ficticios lo bloquearon, la lista con «Ocultar todos los ficticios». */
export function AvisosPublicacion({ estado }: { estado: PublicacionSitio }) {
  const { aviso, bloqueo } = estado;
  return (
    <>
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : aviso.tipo === 'aviso' ? 'aviso' : 'error'}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</div> : null}
      {bloqueo ? (
        <div className="nota error" role="alert" aria-labelledby="bloqueo-sitio-titulo">
          <p id="bloqueo-sitio-titulo"><b>{bloqueo.titulo}</b> {bloqueo.mensaje}</p>
          <ul aria-label="Datos ficticios">
            {bloqueo.detalles.map((d) => <li key={d.id}>{d.nombre} <span>({COLECCIONES_CONTENIDO[d.coleccion as Coleccion]?.nombre ?? d.coleccion})</span></li>)}
          </ul>
          <div className="acciones-fila">
            {bloqueo.ocultable ? <button type="button" className="boton primario" disabled={estado.ocupado} onClick={() => void estado.ocultarYPublicar()}>Ocultar todos los ficticios</button> : null}
            <button type="button" className="boton" onClick={estado.cerrarBloqueo}>Cerrar</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** PNT-25 · Las versiones publicadas, de la más reciente a la más antigua, con «Restaurar» y su confirmación. */
export function TarjetaVersiones({ estado }: { estado: PublicacionSitio }) {
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const { versiones, error } = estado;
  const vigente = versiones?.versiones.find((v) => v.numero === versiones.actual);
  const preparando = vigente?.prerender.estado === 'en_curso';
  const { recargar } = estado;
  // Mientras el worker prepara el HTML, se vuelve a consultar cada 3 s para mostrar cuándo queda listo.
  useEffect(() => {
    if (!preparando) return;
    const reloj = setTimeout(recargar, ESPERA_PRERENDER_MS);
    return () => clearTimeout(reloj);
  }, [preparando, versiones, recargar]);

  async function restaurar(numero: number) {
    const v = await estado.restaurar(numero);
    if (!v) return;
    setConfirmando(null);
    titulo.current?.focus();
  }

  return (
    <section className="tarjeta versiones-sitio" aria-labelledby="versiones-titulo">
      <div className="tarjeta-cabeza">
        <h2 id="versiones-titulo" ref={titulo} tabIndex={-1}>Versiones</h2>
        <div className="acciones-fila">
          {versiones?.actual ? <span className="chip validado">El sitio muestra la versión {versiones.actual}</span> : null}
          {vigente ? <span className={`chip ${PRERENDER[vigente.prerender.estado].clase}`}>{PRERENDER[vigente.prerender.estado].texto}</span> : null}
          <a className="boton" href="/s/" target="_blank" rel="noopener">Ver el sitio<span className="sr"> (se abre en una pestaña nueva)</span></a>
        </div>
      </div>
      {vigente?.prerender.estado === 'error' ? (
        <div className="nota error" role="alert">
          El sitio público todavía no muestra la versión {vigente.numero}: no se pudo preparar.{vigente.prerender.error ? ` Motivo: ${vigente.prerender.error.replace(/\.?$/, '.')}` : ''} Se reintenta al reiniciar el servicio o con la próxima publicación.
        </div>
      ) : vigente?.prerender.estado === 'en_curso' ? (
        <p className="sec" role="status">Preparando la versión {vigente.numero}: el sitio público la mostrará en unos segundos.</p>
      ) : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!versiones ? (!error ? <p className="sec">Cargando las versiones…</p> : null) : versiones.versiones.length === 0 ? (
        <p className="nota">Aún no hay versiones: el sitio no muestra nada. «Publicar cambios» crea la primera.</p>
      ) : (
        <>
          <p className="sec">
            Cada publicación guarda el sitio completo. Restaurar una versión cambia solo lo que ve el público y crea una versión nueva; lo que editas en el panel no cambia.
            {versiones.total > versiones.versiones.length ? ` Se conservan las ${versiones.total}; aquí ves las ${versiones.versiones.length} más recientes.` : ''}
          </p>
          <div className="tabla-costos">
            <table aria-label="Versiones del sitio">
              <thead>
                <tr>
                  <th scope="col">Versión</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Origen</th>
                  <th scope="col"><span className="sr">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {versiones.versiones.map((v) => {
                  const actual = v.numero === versiones.actual;
                  return (
                    <FilaVersion
                      key={v.numero} version={v} actual={actual} confirmando={confirmando === v.numero} ocupado={estado.ocupado}
                      alConfirmar={(si) => { setConfirmando(si ? v.numero : null); estado.limpiar(); }}
                      alRestaurar={() => void restaurar(v.numero)} siguiente={(versiones.actual ?? 0) + 1}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function FilaVersion({ version: v, actual, confirmando, ocupado, siguiente, alConfirmar, alRestaurar }: {
  version: VersionSitio; actual: boolean; confirmando: boolean; ocupado: boolean; siguiente: number;
  alConfirmar: (si: boolean) => void; alRestaurar: () => void;
}) {
  return (
    <>
      <tr>
        <th scope="row"><b>Versión {v.numero}</b>{actual ? <span className="chip validado">En el sitio</span> : null}</th>
        <td>{fechaHoraLima(v.creadoEn)}</td>
        <td>{v.publicadoPor?.nombre ?? 'La plataforma'}</td>
        <td>{textoOrigen(v)}<span className="sec"> · {v.paginas === 1 ? '1 página' : `${v.paginas} páginas`}{v.entorno === 'pruebas' ? ' · pruebas' : ''}</span></td>
        <td>
          {actual ? null : (
            <button type="button" className="boton" disabled={ocupado} aria-expanded={confirmando} onClick={() => alConfirmar(!confirmando)} aria-label={`Restaurar la versión ${v.numero}`}>Restaurar</button>
          )}
        </td>
      </tr>
      {confirmando ? (
        <tr>
          <td colSpan={5}>
            <div className="nota aviso confirmar-fila" role="group" aria-label={`Confirmar la restauración de la versión ${v.numero}`}>
              <span>¿Restaurar la versión {v.numero}? El sitio vuelve a mostrar lo que tenía y se crea la versión {siguiente}. Lo que editas en el panel no cambia.</span>
              <button type="button" className="boton primario" disabled={ocupado} onClick={alRestaurar}>Sí, restaurar</button>
              <button type="button" className="boton" onClick={() => alConfirmar(false)}>Cancelar</button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
