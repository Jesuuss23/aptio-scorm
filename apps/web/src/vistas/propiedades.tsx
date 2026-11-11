// HU-0602 · Barra contextual y panel de Propiedades del elemento elegido en el editor (CP-057): tamaño A−/A+, colores
// del kit (RN-06-4), alineación y animación de entrada. Los dos usan las mismas acciones; el estado vive en EditorVista.
// HU-0606 · Ocultar o mostrar cualquier elemento; eliminar, la imagen y lo que hace el botón, solo en los extras.
import type { AjusteElemento, ElementoExtra, RolColor } from '@aptio/player';
import type { MarcaPalabra } from '@aptio/schema/tiempos';
import { type KeyboardEvent, useState } from 'react';
import type { CambioTiempo } from './linea-tiempo';
import { ALINEACIONES, ANIMACIONES, type Animacion, COLORES_KIT, controlesDe, ESCALA, TAMANO } from './ajustes-elemento';

export interface AccionesRetoque {
  alTamano: (paso: 1 | -1) => void;
  alTamanoValor: (valor: number) => void;
  alColor: (rol: RolColor) => void;
  alAlinear: (a: NonNullable<AjusteElemento['alineacion']>) => void;
  alAnimar: (a: Animacion) => void;
  alRestablecer: () => void;
  alVerAnimacion: () => void;
  /** HU-0603 · Quita solo el desplazamiento del modo Libre. */
  alVolverASuLugar: () => void;
  /** HU-0606 · Oculta o muestra el elemento (también los bloques del contenido). */
  alOcultar: () => void;
  /** HU-0606 · Solo los extras se eliminan. */
  alEliminar: () => void;
}
interface Elegido {
  nombre: string;
  tipo: string;
  ajuste: AjusteElemento | undefined;
  /** Tamaño que se ve ahora: % del ancho de la pantalla (texto) o escala (imagen y personaje). */
  tamano: number;
  /** HU-0606 · El extra, si el elemento es uno agregado en el editor. */
  extra: ElementoExtra | null;
}
type CambioExtra = Partial<Pick<ElementoExtra, 'recursoId' | 'texto' | 'alClic'>>;

function OcultarEliminar({ elegido, ocupado, acciones }: { elegido: Elegido; ocupado: boolean; acciones: AccionesRetoque }) {
  return (
    <>
      <button type="button" className="boton" disabled={ocupado} onClick={acciones.alOcultar}>{elegido.ajuste?.oculto ? 'Mostrar' : 'Ocultar'}</button>
      {elegido.extra ? <button type="button" className="boton peligro" disabled={ocupado} onClick={acciones.alEliminar}>Eliminar</button> : null}
    </>
  );
}

function Colores({ elegido, paleta, ocupado, alColor }: { elegido: Elegido; paleta: Record<RolColor, string>; ocupado: boolean; alColor: (rol: RolColor) => void }) {
  return (
    <div className="editor-colores" role="group" aria-label="Colores del kit">
      {COLORES_KIT.map(([rol, nombre]) => (
        <button key={rol} type="button" className="editor-color" style={{ background: paleta[rol] }} aria-label={nombre} title={nombre}
          aria-pressed={elegido.ajuste?.color === rol} disabled={ocupado} onClick={() => alColor(rol)} />
      ))}
    </div>
  );
}

