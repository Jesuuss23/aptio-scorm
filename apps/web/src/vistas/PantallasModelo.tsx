// HU-0204 · Pantallas modelo del kit: las diseña el equipo gráfico; sin modelo propio se usa el del estilo base (RN-02-5).
import { type CSSProperties, useEffect, useState } from 'react';
import {
  type DefinicionModelo, DISPOSICIONES, type Disposicion, DISPOSITIVOS, modeloBase, NOMBRE_DISPOSICION, type Paleta, ROLES_COLOR, type RolColor, type ZonaModelo,
} from '@aptio/schema/marca';
import { api, DISENAN_MODELOS, ErrorApi, type PantallaModelo, type Rol } from '../api';

type Dispositivo = (typeof DISPOSITIVOS)[number];
const NOMBRE_ROL_COLOR: Record<RolColor, string> = { primario: 'Primario', secundario: 'Secundario', acento: 'Acento', fondo: 'Fondo', texto: 'Texto' };

/** Lista de modelos por disposición, pintados con el kit en edición (cambian al instante con la paleta). */
export function PantallasModelo({ clienteId, rol, paleta, titulos, textos, hayKit }: {
  clienteId: string; rol: Rol; paleta: Paleta; titulos: string; textos: string; hayKit: boolean;
}) {
  const [modelos, setModelos] = useState<PantallaModelo[] | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<PantallaModelo | 'nuevo' | null>(null);
  const [dispositivo, setDispositivo] = useState<Dispositivo>('celular');
  const puedeDisenar = DISENAN_MODELOS.includes(rol);

  useEffect(() => {
    if (!hayKit) return;
    api.pantallasModelo(clienteId).then(setModelos, (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las pantallas modelo'));
  }, [clienteId, hayKit]);

  async function activar(m: PantallaModelo, activa: boolean) {
    setError('');
    try {
      const r = activa
        ? await api.guardarPantallaModelo(clienteId, { disposicion: m.disposicion, nombre: m.nombre, definicion: m.definicion, orden: m.orden, activa: true }, m.id)
        : (await api.desactivarPantallaModelo(clienteId, m.id), { ...m, activa: false });
      setModelos((lista) => (lista ?? []).map((x) => (x.id === r.id ? r : x)));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cambiar la pantalla modelo');
    }
  }

  const estilo = {
    '--k-primario': paleta.primario, '--k-secundario': paleta.secundario, '--k-acento': paleta.acento,
    '--k-fondo': paleta.fondo, '--k-texto': paleta.texto, '--k-titulos': `'${titulos}', sans-serif`, '--k-textos': `'${textos}', sans-serif`,
  } as CSSProperties;
  const propios = (d: Disposicion) => (modelos ?? []).filter((m) => m.disposicion === d);
  const conPropio = DISPOSICIONES.filter((d) => propios(d).some((m) => m.activa)).length;

  return (
    <section className="modelos" style={estilo} aria-label="Pantallas modelo del kit">
      <div className="kit-cabecera">
        <h3>Pantallas modelo</h3>
        <div className="kit-fila">
          <div className="opciones" role="group" aria-label="Dispositivo">
            {DISPOSITIVOS.map((d) => (
              <button key={d} type="button" className="opcion" aria-pressed={dispositivo === d} onClick={() => setDispositivo(d)}>
                {d === 'celular' ? 'Celular' : 'Escritorio'}
              </button>
            ))}
          </div>
          {puedeDisenar && hayKit ? (
            <button className="boton" type="button" onClick={() => setEditando('nuevo')}>Agregar pantalla modelo</button>
          ) : null}
        </div>
      </div>
      <p className="sec">
        {hayKit ? `${conPropio} de ${DISPOSICIONES.length} disposiciones con modelo propio. ` : 'Guarda el kit para agregar modelos propios. '}
        Las demás usan el estilo base. La IA usa estos modelos como base y los combina.
      </p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {editando ? (
        <EditorModelo
          clienteId={clienteId}
          modelo={editando === 'nuevo' ? null : editando}
          dispositivo={dispositivo}
          alCerrar={() => setEditando(null)}
          alGuardar={(m) => {
            setModelos((lista) => [...(lista ?? []).filter((x) => x.id !== m.id), m]);
            setEditando(null);
          }}
        />
      ) : null}
      <ul className="modelos-rejilla" aria-label="Modelos por disposición">
        {DISPOSICIONES.flatMap((d) => {
          const lista = propios(d);
          if (!lista.length) {
            return [
              <li key={d} className="modelo">
                <Miniatura definicion={modeloBase(d)} dispositivo={dispositivo} />
                <span className="modelo-nombre">{NOMBRE_DISPOSICION[d]}</span>
                <span className="chip">Estilo base</span>
              </li>,
            ];
          }
          return lista.map((m) => (
            <li key={m.id} className={`modelo${m.activa ? '' : ' inactivo'}`} aria-label={m.nombre}>
              <Miniatura definicion={m.definicion} dispositivo={dispositivo} />
              <span className="modelo-nombre">{m.nombre}</span>
              <span className={`chip ${m.activa ? 'validado' : 'aviso'}`}>{m.activa ? 'Activa' : 'Inactiva'}</span>
              {puedeDisenar ? (
                <span className="acciones-form">
                  <button className="boton" type="button" onClick={() => setEditando(m)}>Editar</button>
                  <button className="boton" type="button" onClick={() => void activar(m, !m.activa)}>{m.activa ? 'Desactivar' : 'Activar'}</button>
                </span>
              ) : null}
            </li>
          ));
        })}
      </ul>
    </section>
  );
}

const TEXTO_ZONA: Record<string, string> = {
  titulo: 'Título', subtitulo: 'Subtítulo', personaje: 'Personaje', globo: 'Globo', dato: 'Dato clave', texto: 'Texto',
  icono: 'Ícono', imagen: 'Imagen', lista: 'Lista', tarjetas: 'Tarjetas', juego: 'Zona de juego', situacion: 'Situación',
  opciones: 'Opciones', retroalimentacion: 'Retroalimentación', video: 'Video', marcadores: 'Marcadores', escena: 'Escena',
  puntos: 'Puntos', detalle: 'Detalle', pregunta: 'Pregunta', marcador: 'Puntos y vidas', afirmacion: 'Afirmación',
  botones: 'Mito · Realidad', ideas: 'Ideas', numero: '01', puntaje: '90 %', estrellas: '★★★', insignia: 'Insignia', boton: 'Continuar',
};

/** Un texto del mismo color que el fondo no se lee: pasa al color de fondo (o al de texto si el fondo es el claro). */
const legible = (color: RolColor, fondo: RolColor): RolColor => (color !== fondo ? color : fondo === 'fondo' ? 'texto' : 'fondo');

/**
 * Pinta las zonas en porcentaje del lienzo con los colores del kit; mismo cálculo que hará el reproductor. Con
 * `contenido`, cada zona muestra lo que la IA puso en ella (HU-0406) en lugar del nombre de la zona.
 */
export function Miniatura({ definicion, dispositivo, fondo, contenido }: {
  definicion: DefinicionModelo; dispositivo: Dispositivo; fondo?: RolColor; contenido?: (zona: string) => string | null;
}) {
  const color = fondo ?? definicion.fondo;
  return (
    <div className={`miniatura ${dispositivo}`} style={{ background: `var(--k-${color})` }} aria-hidden="true">
      {definicion[dispositivo].map((z) => {
        const texto = contenido ? contenido(z.zona) : null;
        return (
          <span
            key={z.zona}
            className={`zona zona-${z.tamano ?? 'sm'} zona-${z.alineacion ?? 'inicio'}${texto ? ' llena' : ''}`}
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.ancho}%`, height: `${z.alto}%`, color: `var(--k-${legible(z.color ?? 'texto', color)})` }}
          >
            {texto ?? TEXTO_ZONA[z.zona] ?? z.zona}
          </span>
        );
      })}
    </div>
  );
}

/** Crear o ajustar un modelo: disposición, nombre, fondo y las zonas en porcentaje (desde el marco de Figma). */
function EditorModelo({ clienteId, modelo, dispositivo, alCerrar, alGuardar }: {
  clienteId: string; modelo: PantallaModelo | null; dispositivo: Dispositivo; alCerrar: () => void; alGuardar: (m: PantallaModelo) => void;
}) {
  const [disposicion, setDisposicion] = useState<Disposicion>((modelo?.disposicion as Disposicion | undefined) ?? 'idea');
  const [nombre, setNombre] = useState(modelo?.nombre ?? '');
  const [definicion, setDefinicion] = useState<DefinicionModelo>(modelo?.definicion ?? modeloBase('idea'));
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const zona = (i: number, cambio: Partial<ZonaModelo>) =>
    setDefinicion({ ...definicion, [dispositivo]: definicion[dispositivo].map((z, j) => (j === i ? { ...z, ...cambio } : z)) });

  async function guardar() {
    setGuardando(true);
    setErrores([]);
    try {
      alGuardar(await api.guardarPantallaModelo(clienteId, { disposicion, nombre, definicion, orden: modelo?.orden ?? 0, activa: modelo?.activa ?? true }, modelo?.id));
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles.length) setErrores(e.detalles.map((d) => String(d.error ?? d.mensaje ?? '')));
      else setErrores([e instanceof ErrorApi ? e.message : 'No se pudo guardar']);
    }
    setGuardando(false);
  }

  return (
    <div className="tarjeta modelo-editor" role="group" aria-label={modelo ? `Editar ${modelo.nombre}` : 'Nueva pantalla modelo'}>
      {errores.length ? (
        <div className="nota error" role="alert">
          <ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
      <div className="kit-fila">
        <label className="campo">
          Disposición
          <select
            value={disposicion}
            disabled={Boolean(modelo)}
            onChange={(e) => {
              const d = e.target.value as Disposicion;
              setDisposicion(d);
              setDefinicion(modeloBase(d));
            }}
          >
            {DISPOSICIONES.map((d) => <option key={d} value={d}>{NOMBRE_DISPOSICION[d]}</option>)}
          </select>
        </label>
        <label className="campo">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Idea + ilustración" />
        </label>
        <label className="campo">
          Fondo
          <select value={definicion.fondo} onChange={(e) => setDefinicion({ ...definicion, fondo: e.target.value as RolColor })}>
            {ROLES_COLOR.map((r) => <option key={r} value={r}>{NOMBRE_ROL_COLOR[r]}</option>)}
          </select>
        </label>
      </div>
      <div className="modelo-editor-cuerpo">
        <Miniatura definicion={definicion} dispositivo={dispositivo} />
        <div className="tabla-zonas">
          <table>
            <caption className="sec">Zonas en {dispositivo === 'celular' ? 'celular (9:16)' : 'escritorio (16:9)'}, en % del ancho y del alto</caption>
            <thead>
              <tr><th>Zona</th><th>X</th><th>Y</th><th>Ancho</th><th>Alto</th><th>Color</th></tr>
            </thead>
            <tbody>
              {definicion[dispositivo].map((z, i) => (
                <tr key={z.zona}>
                  <th scope="row">{TEXTO_ZONA[z.zona] ?? z.zona}</th>
                  {(['x', 'y', 'ancho', 'alto'] as const).map((k) => (
                    <td key={k}>
                      <input type="number" min={0} max={100} value={z[k]} aria-label={`${k} de ${z.zona}`} onChange={(e) => zona(i, { [k]: Number(e.target.value) })} />
                    </td>
                  ))}
                  <td>
                    <select value={z.color ?? 'texto'} aria-label={`Color de ${z.zona}`} onChange={(e) => zona(i, { color: e.target.value as RolColor })}>
                      {ROLES_COLOR.map((r) => <option key={r} value={r}>{NOMBRE_ROL_COLOR[r]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="acciones-form">
        <button className="boton primario" type="button" disabled={guardando || nombre.trim().length < 2} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar pantalla modelo'}
        </button>
        <button className="boton" type="button" onClick={alCerrar}>Cancelar</button>
      </div>
    </div>
  );
}
