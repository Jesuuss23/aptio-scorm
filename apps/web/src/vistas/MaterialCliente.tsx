// HU-0304, HU-0305 y HU-1402 · Material del cliente: subir PDF, Word o PowerPoint y ver el texto por página (las
// escaneadas pasan por OCR, CP-033), o video y audio y ver su transcripción con marcas de tiempo (CP-035). Se avisa del
// texto que parece una instrucción para la IA, que se trata como dato (CP-102). El tipo real del archivo lo verifica la
// API al confirmar la subida (CP-034).
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Material } from '../api';
import { tiempo } from '../formato';

const EXTENSIONES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};
const ACEPTA = [...Object.keys(EXTENSIONES).map((e) => `.${e}`), ...new Set(Object.values(EXTENSIONES))].join(',');
const MEDIO = new Set<Material['tipo']>(['VIDEO', 'AUDIO']);
const NOMBRE_TIPO: Record<Material['tipo'], string> = {
  PDF: 'PDF', WORD: 'Word', POWERPOINT: 'PowerPoint', VIDEO: 'Video', AUDIO: 'Audio', TEMA: 'Tema',
};
const EN_CURSO = new Set<Material['estado']>(['pendiente', 'procesando']);

/** Algunos navegadores no informan el tipo de .docx o .pptx: se toma de la extensión; la API verifica el contenido real. */
function conTipo(archivo: File): File {
  if (archivo.type) return archivo;
  const tipo = EXTENSIONES[archivo.name.split('.').pop()?.toLowerCase() ?? ''];
  return tipo ? new File([archivo], archivo.name, { type: tipo }) : archivo;
}

function resumen(m: Material): string {
  if (m.tipo === 'TEMA') return 'Sin archivo: la IA parte del tema';
  const medio = MEDIO.has(m.tipo);
  if (m.estado === 'pendiente') return medio ? 'En cola para transcribir' : 'En cola para extraer el texto';
  if (m.estado === 'procesando') return medio ? 'Transcribiendo…' : 'Extrayendo el texto…';
  if (m.estado === 'error') return m.error ?? 'No se pudo leer el archivo';
  if (medio) {
    const n = m.transcripcion.length;
    return `Transcripción${m.duracionS !== null ? ` de ${tiempo(m.duracionS)}` : ''} · ${n} ${n === 1 ? 'fragmento' : 'fragmentos'} con marca de tiempo`;
  }
  const ocr = m.paginas.filter((p) => p.escaneada).length;
  const unidad = m.tipo === 'POWERPOINT' ? 'diapositiva' : 'página';
  return `${m.paginas.length} ${unidad}${m.paginas.length === 1 ? '' : 's'}${ocr ? ` · ${ocr} con OCR` : ''}`;
}