/** Barra contextual sobre el lienzo (prototipo: editor › ctx). */
export function BarraElemento({ elegido, paleta, ocupado, acciones }: { elegido: Elegido; paleta: Record<RolColor, string>; ocupado: boolean; acciones: AccionesRetoque }) {
  const c = controlesDe(elegido.tipo);
  const animacion = elegido.ajuste?.animacion ?? 'auto';
  const siguiente = ANIMACIONES[(ANIMACIONES.findIndex(([a]) => a === animacion) + 1) % ANIMACIONES.length]![0];
  return (
    <div className="editor-ctx-barra" role="toolbar" aria-label="Opciones del elemento">
      <b className="editor-ctx-nombre">{elegido.nombre}</b>
      <button type="button" className="boton" disabled={ocupado} aria-label="Más pequeño" onClick={() => acciones.alTamano(-1)}>A−</button>
      <button type="button" className="boton" disabled={ocupado} aria-label="Más grande" onClick={() => acciones.alTamano(1)}>A+</button>
      {c.color ? <Colores elegido={elegido} paleta={paleta} ocupado={ocupado} alColor={acciones.alColor} /> : null}
      {c.alineacion ? (
        <div className="opciones" role="group" aria-label="Alineación">
          {ALINEACIONES.map(([a, nombre]) => (
            <button key={a} type="button" className="opcion" aria-pressed={elegido.ajuste?.alineacion === a} disabled={ocupado} onClick={() => acciones.alAlinear(a)}>{nombre}</button>
          ))}
        </div>
      ) : null}
      <button type="button" className="boton" disabled={ocupado} onClick={() => acciones.alAnimar(siguiente)}>
        Animación: {ANIMACIONES.find(([a]) => a === animacion)?.[1]}
      </button>
      {elegido.ajuste ? <button type="button" className="boton" disabled={ocupado} onClick={acciones.alRestablecer}>Restablecer</button> : null}
      <OcultarEliminar elegido={elegido} ocupado={ocupado} acciones={acciones} />
    </div>
  );
}

/** Panel lateral de Propiedades: los mismos retoques, con un deslizador de tamaño. */
/** HU-0608 · El tiempo del elemento elegido en la línea de tiempo y las palabras de la narración. */
export type TiempoElegido = { inicioS: number; finS: number | null; anclaPalabra?: number | undefined; palabras: MarcaPalabra[]; alCambiar: (c: CambioTiempo) => void };

