// HU-0206 · «✦ Extraer de un curso anterior» (CP-028): el ZIP de un curso anterior o el PDF del manual de marca se sube
// como material del cliente, el worker lee colores y tipografías sin ejecutar nada e IA-18 propone el kit. «Aplicar»
// llena el formulario del kit sin guardar (la vista previa y las pantallas modelo cambian al instante); se guarda con
// «Guardar kit», con el mismo bloqueo de versión. «Descartar» deja de ofrecerla.
import { useEffect, useRef, useState } from 'react';
import { ROLES_COLOR, type RolColor } from '@aptio/schema/marca';
import { api, ErrorApi, type PropuestaKit } from '../api';

const CONSULTA_MS = 1000;
const ACEPTA = '.zip,.pdf,application/zip,application/x-zip-compressed,application/pdf';
const NOMBRE: Record<RolColor, string> = { primario: 'Primario', secundario: 'Secundario', acento: 'Acento', fondo: 'Fondo', texto: 'Texto' };
const ESQUINAS: Record<string, string> = { rectas: 'esquinas rectas', suaves: 'esquinas suaves', redondeadas: 'esquinas redondeadas' };
const ILUSTRACION: Record<string, string> = { plana: 'ilustración plana', lineal: 'ilustración lineal', isometrica: 'ilustración isométrica', semirrealista: 'ilustración semirrealista', fotografia: 'fotografía' };

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);

/** El navegador no siempre da el tipo de un ZIP (o da `application/x-zip-compressed`): se decide por la extensión. */
function comoMaterial(archivo: File): File | null {
  const nombre = archivo.name.toLowerCase();
  const mime = nombre.endsWith('.zip') ? 'application/zip' : nombre.endsWith('.pdf') ? 'application/pdf' : null;
  if (!mime) return null;
  return archivo.type === mime ? archivo : new File([archivo], archivo.name, { type: mime });
}

export function PropuestaKitPanel({ clienteId, deshabilitado, alAplicar }: {
  clienteId: string;
  deshabilitado: boolean;
  alAplicar: (p: NonNullable<PropuestaKit['propuesta']>) => void;
}) {
  const [propuesta, setPropuesta] = useState<PropuestaKit | null>(null);
  const [subiendo, setSubiendo] = useState('');
  const [error, setError] = useState('');
  const [aplicada, setAplicada] = useState('');
  const vigente = useRef(clienteId);

  useEffect(() => {
    // Un cliente distinto monta un panel nuevo (key en KitMarca): aquí solo se carga su propuesta.
    vigente.current = clienteId;
    api.propuestaKit(clienteId).then((p) => vigente.current === clienteId && setPropuesta(p), () => undefined);
  }, [clienteId]);

  // Mientras el worker trabaja, se consulta la propuesta hasta que esté lista o falle.
  const procesando = propuesta?.estado === 'procesando';
  useEffect(() => {
    if (!procesando) return;
    const t = setInterval(() => {
      api.propuestaKit(clienteId).then((p) => vigente.current === clienteId && setPropuesta(p), () => undefined);
    }, CONSULTA_MS);
    return () => clearInterval(t);
  }, [procesando, clienteId]);

  async function extraer(entrada: File | undefined) {
    if (!entrada) return;
    setError('');
    setAplicada('');
    const archivo = comoMaterial(entrada);
    if (!archivo) return setError('Sube el ZIP de un curso anterior o el manual de marca en PDF');
    setSubiendo(archivo.name);
    try {
      const r = await api.subir(archivo, { clienteId, origen: 'CLIENTE' });
      await api.extraerKit(clienteId, r.id);
      setPropuesta(await api.propuestaKit(clienteId));
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo extraer el kit'));
    }
    setSubiendo('');
  }

  async function descartar() {
    setError('');
    try {
      await api.descartarPropuestaKit(clienteId);
      setPropuesta(null);
      setAplicada('');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo descartar la propuesta'));
    }
  }

  const p = propuesta?.estado === 'lista' ? propuesta.propuesta : undefined;
  const ocupado = deshabilitado || Boolean(subiendo) || procesando;
  return (
    <div className="kit-bloque kit-propuesta" role="region" aria-label="Propuesta del kit">
      <div className="kit-propuesta-cabecera">
        <h3>Desde un curso anterior</h3>
        <label className={`boton${ocupado ? ' deshabilitado' : ''}`}>
          {subiendo ? 'Subiendo…' : '✦ Extraer de un curso anterior'}
          <input className="sr" type="file" accept={ACEPTA} disabled={ocupado} onChange={(e) => { void extraer(e.target.files?.[0]); e.target.value = ''; }} aria-label="Curso anterior (ZIP) o manual de marca (PDF)" />
        </label>
      </div>
      <p className="sec">Sube el ZIP de un curso anterior o el manual de marca en PDF: se leen sus colores y tipografías, sin ejecutar nada del archivo.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {subiendo || procesando ? (
        <p className="nota" role="status">Leyendo colores y tipografías de {subiendo || propuesta?.nombreArchivo}…</p>
      ) : null}
      {propuesta?.estado === 'error' ? (
        <div className="nota error" role="alert">
          No se pudo proponer el kit desde {propuesta.nombreArchivo}: {propuesta.error?.mensaje}
        </div>
      ) : null}
      {aplicada ? <div className="nota validado" role="status">{aplicada}</div> : null}
      {p && propuesta && !aplicada ? (
        <div className="kit-propuesta-cuerpo">
          <p className="sec">
            Propuesta desde <b>{propuesta.nombreArchivo}</b> · confianza <span className="num">{Math.round(p.confianza * 100)} %</span>
            {p.contrasteOk ? <span className="chip validado">✓ Contraste AA</span> : null}
          </p>
          <ul className="kit-propuesta-colores" aria-label="Paleta propuesta">
            {ROLES_COLOR.map((rol) => (
              <li key={rol}>
                <span className="kit-muestra" style={{ background: p.paleta[rol] }} aria-hidden="true" />
                <span>{NOMBRE[rol]}</span>
                <span className="num">{p.paleta[rol]}</span>
              </li>
            ))}
          </ul>
          <p>
            Títulos <b>{p.tipografias.titulos}</b> · Textos <b>{p.tipografias.texto}</b>
          </p>
          {propuesta.avisosTipografia.map((a) => (
            <div key={a} className="nota aviso">{a}</div>
          ))}
          <p>
            Estilo <b>{p.estilo.kit}</b> · {ILUSTRACION[p.estilo.ilustracion] ?? p.estilo.ilustracion}, {ESQUINAS[p.estilo.esquinas] ?? p.estilo.esquinas}. {p.estilo.tono}
          </p>
          <details>
            <summary>Evidencias</summary>
            <ul className="kit-propuesta-evidencias">
              {p.evidencias.map((ev) => <li key={ev}>{ev}</li>)}
              {propuesta.evidencias ? (
                <li>
                  Colores encontrados: {propuesta.evidencias.colores.slice(0, 6).map((c) => `${c.valor} ×${c.veces}`).join(', ')}
                  {propuesta.evidencias.fuentes.length ? `. Tipografías: ${propuesta.evidencias.fuentes.map((f) => f.valor).join(', ')}` : ''}
                </li>
              ) : null}
              {propuesta.evidencias?.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </details>
          <div className="acciones-form">
            <button className="boton primario" type="button" disabled={deshabilitado} onClick={() => { alAplicar(p); setAplicada('Propuesta aplicada al formulario: revísala y guarda el kit para conservarla.'); }}>
              Aplicar
            </button>
            <button className="boton" type="button" disabled={deshabilitado} onClick={() => void descartar()}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
