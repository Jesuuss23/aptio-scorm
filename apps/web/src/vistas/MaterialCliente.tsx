// HU-0304 y HU-1402 · Material del cliente: subir PDF, Word o PowerPoint, ver el texto por página (las escaneadas pasan
// por OCR, CP-033) y avisar del texto que parece una instrucción para la IA, que se trata como dato (CP-102). El tipo
// real del archivo lo verifica la API al confirmar la subida (CP-034).
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Material } from '../api';

const EXTENSIONES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const ACEPTA = ['.pdf', '.docx', '.pptx', ...Object.values(EXTENSIONES)].join(',');
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
  if (m.estado === 'pendiente') return 'En cola para extraer el texto';
  if (m.estado === 'procesando') return 'Extrayendo el texto…';
  if (m.estado === 'error') return m.error ?? 'No se pudo leer el archivo';
  const ocr = m.paginas.filter((p) => p.escaneada).length;
  const unidad = m.tipo === 'POWERPOINT' ? 'diapositiva' : 'página';
  return `${m.paginas.length} ${unidad}${m.paginas.length === 1 ? '' : 's'}${ocr ? ` · ${ocr} con OCR` : ''}`;
}

export function MaterialCliente({ proyectoId, puedeEditar }: { proyectoId: string; puedeEditar: boolean }) {
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

  const visto = materiales?.find((m) => m.id === abierto && m.estado === 'listo' && m.paginas.length);

  return (
    <section className="tarjeta kit-bloque" aria-label="Material del cliente">
      <h2>Material del cliente</h2>
      <p className="sec">PDF, Word o PowerPoint. La IA trabaja con el texto de cada página; las páginas escaneadas pasan por OCR.</p>
      {errores.length ? <div className="nota error" role="alert"><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {puedeEditar ? (
        <>
          <div className="acciones-form">
            <label className="boton primario">
              {subiendo ? 'Subiendo…' : 'Subir material'}
              <input className="sr" type="file" multiple accept={ACEPTA} disabled={subiendo} aria-label="Archivos del material"
                onChange={(e) => { void subir(e.target.files); e.target.value = ''; }} />
            </label>
            <span className="sec">El video y el audio del cliente llegan en el siguiente sprint.</span>
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
            const avisos = m.paginas.filter((p) => p.posibleInstruccion).length;
            return (
              <li key={m.id} className="fila-material">
                <span className="chip">{NOMBRE_TIPO[m.tipo]}</span>
                <span className="material-nombre">
                  <b>{m.nombre ?? m.tema}</b>
                  <span className={m.estado === 'error' ? 'sec texto-error' : 'sec'} role={EN_CURSO.has(m.estado) ? 'status' : undefined}>{resumen(m)}</span>
                </span>
                {avisos ? <span className="chip aviso">{avisos === 1 ? '1 página con posible instrucción' : `${avisos} páginas con posible instrucción`}</span> : null}
                {m.estado === 'listo' && m.paginas.length ? (
                  <button className="boton" type="button" aria-expanded={abierto === m.id} onClick={() => setAbierto(abierto === m.id ? null : m.id)}>
                    {abierto === m.id ? 'Ocultar texto' : 'Ver texto'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {visto ? (
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