export function MaterialCliente({ proyectoId, puedeEditar, alCambiar }: { proyectoId: string; puedeEditar: boolean; alCambiar?: (materiales: Material[]) => void }) {
  const [materiales, setMateriales] = useState<Material[] | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [tema, setTema] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const enCurso = Boolean(materiales?.some((m) => EN_CURSO.has(m.estado)));

  useEffect(() => {
    api.materiales(proyectoId).then(setMateriales, (e: unknown) =>
      setErrores([e instanceof ErrorApi ? e.message : 'No se pudo cargar el material']));
  }, [proyectoId]);

  useEffect(() => {
    if (materiales) alCambiar?.(materiales);
  }, [materiales, alCambiar]);

  // Mientras el worker extrae el texto, se consulta cada 2 s.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => {
      api.materiales(proyectoId).then(setMateriales, () => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [enCurso, proyectoId]);

  const sumar = (m: Material) => setMateriales((l) => [...(l ?? []).filter((x) => x.id !== m.id), m]);

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    setSubiendo(true);
    setErrores([]);
    const fallos: string[] = [];
    for (const archivo of Array.from(lista)) {
      try {
        const recurso = await api.subir(conTipo(archivo), { proyectoId, origen: 'CLIENTE' });
        sumar(await api.agregarMaterial(proyectoId, { recursoId: recurso.id }));
      } catch (e) {
        fallos.push(`«${archivo.name}» no se agregó: ${e instanceof ErrorApi ? e.message : 'error inesperado'}`);
      }
    }
    setErrores(fallos);
    setSubiendo(false);
  }

  async function agregarTema() {
    setErrores([]);
    try {
      sumar(await api.agregarMaterial(proyectoId, { tema: tema.trim() }));
      setTema('');
    } catch (e) {
      setErrores([e instanceof ErrorApi ? e.message : 'No se pudo agregar el tema']);
    }
  }

  const conContenido = (m: Material) => m.estado === 'listo' && (m.paginas.length > 0 || m.transcripcion.length > 0);
  const visto = materiales?.find((m) => m.id === abierto && conContenido(m));

  return (
    <section className="tarjeta kit-bloque" aria-label="Material del cliente">
      <h2>Material del cliente</h2>
      <p className="sec">PDF, Word, PowerPoint, video o audio. Los documentos se leen por página (las escaneadas pasan por OCR) y el video y el audio se transcriben con marcas de tiempo.</p>
      {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {puedeEditar ? (
        <>
          <div className="acciones-form">
            <label className="boton primario">
              {subiendo ? 'Subiendo…' : 'Subir material'}
              <input className="sr" type="file" multiple accept={ACEPTA} disabled={subiendo} aria-label="Archivos del material"
                onChange={(e) => { void subir(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <div className="kit-fila">
            <label className="campo material-tema">
              O escribe solo el tema (si el cliente no tiene material)
              <input value={tema} maxLength={500} placeholder="Uso correcto de extintores para personal de oficina" onChange={(e) => setTema(e.target.value)} />
            </label>
            <button className="boton material-agregar" type="button" disabled={tema.trim().length < 3} onClick={() => void agregarTema()}>Agregar tema</button>
          </div>
        </>
      ) : null}

      {materiales === null ? <p className="sec" role="status">Cargando material…</p> : !materiales.length ? (
        <p className="sec">Aún no hay material. Sin material, la IA parte solo del tema.</p>
      ) : (
        <ul className="lista-material" aria-label="Material">
          {materiales.map((m) => {
            const medio = MEDIO.has(m.tipo);
            const avisos = (medio ? m.transcripcion : m.paginas).filter((p) => p.posibleInstruccion).length;
            const unidad = medio ? 'fragmento' : 'página';
            return (
              <li key={m.id} className="fila-material">
                <span className="chip">{NOMBRE_TIPO[m.tipo]}</span>
                <span className="material-nombre">
                  <b>{m.nombre ?? m.tema}</b>
                  <span className={m.estado === 'error' ? 'sec texto-error' : 'sec'} role={EN_CURSO.has(m.estado) ? 'status' : undefined}>{resumen(m)}</span>
                </span>
                {avisos ? <span className="chip aviso">{avisos === 1 ? `1 ${unidad} con posible instrucción` : `${avisos} ${unidad}s con posible instrucción`}</span> : null}
                {conContenido(m) ? (
                  <button className="boton" type="button" aria-expanded={abierto === m.id} onClick={() => setAbierto(abierto === m.id ? null : m.id)}>
                    {abierto === m.id ? (medio ? 'Ocultar transcripción' : 'Ocultar texto') : (medio ? 'Ver transcripción' : 'Ver texto')}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {visto && MEDIO.has(visto.tipo) ? (
        <ol className="paginas-material transcripcion" role="region" aria-label={`Transcripción de ${visto.nombre ?? 'el material'}`}>
          {visto.transcripcion.map((s) => (
            <li key={s.desde} className="segmento" aria-label={`Desde ${tiempo(s.desde)}`}>
              <span className="num sec segmento-tiempo">{tiempo(s.desde)}–{tiempo(s.hasta)}</span>
              <span className="segmento-texto">
                {s.texto}
                {s.posibleInstruccion ? <span className="chip aviso">Posible instrucción: se usa como contenido y la IA no la obedece</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : visto ? (
        <div className="paginas-material" role="region" aria-label={`Texto de ${visto.nombre ?? 'el material'}`}>
          {visto.paginas.map((p) => (
            <article key={p.n} className="pagina-material" aria-label={`Página ${p.n}`}>
              <header className="fila-chips">
                <b>Página {p.n}</b>
                {p.escaneada ? <span className="chip ia">Escaneada (OCR)</span> : null}
                {p.posibleInstruccion ? <span className="chip aviso">Posible instrucción</span> : null}
              </header>
              {p.posibleInstruccion ? (
                <p className="nota aviso">Este texto parece una orden para la IA. Se usa como contenido del cliente y la IA no lo obedece; revisa si debe quedar en el curso.</p>
              ) : null}
              <p className="texto-pagina">{p.texto || 'Página sin texto'}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
