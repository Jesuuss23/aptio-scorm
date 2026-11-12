import { Cabecera } from '@aptio/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type Cliente, EDITAN_CLIENTES, ErrorApi, OPCIONES_LMS, type Rol, VEN_KIT } from '../api';
import { FichasLms } from './FichasLms';
import { Glosario } from './Glosario';
import { KitMarca } from './KitMarca';

/** Datos del cliente, su kit de marca con las pantallas modelo (HU-0202, HU-0204), su glosario y pronunciación (HU-0205) y sus fichas de compatibilidad LMS (HU-1204). */
export function ClienteDetalle({ id, rol, alCargar }: { id: string; rol: Rol; alCargar: (nombre: string) => void }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const puedeEditar = EDITAN_CLIENTES.includes(rol);

  useEffect(() => {
    api.cliente(id).then(
      (c) => {
        setCliente(c);
        alCargar(c.nombre);
      },
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el cliente'),
    );
  }, [id, alCargar]);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cliente) return;
    const datos = new FormData(e.currentTarget);
    setError('');
    setAviso('');
    try {
      const c = await api.editarCliente(cliente.id, {
        nombre: String(datos.get('nombre') ?? ''),
        lmsHabitual: String(datos.get('lms') ?? ''),
        idiomas: datos.get('ingles') ? ['es', 'en'] : ['es'],
        notas: String(datos.get('notas') ?? ''),
        retencionDocumentosDias: Number(datos.get('retencion')),
      });
      setCliente(c);
      alCargar(c.nombre);
      setAviso('Cambios guardados');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar');
    }
  }

  if (!cliente) {
    return error ? <div className="nota error" role="alert">{error}</div> : <p className="sec" role="status">Cargando…</p>;
  }
  const lmsConocido = !cliente.lmsHabitual || OPCIONES_LMS.includes(cliente.lmsHabitual);
  return (
    <>
      <Cabecera titulo={cliente.nombre} subtitulo="Datos del cliente, su kit de marca, su glosario y sus fichas de LMS." />
      <div className="columnas">
        <form className="tarjeta formulario" onSubmit={guardar} aria-label="Datos del cliente">
          <h2>Datos</h2>
          {error ? <div className="nota error" role="alert">{error}</div> : null}
          {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
          <fieldset disabled={!puedeEditar} className="sin-borde">
            <label className="campo">
              Nombre
              <input name="nombre" required minLength={2} defaultValue={cliente.nombre} />
            </label>
            <label className="campo">
              LMS habitual
              <select name="lms" defaultValue={cliente.lmsHabitual ?? ''}>
                <option value="">Aún no se sabe</option>
                {OPCIONES_LMS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
                {lmsConocido ? null : <option>{cliente.lmsHabitual}</option>}
              </select>
            </label>
            <label className="casilla">
              <input type="checkbox" name="ingles" defaultChecked={cliente.idiomas.includes('en')} /> También en inglés
            </label>
            <label className="campo">
              Días para borrar los documentos tras la entrega
              <input name="retencion" type="number" min={1} max={3650} required defaultValue={cliente.retencionDocumentosDias} />
            </label>
            <label className="campo">
              Notas
              <textarea name="notas" rows={3} defaultValue={cliente.notas ?? ''} />
            </label>
            {puedeEditar ? (
              <div className="acciones-form">
                <button className="boton primario" type="submit">Guardar</button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </div>
      {VEN_KIT.includes(rol) ? (
        <KitMarca clienteId={cliente.id} rol={rol} conIngles={cliente.idiomas.includes('en')} alGuardar={() => setCliente({ ...cliente, tieneKit: true })} />
      ) : null}
      {VEN_KIT.includes(rol) ? <Glosario clienteId={cliente.id} rol={rol} conIngles={cliente.idiomas.includes('en')} /> : null}
      {VEN_KIT.includes(rol) ? <FichasLms clienteId={cliente.id} rol={rol} /> : null}
    </>
  );
}
