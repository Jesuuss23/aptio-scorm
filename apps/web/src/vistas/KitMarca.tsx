// HU-0202 · Kit de marca con vista previa en vivo (CP-020) y advertencia de contraste que no bloquea (CP-021).
import './fuentes-kit';
import { type CSSProperties, useEffect, useState } from 'react';
import { BOCAS, ESTILOS_KIT, FUENTES_KIT, KIT_INICIAL, type Paleta, revisarPaleta, type RolColor } from '@aptio/schema/marca';
import { PantallasModelo } from './PantallasModelo';
import { api, EDITAN_KIT, ErrorApi, type Kit, type KitEntrada, type Rol, type Voz } from '../api';

const NOMBRE_COLOR: Record<RolColor, string> = {
  primario: 'Primario',
  acento: 'Acento',
  secundario: 'Secundario',
  fondo: 'Fondo',
  texto: 'Texto',
};
const ORDEN_COLORES: RolColor[] = ['primario', 'acento', 'secundario', 'fondo', 'texto'];
const MIME_LOGO = 'image/png,image/jpeg,image/webp';
const coma = (n: number) => n.toFixed(1).replace('.', ',');

const borrador = (k: Kit | null): KitEntrada =>
  k
    ? { estilo: k.estilo, paleta: k.paleta, tipografias: k.tipografias, logoRecursoId: k.logoRecursoId, voces: k.voces, version: k.version }
    : { ...KIT_INICIAL, voces: { ...KIT_INICIAL.voces } as KitEntrada['voces'], logoRecursoId: null, version: 0 };