export function PanelPropiedades({ elegido, paleta, ocupado, modo, acciones, diseno, alCambiarDiseno, imagenes = [], alCambiarExtra, tiempo }: {
  elegido: Elegido | null; paleta: Record<RolColor, string>; ocupado: boolean; modo: 'auto' | 'libre'; acciones: AccionesRetoque;
  /** HU-0606 · Imágenes del curso para un extra «Imagen del kit» y cómo cambiar el extra elegido. */
  imagenes?: { id: string; nombre: string }[]; alCambiarExtra?: (cambio: CambioExtra) => void;
  /** HU-0605 · Nombre del diseño de la pantalla y cómo ir al panel Diseños. */
  diseno: string; alCambiarDiseno: () => void;
  tiempo?: TiempoElegido | null;
}) {
  if (!elegido) {
    return (
      <aside className="tarjeta kit-bloque editor-propiedades" aria-label="Propiedades">
        <h2>Propiedades</h2>
        <div className="campo">
          <span>Diseño</span>
          <div className="fila-aviso">
            <span className="chip">{diseno}</span>
            <button type="button" className="boton" onClick={alCambiarDiseno}>Cambiar</button>
          </div>
        </div>
        <p className="sec">Elige un elemento en el lienzo para cambiarlo: un clic, o Tab hasta él y Espacio.</p>
      </aside>
    );
  }
  const c = controlesDe(elegido.tipo);
  return (
    <aside className="tarjeta kit-bloque editor-propiedades" aria-label="Propiedades">
      <h2>{elegido.nombre}</h2>
      {c.tamano ? <Deslizador key={`${elegido.nombre}-${elegido.tamano}`} tipo={c.tamano} inicial={elegido.tamano} ocupado={ocupado} alCambiar={acciones.alTamanoValor} /> : null}
      {c.color ? (
        <div className="campo">
          <span>Color</span>
          <Colores elegido={elegido} paleta={paleta} ocupado={ocupado} alColor={acciones.alColor} />
        </div>
      ) : null}
      {c.alineacion ? (
        <div className="campo">
          <span>Alineación</span>
          <div className="opciones" role="group" aria-label="Alineación">
            {ALINEACIONES.map(([a, nombre]) => (
              <button key={a} type="button" className="opcion" aria-pressed={elegido.ajuste?.alineacion === a} disabled={ocupado} onClick={() => acciones.alAlinear(a)}>{nombre}</button>
            ))}
          </div>
        </div>
      ) : null}
      {c.animacion ? (
        <div className="campo">
          <span>Animación de entrada</span>
          <div className="opciones" role="group" aria-label="Animación de entrada">
            {ANIMACIONES.map(([a, nombre]) => (
              <button key={a} type="button" className="opcion" aria-pressed={(elegido.ajuste?.animacion ?? 'auto') === a} disabled={ocupado} onClick={() => acciones.alAnimar(a)}>{nombre}</button>
            ))}
          </div>
          <span className="ayuda">«Auto» entra como la disposición; cuándo entra y sale se elige abajo o en la línea de tiempo.</span>
        </div>
      ) : null}
      {c.tamano ? (
        <div className="campo">
          <span>Posición</span>
          <span className="num" aria-label="Desplazamiento">
            {formatoPct(elegido.ajuste?.desplazamiento?.x ?? 0)} / {formatoPct(elegido.ajuste?.desplazamiento?.y ?? 0)} % del ancho
          </span>
          <span className="ayuda">{modo === 'libre' ? 'Arrastra en el lienzo o usa las flechas.' : 'Cambia a Libre para mover.'}</span>
          {elegido.ajuste?.desplazamiento ? (
            <button type="button" className="boton" disabled={ocupado} onClick={acciones.alVolverASuLugar}>Volver a su lugar</button>
          ) : null}
        </div>
      ) : null}
      {tiempo ? <TiempoElemento key={`${elegido.nombre}-${tiempo.inicioS}-${tiempo.finS}`} tiempo={tiempo} ocupado={ocupado} /> : null}
      {elegido.extra && alCambiarExtra ? <DatosExtra key={elegido.extra.id} extra={elegido.extra} imagenes={imagenes} ocupado={ocupado} alCambiar={alCambiarExtra} /> : null}
      <div className="acciones-form">
        <button type="button" className="boton" onClick={acciones.alVerAnimacion}>▶ Ver animación</button>
        {elegido.ajuste ? <button type="button" className="boton" disabled={ocupado} onClick={acciones.alRestablecer}>Restablecer</button> : null}
        <OcultarEliminar elegido={elegido} ocupado={ocupado} acciones={acciones} />
      </div>
    </aside>
  );
}

const numeroDe = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** HU-0608 · Aparece (s), Sale (s) y «Que aparezca cuando Ana dice…»; se guarda al salir del campo o con Enter. */
function TiempoElemento({ tiempo, ocupado }: { tiempo: TiempoElegido; ocupado: boolean }) {
  const [aparece, setAparece] = useState(String(tiempo.inicioS));
  const [sale, setSale] = useState(tiempo.finS === null ? '' : String(tiempo.finS));
  const confirmar = () => {
    const a = numeroDe(aparece);
    const f = numeroDe(sale);
    if (a === null || Number.isNaN(a) || a < 0 || (f !== null && (Number.isNaN(f) || f <= a))) return;
    const cambio: CambioTiempo = {};
    if (a !== tiempo.inicioS) Object.assign(cambio, { retardoS: Math.round(a * 100) / 100, anclaPalabra: undefined });
    if (f !== tiempo.finS) cambio.finS = f === null ? undefined : Math.round(f * 100) / 100;
    if (Object.keys(cambio).length && !ocupado) tiempo.alCambiar(cambio);
  };
  const alEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') confirmar();
  };
  return (
    <fieldset className="campo editor-tiempo">
      <legend>En la línea de tiempo</legend>
      <div className="editor-tiempo-campos">
        <label>Aparece (s)<input type="number" min="0" step="0.1" value={aparece} disabled={ocupado} onChange={(e) => setAparece(e.target.value)} onBlur={confirmar} onKeyDown={alEnter} /></label>
        <label>Sale (s)<input type="number" min="0" step="0.1" value={sale} placeholder="al final" disabled={ocupado} onChange={(e) => setSale(e.target.value)} onBlur={confirmar} onKeyDown={alEnter} /></label>
      </div>
      {tiempo.palabras.length ? (
        <label>Que aparezca cuando Ana dice…
          <select value={tiempo.anclaPalabra ?? ''} disabled={ocupado}
            onChange={(e) => {
              const m = tiempo.palabras.find((p) => String(p.indice) === e.target.value);
              if (m) tiempo.alCambiar({ retardoS: Math.round(m.inicioS * 100) / 100, anclaPalabra: m.indice });
            }}>
            <option value="">Elegir palabra de la narración</option>
            {tiempo.palabras.map((p) => <option key={p.indice} value={p.indice}>{`${p.inicioS.toFixed(1).replace('.', ',')} s · ${p.texto}`}</option>)}
          </select>
        </label>
      ) : null}
    </fieldset>
  );
}

