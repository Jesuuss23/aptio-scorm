// HU-1507 · Estado de la publicación del sitio, compartido por Páginas y el Editor de página: las versiones, si hay
// cambios sin publicar, el aviso del último paso y el bloqueo por ficticios (RN-16-3).
import { useEffect, useState } from 'react';
import { api, ErrorApi, type VersionSitio, type VersionesSitio } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
export type Detalle = { id: string; coleccion: string; nombre: string };
export type AvisoPublicacion = { tipo: 'ok' | 'error' | 'aviso'; texto: string } | null;
export type BloqueoSitio = { titulo: string; mensaje: string; detalles: Detalle[]; ocultable: boolean } | null;

const avisoFicticios = (n: number) =>
  ` Aviso: hay ${n === 1 ? '1 dato ficticio visible' : `${n} datos ficticios visibles`}; en pruebas se publica igual, pero en producción quedaría bloqueado.`;

/** Estado compartido de la publicación: las versiones, el aviso del último paso y el bloqueo por ficticios. */
export function usePublicacionSitio() {
  const [versiones, setVersiones] = useState<VersionesSitio | null>(null);
  const [error, setError] = useState('');
  const [refresco, setRefresco] = useState(0);
  const [aviso, setAviso] = useState<AvisoPublicacion>(null);
  const [bloqueo, setBloqueo] = useState<BloqueoSitio>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.versionesSitio().then((v) => { setVersiones(v); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar las versiones')));
  }, [refresco]);

  /** Vuelve a leer las versiones y si hay cambios sin publicar (tras cualquier cambio en el panel). */
  const recargar = () => setRefresco((n) => n + 1);

  async function paso(hacer: () => Promise<VersionSitio>, titulo: string, ocultable: boolean, ok: (v: VersionSitio) => string): Promise<VersionSitio | null> {
    setOcupado(true);
    setAviso(null);
    setBloqueo(null);
    try {
      const v = await hacer();
      setAviso(v.avisoFicticios ? { tipo: 'aviso', texto: ok(v) + avisoFicticios(v.avisoFicticios) } : { tipo: 'ok', texto: ok(v) });
      return v;
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'FICTICIOS_VISIBLES') setBloqueo({ titulo, mensaje: e.message, detalles: e.detalles as Detalle[], ocultable });
      else setAviso({ tipo: 'error', texto: mensajeDe(e, `${titulo} Inténtalo de nuevo.`) });
      return null;
    } finally {
      setOcupado(false);
      recargar();
    }
  }

  const publicar = () => paso(() => api.publicarSitio(), 'Los cambios no se publicaron.', true, (v) => `Se publicó la versión ${v.numero}: el sitio ya muestra los cambios.`);

  const restaurar = (numero: number) => paso(() => api.restaurarVersionSitio(numero), `La versión ${numero} no se restauró.`, false,
    (v) => `El sitio volvió a la versión ${numero} y se creó la versión ${v.numero}. Lo que editas en el panel no cambió.`);

  /** CP-116 · Oculta todos los ficticios visibles y vuelve a publicar en un clic. */
  async function ocultarYPublicar() {
    setOcupado(true);
    try {
      await api.ocultarFicticios();
    } catch (e) {
      setOcupado(false);
      setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron ocultar los ficticios') });
      return;
    }
    await publicar();
  }

  return { versiones, error, aviso, bloqueo, ocupado, recargar, publicar, restaurar, ocultarYPublicar, cerrarBloqueo: () => setBloqueo(null), limpiar: () => { setAviso(null); setBloqueo(null); } };
}

export type PublicacionSitio = ReturnType<typeof usePublicacionSitio>;