export function KitMarca({ clienteId, rol, conIngles, alGuardar }: { clienteId: string; rol: Rol; conIngles: boolean; alGuardar: () => void }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [datos, setDatos] = useState<KitEntrada | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'guardando' | 'subiendo'>('cargando');
  const [error, setError] = useState('');
  const [conflicto, setConflicto] = useState(false);
  const [aviso, setAviso] = useState('');
  const puedeEditar = EDITAN_KIT.includes(rol);

  function aplicar(k: Kit | null) {
    setKit(k);
    setDatos(borrador(k));
    setLogoUrl(k?.logoUrl);
    setConflicto(false);
    setEstado('listo');
  }
  function fallo(e: unknown) {
    if (e instanceof ErrorApi && e.codigo === 'SIN_KIT') return aplicar(null);
    setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el kit');
    setEstado('listo');
  }

  useEffect(() => {
    api.kit(clienteId).then(aplicar, fallo);
  }, [clienteId]);

  function recargar() {
    setEstado('cargando');
    setError('');
    api.kit(clienteId).then(aplicar, fallo);
  }

  if (!datos) {
    return (
      <section className="tarjeta" aria-label="Kit de marca">
        <h2>Kit de marca</h2>
        {error ? <div className="nota error" role="alert">{error}</div> : <p className="sec" role="status">Cargando…</p>}
      </section>
    );
  }

  const revision = revisarPaleta(datos.paleta);
  const cambiar = (c: Partial<KitEntrada>) => {
    setDatos({ ...datos, ...c });
    setAviso('');
  };
  const color = (rolColor: RolColor, valor: string) => cambiar({ paleta: { ...datos.paleta, [rolColor]: valor.toUpperCase() } });
  const voz = (idioma: 'es' | 'en', c: Partial<Voz>) =>
    cambiar({ voces: { ...datos.voces, [idioma]: { proveedor: 'google', voz: '', velocidad: 1, ...datos.voces[idioma], ...c } } });

  async function subirLogo(archivo: File | undefined) {
    if (!archivo || !datos) return;
    setEstado('subiendo');
    setError('');
    try {
      const r = await api.subir(archivo, { clienteId, origen: 'SUBIDO' });
      cambiar({ logoRecursoId: r.id });
      setLogoUrl(r.url);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo subir el logo');
    }
    setEstado('listo');
  }

  async function guardar() {
    if (!datos) return;
    setEstado('guardando');
    setError('');
    setAviso('');
    try {
      const k = await api.guardarKit(clienteId, datos);
      aplicar(k);
      setAviso(k.advertencias.length ? 'Kit guardado con advertencias' : 'Kit guardado');
      alGuardar();
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) setConflicto(true);
      else setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el kit');
    }
    setEstado('listo');
  }

  const ocupado = estado !== 'listo';
  return (
    <section className="tarjeta kit" aria-label="Kit de marca">
      <div className="kit-cabecera">
        <h2>Kit de marca</h2>
        {kit ? <span className="chip validado">Versión {kit.version}</span> : <span className="chip aviso">Sin kit: propuesta inicial</span>}
      </div>
      {conflicto ? (
        <div className="nota aviso kit-conflicto" role="alert">
          Otra persona guardó el kit mientras lo editabas. Recarga para ver sus cambios; los tuyos no se guardaron.
          <button className="boton" type="button" onClick={recargar}>Recargar</button>
        </div>
      ) : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}

      <div className="kit-columnas">
        <fieldset className="sin-borde kit-campos" disabled={!puedeEditar || ocupado}>
          <div className="kit-bloque">
            <h3>Paleta</h3>
            <div className="kit-colores">
              {ORDEN_COLORES.map((c) => (
                <label key={c} className="campo kit-color">
                  {NOMBRE_COLOR[c]}
                  <input type="color" value={datos.paleta[c].toLowerCase()} onChange={(e) => color(c, e.target.value)} aria-label={`Color ${NOMBRE_COLOR[c].toLowerCase()}`} />
                  <span className="num">{datos.paleta[c]}</span>
                </label>
              ))}
            </div>
            <p className="sec" aria-live="polite">
              Contraste texto/fondo <b className="num">{coma(revision.textoFondo)}:1</b>{' '}
              {revision.cumpleAA ? <span className="chip validado">✓ AA</span> : <span className="chip aviso">menor a 4,5:1</span>}
            </p>
            {revision.advertencias.map((a) => (
              <div key={a.colores.join('-')} className="nota aviso">
                {a.mensaje}. Puedes guardar igual: la marca del cliente manda, pero el texto se leerá con dificultad.
              </div>
            ))}
          </div>

          <div className="kit-bloque">
            <h3>Estilo y tipografías</h3>
            <div className="opciones" role="group" aria-label="Estilo base">
              {ESTILOS_KIT.map((e) => (
                <button key={e} type="button" className="opcion" aria-pressed={datos.estilo === e} onClick={() => cambiar({ estilo: e })}>
                  {e}
                </button>
              ))}
            </div>
            <div className="kit-fila">
              {(['titulos', 'textos'] as const).map((uso) => (
                <label key={uso} className="campo">
                  {uso === 'titulos' ? 'Títulos' : 'Textos'}
                  <select value={datos.tipografias[uso]} onChange={(e) => cambiar({ tipografias: { ...datos.tipografias, [uso]: e.target.value } })}>
                    {FUENTES_KIT.map((f) => (
                      <option key={f.id}>{f.familia}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="sec">Fuentes con licencia SIL Open Font License, incluidas en el paquete.</p>
          </div>

          <div className="kit-bloque">
            <h3>Logo</h3>
            <div className="kit-logo">
              {logoUrl ? <img src={logoUrl} alt="Logo del cliente" /> : <span className="sec">Sin logo</span>}
              <label className="boton">
                {estado === 'subiendo' ? 'Subiendo…' : datos.logoRecursoId ? 'Cambiar logo' : 'Subir logo'}
                <input className="sr" type="file" accept={MIME_LOGO} onChange={(e) => void subirLogo(e.target.files?.[0])} aria-label="Archivo del logo" />
              </label>
              {datos.logoRecursoId ? (
                <button className="boton" type="button" onClick={() => { cambiar({ logoRecursoId: null }); setLogoUrl(undefined); }}>Quitar</button>
              ) : null}
            </div>
            <p className="sec">PNG, JPEG o WebP de hasta 20 MB.</p>
          </div>

          <PersonajeKit
            clienteId={clienteId}
            kit={kit}
            alGuardar={(k) => {
              // Solo cambia el personaje y la versión: lo demás que estés editando se conserva.
              setKit(k);
              setDatos({ ...datos, version: k.version });
            }}
            alConflicto={() => setConflicto(true)}
          />

          <div className="kit-bloque">
            <h3>Voz</h3>
            {(conIngles ? (['es', 'en'] as const) : (['es'] as const)).map((idioma) => (
              <div key={idioma} className="kit-fila">
                <label className="campo">
                  Voz {idioma.toUpperCase()}
                  <input value={datos.voces[idioma]?.voz ?? ''} placeholder={idioma === 'es' ? 'es-US-Neural2-A' : 'en-US-Neural2-F'} onChange={(e) => voz(idioma, { voz: e.target.value })} />
                </label>
                <label className="campo">
                  Velocidad
                  <input type="number" min={0.5} max={2} step={0.05} value={datos.voces[idioma]?.velocidad ?? 1} onChange={(e) => voz(idioma, { velocidad: Number(e.target.value) })} />
                </label>
              </div>
            ))}
            <p className="sec">Google Text-to-Speech por defecto. La muestra de voz se escucha desde el glosario.</p>
          </div>

          {puedeEditar ? (
            <div className="acciones-form">
              <button className="boton primario" type="button" onClick={() => void guardar()} disabled={ocupado}>
                {estado === 'guardando' ? 'Guardando…' : kit ? 'Guardar kit' : 'Crear kit'}
              </button>
            </div>
          ) : (
            <p className="sec">Tu rol puede ver el kit; lo editan diseño gráfico, diseño instruccional y administración.</p>
          )}
        </fieldset>

        <VistaPrevia paleta={datos.paleta} titulos={datos.tipografias.titulos} textos={datos.tipografias.textos} logoUrl={logoUrl} />
      </div>
      <PantallasModelo clienteId={clienteId} rol={rol} paleta={datos.paleta} titulos={datos.tipografias.titulos} textos={datos.tipografias.textos} hayKit={Boolean(kit)} />
    </section>
  );
}

/** Personaje SVG del kit (HU-0203): se sanea al subirlo y se revisa qué bocas tiene (CP-023, CP-024). */
function PersonajeKit({ clienteId, kit, alGuardar, alConflicto }: { clienteId: string; kit: Kit | null; alGuardar: (k: Kit) => void; alConflicto: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [saneado, setSaneado] = useState<string[]>([]);
  const p = kit?.personaje ?? null;

  async function subir(archivo: File | undefined) {
    if (!archivo || !kit) return;
    setSubiendo(true);
    setError('');
    setErrores([]);
    try {
      const r = await api.subir(archivo, { clienteId, origen: 'SUBIDO' });
      setSaneado(r.eliminadosAlSanear ?? []);
      alGuardar(await api.guardarPersonaje(clienteId, { recursoId: r.id, nombre: archivo.name.replace(/\.svg$/i, ''), version: kit.version }));
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) alConflicto();
      else if (e instanceof ErrorApi && e.codigo === 'PERSONAJE_INCOMPLETO') {
        setError(e.message);
        setErrores(e.detalles.map((d) => String(d.error ?? '')).filter(Boolean));
      } else setError(e instanceof ErrorApi ? e.message : 'No se pudo subir el personaje');
    }
    setSubiendo(false);
  }

  return (
    <div className="kit-bloque" aria-label="Personaje" role="group">
      <h3>Personaje</h3>
      {error ? (
        <div className="nota error" role="alert">
          {error}
          {errores.length ? <ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul> : null}
        </div>
      ) : null}
      {saneado.length ? <div className="nota aviso">Se quitó del SVG por seguridad: {saneado.join(', ')}.</div> : null}
      <div className="kit-personaje">
        {p?.url ? <img src={p.url} alt={`Personaje ${p.nombre}`} /> : null}
        <div className="kit-bloque">
          {p ? <b>{p.nombre}</b> : <span className="sec">{kit ? 'Sin personaje' : 'Guarda el kit antes de subir el personaje'}</span>}
          {p ? (
            <ul className="fila-chips" aria-label="Bocas">
              {BOCAS.map((b) => (
                <li key={b} className={`chip ${p.bocasFaltantes.includes(b) ? 'aviso' : 'validado'}`}>
                  {b} {p.bocasFaltantes.includes(b) ? 'falta' : '✓'}
                </li>
              ))}
            </ul>
          ) : null}
          {p?.avisos.map((a) => <p key={a} className="sec">{a}</p>)}
          <label className="boton">
            {subiendo ? 'Subiendo…' : p ? 'Cambiar personaje' : 'Subir personaje SVG'}
            <input className="sr" type="file" accept="image/svg+xml" disabled={!kit || subiendo} onChange={(e) => void subir(e.target.files?.[0])} aria-label="Archivo del personaje" />
          </label>
        </div>
      </div>
      <p className="sec">SVG con las capas de la guía de diseño: bocas A–F y X obligatorias; G y H recomendadas.</p>
    </div>
  );
}

/** Pantallas base pintadas con el kit en edición: cambian al instante, sin guardar ni recargar (CP-020, RN-02-1). */
function VistaPrevia({ paleta, titulos, textos, logoUrl }: { paleta: Paleta; titulos: string; textos: string; logoUrl: string | undefined }) {
  const estilo = {
    '--k-primario': paleta.primario,
    '--k-secundario': paleta.secundario,
    '--k-acento': paleta.acento,
    '--k-fondo': paleta.fondo,
    '--k-texto': paleta.texto,
    '--k-titulos': `'${titulos}', sans-serif`,
    '--k-textos': `'${textos}', sans-serif`,
  } as CSSProperties;
  return (
    <div className="kit-vista" style={estilo} aria-label="Vista previa con el kit" role="region">
      <h3>Vista previa</h3>
      <div className="kit-pantallas">
        <figure className="kp kp-portada" data-pantalla="portada">
          {logoUrl ? <img className="kp-logo" src={logoUrl} alt="" /> : null}
          <span className="kp-titulo">Bloqueo y etiquetado</span>
          <span className="kp-texto">Cápsula de 6 minutos</span>
          <span className="kp-boton">Comenzar</span>
          <figcaption>Portada</figcaption>
        </figure>
        <figure className="kp kp-idea" data-pantalla="idea">
          <span className="kp-titulo">Antes de intervenir</span>
          <span className="kp-dato">Corta la energía y coloca tu candado</span>
          <span className="kp-texto">Así nadie arranca el equipo por error.</span>
          <figcaption>Idea clave</figcaption>
        </figure>
        <figure className="kp kp-quiz" data-pantalla="quiz">
          <span className="kp-titulo">¿Qué haces primero?</span>
          <span className="kp-opcion">Aviso al supervisor</span>
          <span className="kp-opcion kp-elegida">Corto la energía</span>
          <span className="kp-opcion">Retiro la guarda</span>
          <figcaption>Pregunta</figcaption>
        </figure>
      </div>
      <p className="sec">Más abajo, las pantallas modelo del cliente con estos mismos colores.</p>
    </div>
  );
}
