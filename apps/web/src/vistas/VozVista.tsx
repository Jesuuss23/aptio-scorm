// HU-0701 · Resultado de la etapa 6 «Voz en español»: cada narración con su duración y el estado «Lista». Mientras la
// etapa corre, las listas aparecen sin esperar al resto; al terminar se pueden escuchar (audio firmado por 15 minutos).
// HU-0702 · Al escuchar una, Ana la dice al lado con la boca sincronizada (marcas de la etapa 7).
// HU-0703 · Las «Por regenerar» (cambió el texto, la voz o la pronunciación) se avisan a todos; el equipo las regenera
// sin tocar las demás: el worker decide por el hash (RN-07-1), así que lo que no cambió no se vuelve a pagar.
import { animarBoca, type ColoresUniforme, type MarcasBoca, mostrarBoca, parpadear, svgEnLinea } from '@aptio/player';
import { duracionLegible, type VozCurso } from '@aptio/schema/generacion';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi, type Narracion } from '../api';

type PantallaDoc = { id: string; narracion?: { porIdioma?: { es?: { bocas?: MarcasBoca } } } };

/** El personaje del kit en línea; mientras suena un audio mueve la boca con sus marcas. */
export function AnaHablando({ svg, audio, bocas, colores }: { svg: string; audio: HTMLAudioElement | null; bocas?: MarcasBoca; colores: ColoresUniforme }) {
  const marco = useRef<HTMLDivElement>(null);
  const dibujo = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const el = svgEnLinea(svg, document, colores);
    if (!el || !marco.current) return;
    for (const pose of el.querySelectorAll<SVGElement>('[id^="pose_"]')) pose.style.display = pose.id === 'pose_explicando' ? 'inline' : 'none';
    mostrarBoca(el, 'X');
    marco.current.replaceChildren(el);
    dibujo.current = el;
    const dejar = parpadear(() => dibujo.current);
    return () => {
      dejar();
      dibujo.current = null;
    };
  }, [svg, colores]);
  useEffect(() => {
    if (!audio || !bocas) return;
    const detener = animarBoca(() => dibujo.current, { ms: () => audio.currentTime * 1000, sonando: () => !audio.paused && !audio.ended }, () => bocas);
    return () => {
      detener();
      if (dibujo.current) mostrarBoca(dibujo.current, 'X');
    };
  }, [audio, bocas]);
  return <div ref={marco} className="voz-ana" role="img" aria-label="Ana, la narradora" />;
}

