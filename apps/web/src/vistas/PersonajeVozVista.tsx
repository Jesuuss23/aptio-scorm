// HU-0704 · Personaje y voz (PNT de docs/diseno/prototipo-unificado.html, CP-074, REQ-023, REQ-024, RN-07-4): las
// narraciones en español del curso con Ana diciendo la que suena, y la tarjeta «Audio del cliente». Con un audio del
// cliente ya transcrito se puede limpiar el ruido (antes y después para elegir), re-locutarlo con la voz del kit (la
// transcripción pasa al texto de la narración, con «↶ Deshacer») o usarlo tal cual con la boca automática: exige marcar
// «El cliente autorizó usar esta grabación». La narración queda «Grabación del cliente» y «Lista» cuando el worker deja
// su audio, su boca y sus subtítulos; la voz de la IA ya no la regenera.
import type { ColoresUniforme, MarcasBoca } from '@aptio/player';
import { rotuloGrabacion } from '@aptio/schema/grabacion';
import { Cabecera } from '@aptio/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AudioCliente, type Curso, EDITAN_PANTALLAS, ErrorApi, type Narracion, type Proyecto, type Rol } from '../api';
import { navegar } from '../ruta';
import { AnaHablando } from './VozVista';

type Pista = { estado: string; voz?: { proveedor: string }; bocas?: MarcasBoca };
type PantallaDoc = { id: string; titulo: { es?: string }; narracion?: { texto: { es?: string }; porIdioma: { es?: Pista } } };
type Doc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[] };

/** Consulta del trabajo cada 1,5 s, hasta 2 minutos. */
const CADA_MS = 1500;
const LIMITE_MS = 120_000;
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);
const narradas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)).filter((p) => p.narracion?.texto.es?.trim() && p.narracion.porIdioma.es);
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