const formatoPct = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 }).replace('.', ',');

/** El deslizador mueve el valor al instante y guarda al soltarlo (o al terminar con las flechas). */
function Deslizador({ tipo, inicial, ocupado, alCambiar }: { tipo: 'texto' | 'escala'; inicial: number; ocupado: boolean; alCambiar: (v: number) => void }) {
  const [valor, setValor] = useState(inicial);
  const r = tipo === 'texto' ? { ...TAMANO, paso: 0.1 } : { ...ESCALA, paso: 0.05 };
  const confirmar = () => {
    if (!ocupado && valor !== inicial) alCambiar(valor);
  };
  return (
    <label className="campo">
      {tipo === 'texto' ? `Tamaño del texto: ${valor.toFixed(1).replace('.', ',')} % del ancho` : `Tamaño: ${Math.round(valor * 100)} %`}
      <input type="range" min={r.min} max={r.max} step={r.paso} value={valor}
        onChange={(e) => setValor(Number(e.target.value))} onPointerUp={confirmar} onKeyUp={confirmar} onBlur={confirmar} />
    </label>
  );
}

/** HU-0606 · Lo propio de un extra: qué hace el botón (por ahora «Siguiente» o «Nada», SUP-45) y la imagen del curso con su texto alternativo. */
function DatosExtra({ extra, imagenes, ocupado, alCambiar }: { extra: ElementoExtra; imagenes: { id: string; nombre: string }[]; ocupado: boolean; alCambiar: (c: CambioExtra) => void }) {
  const [alt, setAlt] = useState(extra.texto?.es ?? '');
  if (extra.tipo === 'boton') {
    return (
      <label className="campo">
        Al hacer clic
        <select value={extra.alClic === 'siguiente' ? 'siguiente' : 'nada'} disabled={ocupado} onChange={(e) => alCambiar({ alClic: e.target.value as 'siguiente' | 'nada' })}>
          <option value="siguiente">Ir a la pantalla siguiente</option>
          <option value="nada">Nada</option>
        </select>
      </label>
    );
  }
  if (extra.tipo !== 'imagen') return null;
  const guardarAlt = () => {
    const limpio = alt.replace(/\s+/g, ' ').trim();
    if (limpio && limpio !== (extra.texto?.es ?? '')) alCambiar({ texto: { ...extra.texto, es: limpio } });
  };
  return (
    <>
      <label className="campo">
        Imagen
        <select value={extra.recursoId ?? ''} disabled={ocupado} onChange={(e) => alCambiar({ recursoId: e.target.value || undefined })}>
          <option value="">Sin imagen (marco)</option>
          {imagenes.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
        </select>
        {imagenes.length ? null : <span className="ayuda">El curso aún no tiene imágenes; subirlas llega con el panel Imágenes.</span>}
      </label>
      <label className="campo">
        Texto alternativo
        <input type="text" value={alt} disabled={ocupado} onChange={(e) => setAlt(e.target.value)} onBlur={guardarAlt}
          onKeyDown={(e) => { if (e.key === 'Enter') guardarAlt(); }} />
      </label>
    </>
  );
}
