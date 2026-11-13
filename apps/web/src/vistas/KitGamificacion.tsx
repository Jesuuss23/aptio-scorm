// HU-1205 · «Kit de gamificación para el LMS» en Entrega (PNT-16): insignias con la marca del cliente (por cápsula,
// módulo y curso, en PNG y SVG), el plan y la guía del LMS elegido. El LMS empieza en el del cliente; el kit se pide como
// una exportación más y su avance y su descarga aparecen en el historial.
import { useState } from 'react';
import { api, ErrorApi, type Exportacion, type ModoIdiomaExportacion, type PerfilExportacion } from '../api';
import { IDIOMAS_KIT, PERFILES } from './entrega';

export function KitGamificacion({ cursoId, version, perfilInicial, puedeExportar, alPedir }: {
  cursoId: string;
  version: number;
  perfilInicial: PerfilExportacion;
  puedeExportar: boolean;
  alPedir: (e: Exportacion) => void;
}) {
  const [lms, setLms] = useState<PerfilExportacion>(perfilInicial);
  const [idioma, setIdioma] = useState<ModoIdiomaExportacion>('unico');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null);
  const nombre = PERFILES.find((p) => p.id === lms)?.nombre ?? lms;

  async function exportar() {
    setOcupado(true);
    setMensaje(null);
    try {
      const e = await api.exportar(cursoId, { formato: 'KIT_GAMIFICACION', perfilLms: lms, modoIdioma: idioma });
      alPedir(e);
      setMensaje({ error: false, texto: `Kit pedido para ${nombre} con la versión ${e.versionCurso} del curso: aparece en el historial cuando esté listo.` });
    } catch (e) {
      setMensaje({ error: true, texto: e instanceof ErrorApi ? e.message : 'No se pudo pedir el kit' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta kit-bloque kit-gamificacion" aria-labelledby="kit-gamificacion-titulo">
      <h2 id="kit-gamificacion-titulo">Kit de gamificación para el LMS</h2>
      <p className="sec">Insignias con la marca del cliente (una por cápsula, una por módulo y una del curso, en PNG y SVG), el plan de gamificación con la nota mínima y el orden de desbloqueo, y la guía para configurarlas en el LMS. Versión {version} del curso.</p>
      <h3>LMS del cliente</h3>
      <div className="opciones" role="group" aria-label="LMS del kit">
        {PERFILES.map((p) => (
          <button key={p.id} type="button" className="opcion" aria-pressed={lms === p.id} onClick={() => setLms(p.id)}>{p.nombre}</button>
        ))}
      </div>
      <h3>Nombres de las insignias</h3>
      <div className="opciones" role="group" aria-label="Idioma del kit">
        {IDIOMAS_KIT.map((m) => (
          <button key={m.id} type="button" className="opcion" aria-pressed={idioma === m.id} onClick={() => setIdioma(m.id)}>{m.nombre}</button>
        ))}
      </div>
      <p className="nota" data-lms={lms}>La guía trae los pasos de {nombre}. Los nombres de los menús cambian entre versiones: verifícalos con la versión del cliente.</p>
      {mensaje ? <div className={mensaje.error ? 'nota error' : 'nota'} role={mensaje.error ? 'alert' : 'status'}>{mensaje.texto}</div> : null}
      {puedeExportar ? (
        <div className="acciones-form">
          <button className="boton primario" type="button" disabled={ocupado} onClick={() => void exportar()}>{ocupado ? 'Pidiendo el kit…' : 'Exportar kit'}</button>
        </div>
      ) : <p className="sec">Solo administración, diseño instruccional y producción exportan.</p>}
    </section>
  );
}