/** Lo que dice el chip de la narración. */
function estadoNarracion(n: Pick<Narracion, 'estado'> | undefined): { texto: string; tono: 'validado' | 'aviso' | 'error' | 'ia' } {
  if (!n || n.estado === 'ACTUALIZADA') return { texto: 'Lista', tono: 'validado' };
  if (n.estado === 'GENERANDO') return { texto: 'Procesando…', tono: 'ia' };
  if (n.estado === 'ERROR') return { texto: 'Error', tono: 'error' };
  return { texto: 'Por regenerar', tono: 'aviso' };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PersonajeVozVista({ proyectoId, pantallaId, rol, alCargar }: { proyectoId: string; pantallaId: string | null; rol: Rol; alCargar: (nombre: string) => void }) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [narraciones, setNarraciones] = useState<Map<string, Narracion>>(new Map());
  const [audios, setAudios] = useState<AudioCliente[]>([]);
  const [colores, setColores] = useState<ColoresUniforme>({});
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [sonando, setSonando] = useState<{ pantallaId: string; audio: HTMLAudioElement } | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [elegida, setElegida] = useState(pantallaId ?? '');
  const [autorizado, setAutorizado] = useState(false);
  const [version, setVersion] = useState<'original' | 'limpio'>('original');
  const [deshacer, setDeshacer] = useState<{ pantallaId: string; texto: string } | null>(null);
  const vigente = useRef(true);
  const puedeEditar = EDITAN_PANTALLAS.includes(rol);

  const cargarCurso = useCallback(async () => {
    const c = await api.curso(proyectoId);
    if (!vigente.current) return null;
    setCurso(c);
    const [lista, aud] = await Promise.all([api.narraciones(c.id), puedeEditar ? api.audiosCliente(c.id) : Promise.resolve([])]);
    if (!vigente.current) return null;
    setNarraciones(new Map(lista.map((n) => [n.pantallaId, n])));
    setAudios(aud);
    setMaterialId((m) => m || aud[0]?.materialId || '');
    setElegida((p) => p || narradas(c.documento as unknown as Doc)[0]?.id || '');
    return c;
  }, [proyectoId, puedeEditar]);

  useEffect(() => {
    vigente.current = true;
    api.proyecto(proyectoId).then(
      (p) => {
        if (!vigente.current) return;
        setProyecto(p);
        alCargar(p.nombre);
        api.kit(p.clienteId).then((k) => vigente.current && setColores({ primario: k.paleta.primario, secundario: k.paleta.secundario, acento: k.paleta.acento }), () => undefined);
        cargarCurso().catch((e: unknown) => {
          if (!vigente.current) return;
          if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
          else setError(mensajeDe(e, 'No se pudo cargar el curso'));
        });
      },
      (e: unknown) => vigente.current && setError(mensajeDe(e, 'No se pudo cargar el proyecto')),
    );
    return () => { vigente.current = false; };
  }, [proyectoId, alCargar, cargarCurso]);

  const volver = <a className="boton" href={`/proyectos/${proyectoId}`} onClick={(e) => { e.preventDefault(); navegar(`/proyectos/${proyectoId}`); }}>Volver al proyecto</a>;
  if (error && !curso) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <>
        <Cabecera titulo="Personaje y voz" subtitulo={proyecto?.nombre} accion={volver} />
        <p className="sec">El curso todavía no tiene pantallas. Genera el SCORM y vuelve aquí para escuchar las narraciones.</p>
      </>
    );
  }
  if (!proyecto || !curso) return <p className="sec" role="status">Cargando las narraciones…</p>;

  const doc = curso.documento as unknown as Doc;
  const pantallas = narradas(doc);
  const audio = audios.find((a) => a.materialId === materialId);
  const limpio = audio?.limpieza?.estado === 'listo' && audio.limpieza.url ? audio.limpieza : null;
  const svg = Object.values(curso.svgPersonajes ?? {})[0];
  const bocasDe = (id: string) => pantallas.find((p) => p.id === id)?.narracion?.porIdioma.es?.bocas;
  const alSonar = (id: string, el: HTMLAudioElement) => {
    if (sonando && sonando.audio !== el) sonando.audio.pause();
    setSonando({ pantallaId: id, audio: el });
  };

  /** Espera a que el worker termine con la narración de la pantalla (GENERANDO → Lista o Error). */
  async function esperarNarracion(cursoId: string, id: string) {
    const fin = Date.now() + LIMITE_MS;
    while (vigente.current && Date.now() < fin) {
      await esperar(CADA_MS);
      const n = (await api.narraciones(cursoId)).find((x) => x.pantallaId === id);
      if (n && n.estado !== 'GENERANDO') return n;
    }
    return null;
  }

  async function usar() {
    if (!audio || !elegida) return;
    setOcupado(true);
    setError('');
    setAviso('');
    setDeshacer(null);
    try {
      await api.usarGrabacion(curso!.id, elegida, { materialId: audio.materialId, autorizado, usarLimpio: version === 'limpio', version: curso!.version });
      setAviso(`Procesando la grabación para ${elegida}: audio, boca y subtítulos…`);
      await cargarCurso();
      const n = await esperarNarracion(curso!.id, elegida);
      await cargarCurso();
      if (n?.estado === 'ACTUALIZADA') setAviso(`La narración de ${elegida} ya es la grabación del cliente, con boca automática y subtítulos.`);
      else setError(n ? `La grabación de ${elegida} no se pudo procesar. Vuelve a intentarlo.` : 'La grabación sigue procesándose; vuelve en un momento.');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo usar la grabación'));
    } finally {
      setOcupado(false);
    }
  }

  async function limpiar() {
    if (!audio) return;
    setOcupado(true);
    setError('');
    setAviso('Limpiando el ruido y normalizando el volumen…');
    try {
      await api.limpiarAudio(audio.materialId);
      const fin = Date.now() + LIMITE_MS;
      let actual: AudioCliente | undefined;
      while (vigente.current && Date.now() < fin) {
        actual = (await api.audiosCliente(curso!.id)).find((a) => a.materialId === audio.materialId);
        if (actual?.limpieza?.estado !== 'procesando') break;
        await esperar(CADA_MS);
      }
      setAudios(await api.audiosCliente(curso!.id));
      if (actual?.limpieza?.estado === 'listo') {
        setVersion('limpio');
        setAviso('Audio limpio listo: escucha el antes y el después y elige cuál usar.');
      } else {
        setAviso('');
        setError(actual?.limpieza?.error ?? 'La limpieza sigue en curso; vuelve en un momento.');
      }
    } catch (e) {
      setAviso('');
      setError(mensajeDe(e, 'No se pudo limpiar el audio'));
    } finally {
      setOcupado(false);
    }
  }

  async function relocutar() {
    if (!audio || !elegida) return;
    setOcupado(true);
    setError('');
    try {
      const r = await api.relocutar(curso!.id, elegida, { materialId: audio.materialId, version: curso!.version });
      setDeshacer({ pantallaId: elegida, texto: r.textoAnterior ?? '' });
      setAviso(`La transcripción es ahora la narración de ${elegida}; se dirá con la voz del kit.`);
      await cargarCurso();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo re-locutar'));
    } finally {
      setOcupado(false);
    }
  }

  async function revertir() {
    if (!deshacer) return;
    setOcupado(true);
    setError('');
    try {
      await api.editarPantalla(curso!.id, deshacer.pantallaId, { version: curso!.version, narracion: { es: deshacer.texto }, motivo: 'deshacer' });
      setAviso(`Se deshizo la re-locución de ${deshacer.pantallaId}.`);
      setDeshacer(null);
      await cargarCurso();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo deshacer'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Cabecera titulo="Personaje y voz" subtitulo={`${proyecto.nombre} · la boca de Ana se sincroniza sola, con la voz del kit o con una grabación del cliente`} accion={volver} />
      <div className="voz-pagina">
        <div className="voz-columna">
          {puedeEditar ? (
            <section className="tarjeta voz-cliente" aria-labelledby="audio-cliente-titulo">
              <h2 id="audio-cliente-titulo">Audio del cliente</h2>
              {!audios.length ? (
                <p className="sec">Aún no hay audios del cliente transcritos. Súbelos en «Material del cliente» y vuelve cuando estén listos.</p>
              ) : (
                <>
                  <div className="voz-cliente-campos">
                    <label className="campo">
                      Audio
                      <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setVersion('original'); }} disabled={ocupado}>
                        {audios.map((a) => <option key={a.materialId} value={a.materialId}>{rotuloGrabacion(a.nombre, a.duracionS)}</option>)}
                      </select>
                    </label>
                    <label className="campo">
                      Pantalla
                      <select value={elegida} onChange={(e) => setElegida(e.target.value)} disabled={ocupado}>
                        {pantallas.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.titulo.es ?? p.id}</option>)}
                      </select>
                    </label>
                  </div>
                  {audio ? <p className="voz-texto sec">«{audio.texto}»</p> : null}
                  <div className="voz-comparar" role="group" aria-label="Antes y después">
                    <div>
                      <span className="sec">Antes · original</span>
                      {audio ? <audio controls preload="none" src={audio.url} aria-label="Escuchar el audio original" /> : null}
                    </div>
                    {limpio ? (
                      <div>
                        <span className="sec">Después · limpio</span>
                        <audio controls preload="none" src={limpio.url} aria-label="Escuchar el audio limpio" />
                      </div>
                    ) : null}
                  </div>
                  {limpio ? (
                    <fieldset className="voz-version">
                      <legend>Versión a usar</legend>
                      <label><input type="radio" name="version-audio" checked={version === 'original'} onChange={() => setVersion('original')} disabled={ocupado} /> Original</label>
                      <label><input type="radio" name="version-audio" checked={version === 'limpio'} onChange={() => setVersion('limpio')} disabled={ocupado} /> Limpia</label>
                    </fieldset>
                  ) : null}
                  <label className="voz-autorizacion">
                    <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} disabled={ocupado} /> El cliente autorizó usar esta grabación
                  </label>
                  <div className="acciones-form">
                    <button className="boton" type="button" onClick={() => void limpiar()} disabled={ocupado || !audio || audio.limpieza?.estado === 'listo'}>Limpiar ruido</button>
                    <button className="boton ia" type="button" onClick={() => void relocutar()} disabled={ocupado || !audio || !elegida}>✦ Re-locutar con voz IA</button>
                    <button className="boton primario" type="button" onClick={() => void usar()} disabled={ocupado || !audio || !elegida}>Usar con boca automática</button>
                    {deshacer ? <button className="boton" type="button" onClick={() => void revertir()} disabled={ocupado}>↶ Deshacer</button> : null}
                  </div>
                </>
              )}
              {aviso ? <p className="nota" role="status">{aviso}</p> : null}
              {error ? <div className="nota error" role="alert">{error}</div> : null}
            </section>
          ) : null}
        </div>
        <div className={svg ? 'voz-con-ana voz-columna' : 'voz-columna'}>
          {svg ? (
            <figure className="voz-escenario">
              <AnaHablando svg={svg} colores={colores} audio={sonando?.audio ?? null} bocas={sonando ? bocasDe(sonando.pantallaId) : undefined} />
              <figcaption className="sec" role="status">{sonando ? `Narrando ${sonando.pantallaId}` : 'Elige una narración para escucharla con Ana'}</figcaption>
            </figure>
          ) : null}
          <ol className="voz-lista" aria-label="Narraciones en español">
            {pantallas.map((p) => {
              const n = narraciones.get(p.id);
              const chip = estadoNarracion(n);
              const grabada = n?.origen === 'grabacion';
              return (
                <li key={p.id} className="voz-item" aria-label={`Narración ${p.id}`}>
                  <div className="voz-cabeza">
                    <span><span className="num">{p.id}</span> · {p.titulo.es ?? p.id}</span>
                    <span className="fila-chips">
                      {grabada ? <span className="chip">Grabación del cliente</span> : null}
                      {n?.duracionS ? <span className="num sec">{n.duracionS.toFixed(1)} s</span> : null}
                      <span className={`chip ${chip.tono}`}>{chip.texto}</span>
                    </span>
                  </div>
                  <p className="voz-texto">{p.narracion!.texto.es}</p>
                  {grabada && n?.grabacion ? <p className="sec">Autorizada por {n.grabacion.autorizadoPor} el {fecha(n.grabacion.autorizadoEn)}{n.grabacion.version === 'limpio' ? ' · versión limpia' : ''}</p> : null}
                  {n?.audioUrl && n.estado !== 'GENERANDO' ? (
                    <audio controls preload="none" src={n.audioUrl} aria-label={`Escuchar la narración de ${p.id}`} onPlay={(e) => alSonar(p.id, e.currentTarget)} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}