const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function VozVista({ generacionId, clave, puedeRegenerar = false, alRegenerar }: { generacionId: string; clave?: string; puedeRegenerar?: boolean; alRegenerar?: () => void }) {
  const [d, setD] = useState<VozCurso | null>(null);
  const [audios, setAudios] = useState<Map<string, Narracion>>(new Map());
  const [error, setError] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [colores, setColores] = useState<ColoresUniforme>({});
  const [bocas, setBocas] = useState<Map<string, MarcasBoca>>(new Map());
  const [sonando, setSonando] = useState<{ pantallaId: string; audio: HTMLAudioElement } | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const terminado = clave === undefined;

  // El personaje del kit y las marcas de boca vienen con el curso del proyecto.
  useEffect(() => {
    if (!terminado) return;
    api.generacion(generacionId).then((g) => {
      // El uniforme de Ana toma los colores del kit del cliente.
      api.proyecto(g.proyectoId).then((p) => api.kit(p.clienteId)).then((k) => setColores({ primario: k.paleta.primario, secundario: k.paleta.secundario, acento: k.paleta.acento }), () => undefined);
      return api.curso(g.proyectoId);
    }).then((c) => {
      setSvg(Object.values(c.svgPersonajes ?? {})[0] ?? null);
      const pantallas = (c.documento as { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[] }).modulos.flatMap((m) => m.capsulas.flatMap((x) => x.pantallas));
      setBocas(new Map(pantallas.flatMap((p) => (p.narracion?.porIdioma?.es?.bocas ? [[p.id, p.narracion.porIdioma.es.bocas] as const] : []))));
    }, () => undefined);
  }, [generacionId, terminado]);

  // Una narración a la vez: al empezar otra, la anterior se pausa.
  const alSonar = (pantallaId: string, audio: HTMLAudioElement) => {
    if (sonando && sonando.audio !== audio) sonando.audio.pause();
    setSonando({ pantallaId, audio });
  };

  useEffect(() => {
    api.etapaGeneracion<VozCurso>(generacionId, 'VOZ_ES').then(
      (e) => {
        if (!e.datos) return setError('La etapa todavía no tiene narraciones');
        setD(e.datos);
        // Los audios se piden al terminar: mientras corre basta la lista.
        if (terminado) api.narraciones(e.datos.cursoId).then((l) => setAudios(new Map(l.map((n) => [n.pantallaId, n]))), () => undefined);
      },
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las narraciones'),
    );
  }, [generacionId, clave, terminado]);

  async function regenerar(cursoId: string) {
    setRegenerando(true);
    setError('');
    try {
      await api.regenerarNarraciones(cursoId);
      alRegenerar?.();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron regenerar las narraciones');
    } finally {
      setRegenerando(false);
    }
  }

  if (error && !d) return <div className="nota error" role="alert">{error}</div>;
  if (!d) return <p className="sec" role="status">Cargando narraciones…</p>;
  const total = d.narraciones.reduce((n, x) => n + x.duracionMs, 0);
  const porRegenerar = d.narraciones.filter((n) => audios.get(n.pantallaId)?.estado === 'DESACTUALIZADA' || audios.get(n.pantallaId)?.estado === 'ERROR').length;
  return (
    <div className="voz-vista" role="region" aria-label="Narraciones en español">
      <p className="sec num" role="status">
        {d.narraciones.length} de {d.total} narraciones listas{total ? ` · ${duracionLegible(total)} de audio` : ''}
      </p>
      {porRegenerar ? (
        <div className="nota aviso fila-titulo voz-por-regenerar" role="status" aria-label="Narraciones por regenerar">
          <span>{porRegenerar} {porRegenerar === 1 ? 'narración quedó' : 'narraciones quedaron'} «Por regenerar»: cambió su texto, la voz o la pronunciación.</span>
          {puedeRegenerar ? (
            <button className="boton" type="button" disabled={regenerando} onClick={() => void regenerar(d.cursoId)}>Regenerar las desactualizadas ({porRegenerar})</button>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {d.simulada ? <p className="nota">Voz simulada: el audio es silencio con la duración que tendría la voz. Con la voz de Google configurada se escucha a la narradora.</p> : null}
      <div className={svg ? 'voz-con-ana' : undefined}>
      {svg ? (
        <figure className="voz-escenario">
          <AnaHablando svg={svg} colores={colores} audio={sonando?.audio ?? null} bocas={sonando ? bocas.get(sonando.pantallaId) : undefined} />
          <figcaption className="sec" role="status">{sonando ? `Narrando ${sonando.pantallaId}` : 'Elige una narración para escucharla con Ana'}</figcaption>
        </figure>
      ) : null}
      <ol className="voz-lista" aria-label="Narraciones">
        {d.narraciones.map((n) => {
          const audio = audios.get(n.pantallaId);
          return (
            <li key={n.pantallaId} className="voz-item" aria-label={`Narración ${n.pantallaId}`}>
              <div className="voz-cabeza">
                <span><span className="num">{n.pantallaId}</span> · {n.titulo}</span>
                <span className="fila-chips">
                  <span className="num sec">{segundos(n.duracionMs)}</span>
                  <span className={`chip ${audio && audio.estado !== 'ACTUALIZADA' ? 'aviso' : 'validado'}`}>{audio && audio.estado !== 'ACTUALIZADA' ? 'Por regenerar' : 'Lista'}</span>
                </span>
              </div>
              <p className="voz-texto">{n.texto}</p>
              {n.pronunciados.length ? <p className="sec">Pronunciación del diccionario: {n.pronunciados.join(', ')}</p> : null}
              {audio?.audioUrl ? (
                <audio controls preload="none" src={audio.audioUrl} aria-label={`Escuchar la narración de ${n.pantallaId}`} onPlay={(e) => alSonar(n.pantallaId, e.currentTarget)} />
              ) : null}
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}
