// HU-0804 · «Voz en inglés» en Idiomas: cuántas narraciones ya tienen su voz en inglés, «Generar voz en inglés» (reabre
// las etapas 6 a 8 de la última generación con `idiomas: ['en']`; el worker decide por el hash, RN-07-1) con su avance
// por SSE y consulta cada 2 s de respaldo, y las pantallas cuya narración aún no tiene inglés.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ErrorApi, type Generacion, type Narracion } from '../api';

const CONSULTA_MS = 2000;
const ETAPAS_VOZ = ['VOZ_ES', 'BOCA', 'SUBTITULOS'] as const;
const NOMBRE_ETAPA: Record<(typeof ETAPAS_VOZ)[number], string> = { VOZ_ES: 'Voz', BOCA: 'Boca', SUBTITULOS: 'Subtítulos' };

type PantallaDoc = { id?: string; titulo?: { es?: string }; narracion?: { texto?: { es?: string; en?: string } } };

/** Pantallas narradas del documento, en orden, con su número y si su narración ya tiene inglés. */
function narradasDe(doc: Record<string, unknown>) {
  const lista = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const salida: { id: string; n: number; titulo: string; traducida: boolean }[] = [];
  let n = 0;
  for (const m of lista<{ capsulas?: unknown }>(doc.modulos)) {
    for (const c of lista<{ pantallas?: unknown }>(m.capsulas)) {
      for (const p of lista<PantallaDoc>(c.pantallas)) {
        n++;
        if (p.id && p.narracion?.texto?.es?.trim()) salida.push({ id: p.id, n, titulo: p.titulo?.es ?? '', traducida: Boolean(p.narracion.texto.en?.trim()) });
      }
    }
  }
  return salida;
}

export function VozIngles({ cursoId, documento, puedeGenerar, alTerminar }: { cursoId: string; documento: Record<string, unknown>; puedeGenerar: boolean; alTerminar: () => void }) {
  const [narraciones, setNarraciones] = useState<Narracion[] | null>(null);
  const [generacionId, setGeneracionId] = useState<string | null>(null);
  const [g, setG] = useState<Generacion | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const narradas = useMemo(() => narradasDe(documento), [documento]);

  const recargar = useCallback(() => {
    api.narraciones(cursoId, 'en').then(setNarraciones, () => setNarraciones([]));
  }, [cursoId]);
  useEffect(recargar, [recargar]);

  const terminar = useRef<(g: Generacion) => void>(() => undefined);
  useEffect(() => {
    terminar.current = (fin) => {
      setGeneracionId(null);
      recargar();
      alTerminar();
      if (fin.estado === 'COMPLETADO') setAviso('Voz en inglés lista: audio, boca y subtítulos.');
      else {
        const fallida = fin.etapas.find((e) => e.estado === 'ERROR');
        setError(`La voz en inglés no terminó${fallida?.detalle ? `: ${fallida.detalle}` : ''}`);
      }
    };
  }, [recargar, alTerminar]);
  useEffect(() => {
    if (!generacionId) return;
    const refrescar = () => api.generacion(generacionId).then((nueva) => {
      setG(nueva);
      if (['COMPLETADO', 'ERROR', 'CANCELADO'].includes(nueva.estado)) terminar.current(nueva);
    }, () => undefined);
    let fuente: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      fuente = new EventSource(`/api/v1/generaciones/${generacionId}/eventos`);
      fuente.addEventListener('etapa', () => void refrescar());
      fuente.onerror = () => fuente?.close();
    }
    void refrescar();
    const t = setInterval(() => void refrescar(), CONSULTA_MS);
    return () => {
      clearInterval(t);
      fuente?.close();
    };
  }, [generacionId]);

  async function generar() {
    setError('');
    setAviso('');
    try {
      const r = await api.regenerarNarraciones(cursoId, { idiomas: ['en'] });
      setG(null);
      setGeneracionId(r.id);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo pedir la voz en inglés');
    }
  }

  const porPantalla = new Map((narraciones ?? []).map((n) => [n.pantallaId, n]));
  const conVoz = narradas.filter((p) => porPantalla.get(p.id)?.estado === 'ACTUALIZADA').length;
  const porRegenerar = narradas.filter((p) => p.traducida && ['DESACTUALIZADA', 'ERROR'].includes(porPantalla.get(p.id)?.estado ?? '')).length;
  const sinTraducir = narradas.filter((p) => !p.traducida);
  const traducidas = narradas.length - sinTraducir.length;
  // Avance: las 3 etapas (voz, boca, subtítulos) de la corrida; el texto es el de la que está en curso.
  const etapas = g?.etapas.filter((e) => (ETAPAS_VOZ as readonly string[]).includes(e.etapa)) ?? [];
  const listas = etapas.filter((e) => e.estado === 'COMPLETADO').length;
  const enCurso = etapas.find((e) => e.estado === 'EN_CURSO');
  const progreso = Math.round((listas / ETAPAS_VOZ.length) * 100);
  const mensaje = enCurso ? `${NOMBRE_ETAPA[enCurso.etapa as (typeof ETAPAS_VOZ)[number]]}: ${enCurso.detalle ?? 'en curso…'}` : 'En cola…';

  return (
    <section className="tarjeta kit-bloque voz-ingles" aria-label="Voz en inglés">
      <div className="fila-titulo">
        <h2>Voz en inglés</h2>
        {puedeGenerar ? (
          <button className="boton ia" type="button" disabled={Boolean(generacionId) || !traducidas} onClick={() => void generar()}>
            {generacionId ? 'Generando voz…' : '✦ Generar voz en inglés'}
          </button>
        ) : null}
      </div>
      <p className="num" data-cifra="voz-ingles"><b>{conVoz} de {narradas.length}</b> narraciones con voz en inglés{porRegenerar ? ` · ${porRegenerar} por regenerar` : ''}</p>
      <p className="sec">Audio, boca del personaje y subtítulos en inglés para cada narración que ya tiene su inglés. Lo que no cambió no se vuelve a pagar.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className="nota validado" role="status">{aviso}</div> : null}
      {generacionId ? (
        <div className="nota avance-traduccion" role="status" aria-live="polite">
          <span>{mensaje}</span>
          <span className="barra" role="progressbar" aria-label="Avance de la voz en inglés" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso}>
            <i style={{ width: `${progreso}%` }} />
          </span>
        </div>
      ) : null}
      {sinTraducir.length ? (
        <details className="sin-traducir">
          <summary>{sinTraducir.length} {sinTraducir.length === 1 ? 'pantalla narrada aún no tiene' : 'pantallas narradas aún no tienen'} su inglés</summary>
          <ul aria-label="Pantallas sin inglés">
            {sinTraducir.map((p) => <li key={p.id}><span className="num">{String(p.n).padStart(2, '0')}</span> · {p.titulo}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
