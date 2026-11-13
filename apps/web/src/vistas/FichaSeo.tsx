// HU-1512 · Pestaña «SEO» del Editor de página (PNT-26, REQ-071): ruta, meta título con contador 0/60, meta descripción
// con contador 0/160, URL canónica, «Indexar en buscadores» (CP-125) y datos estructurados, con las mismas reglas que la
// API (`@aptio/schema/sitio-seo`) y la vista previa del resultado en Google, que cambia mientras se escribe. Si la página
// está publicada y cambia su ruta, la API crea sola la redirección 301 de la anterior y aquí se muestra el aviso.
import { aplicarCambiosSeo, LIMITES_SEO, leerSeo, rutaServida, TIPOS_DATOS_ESTRUCTURADOS, tituloDePagina, type TipoDatosEstructurados } from '@aptio/schema/sitio-seo';
import { NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { type FormEvent, useEffect, useState } from 'react';
import { api, ErrorApi, type PaginaSitio } from '../api';
import { navegar } from '../ruta';
import { MENSAJE_RUTA, RUTA_SITIO } from './sitio-paginas';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const DESCRIPCION_DATOS: Record<TipoDatosEstructurados, string> = {
  WebPage: 'WebPage: una página general.',
  FAQPage: 'FAQPage: se arma con las preguntas visibles de la página; si no tiene, va como WebPage.',
  Product: 'Product: una página de producto o de planes, con la marca del sitio.',
};

function Contador({ id, n, max }: { id: string; n: number; max: number }) {
  return <small id={id} className={n > max ? 'contador-caracteres excede' : 'contador-caracteres'} aria-live="polite">{n} / {max}{n > max ? ` · ${n - max} de más` : ''}</small>;
}

export function FichaSeo({ pagina, alGuardar }: { pagina: PaginaSitio; alGuardar: (p: PaginaSitio) => void }) {
  const [ruta, setRuta] = useState(pagina.ruta);
  const [metaTitulo, setMetaTitulo] = useState(pagina.metaTitulo ?? '');
  const [metaDescripcion, setMetaDescripcion] = useState(pagina.metaDescripcion ?? '');
  const [canonical, setCanonical] = useState(pagina.canonical ?? '');
  const [indexar, setIndexar] = useState(pagina.indexar);
  const [datos, setDatos] = useState<TipoDatosEstructurados>(pagina.datosEstructurados);
  const [sitio, setSitio] = useState<{ dominio: string; nombre: string }>({ dominio: 'aptioscorm.com', nombre: NOMBRE_POR_DEFECTO });
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.ajustesSitio().then((a) => setSitio({ dominio: a.dominio ?? 'aptioscorm.com', nombre: a.nombre || NOMBRE_POR_DEFECTO }), () => undefined);
  }, []);

  const titulo = tituloDePagina({ ruta: pagina.ruta, titulo: pagina.titulo, metaTitulo: metaTitulo.trim() || null }, sitio.nombre);
  const descripcion = metaDescripcion.trim() || 'Sin meta descripción: Google mostrará el texto general del sitio o un fragmento de la página.';
  const publica = rutaServida(RUTA_SITIO.test(ruta) ? ruta : pagina.ruta, pagina.idioma);
  const cambiaRuta = ruta !== pagina.ruta;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (cambiaRuta && !RUTA_SITIO.test(ruta)) return setAviso({ tipo: 'error', texto: MENSAJE_RUTA });
    const r = aplicarCambiosSeo(leerSeo(pagina), { metaTitulo, metaDescripcion, canonical, indexar, datosEstructurados: datos });
    if (!r.ok) return setAviso({ tipo: 'error', texto: r.errores.map((x) => x.mensaje).join('. ') });
    setOcupado(true);
    setAviso(null);
    try {
      const p = await api.cambiarPaginaSitio(pagina.id, { ...(cambiaRuta ? { ruta } : {}), ...r.datos });
      alGuardar(p);
      const llega = p.estado === 'PUBLICADA' ? ' Llega al sitio con «Publicar cambios».' : '';
      setAviso({ tipo: 'ok', texto: p.avisoRedireccion ?? `Se guardó el SEO de la página.${llega}` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar el SEO') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ficha-seo" aria-labelledby="ficha-seo-titulo">
      <h3 id="ficha-seo-titulo" className="sr">SEO de la página</h3>
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="SEO de la página" noValidate>
        <label className="campo" htmlFor="seo-ruta">Ruta de la página
          <input id="seo-ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} maxLength={200} spellCheck={false} autoCapitalize="none" aria-describedby="seo-ruta-ayuda" />
        </label>
        <p className="sec" id="seo-ruta-ayuda">{pagina.estado === 'PUBLICADA' ? 'Si la cambias, la ruta anterior redirige (301) a la nueva.' : 'Minúsculas, números y guiones, como /precios.'}</p>
        <label className="campo" htmlFor="seo-titulo">Meta título
          <input id="seo-titulo" value={metaTitulo} onChange={(e) => setMetaTitulo(e.target.value)} maxLength={LIMITES_SEO.metaTitulo + 40} aria-describedby="seo-titulo-cuenta seo-titulo-ayuda" />
        </label>
        <Contador id="seo-titulo-cuenta" n={metaTitulo.trim().length} max={LIMITES_SEO.metaTitulo} />
        <p className="sec" id="seo-titulo-ayuda">Vacío: «{tituloDePagina({ ruta: pagina.ruta, titulo: pagina.titulo }, sitio.nombre)}».</p>
        <label className="campo" htmlFor="seo-descripcion">Meta descripción
          <textarea id="seo-descripcion" rows={3} value={metaDescripcion} onChange={(e) => setMetaDescripcion(e.target.value)} maxLength={LIMITES_SEO.metaDescripcion + 100} aria-describedby="seo-descripcion-cuenta" />
        </label>
        <Contador id="seo-descripcion-cuenta" n={metaDescripcion.trim().length} max={LIMITES_SEO.metaDescripcion} />
        <label className="campo" htmlFor="seo-canonical">URL canónica (opcional)
          <input id="seo-canonical" value={canonical} onChange={(e) => setCanonical(e.target.value)} maxLength={LIMITES_SEO.canonical} spellCheck={false} autoCapitalize="none" placeholder={publica} aria-describedby="seo-canonical-ayuda" />
        </label>
        <p className="sec" id="seo-canonical-ayuda">Vacía: la de esta página en {sitio.dominio}. Una ruta interna (/precios) o una dirección https://.</p>
        <label className="campo" htmlFor="seo-datos">Datos estructurados
          <select id="seo-datos" value={datos} onChange={(e) => setDatos(e.target.value as TipoDatosEstructurados)} aria-describedby="seo-datos-ayuda">
            {TIPOS_DATOS_ESTRUCTURADOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <p className="sec" id="seo-datos-ayuda">{DESCRIPCION_DATOS[datos]}{pagina.ruta === '/' ? ' El inicio suma los datos de la organización.' : ''}</p>
        <div className="seo-indexar">
          <span id="seo-indexar-etiqueta">Indexar en buscadores</span>
          <button type="button" role="switch" className="interruptor" aria-checked={indexar} aria-labelledby="seo-indexar-etiqueta" aria-describedby="seo-indexar-ayuda" onClick={() => setIndexar(!indexar)}><span aria-hidden="true" /></button>
        </div>
        <p className="sec" id="seo-indexar-ayuda">{indexar ? 'Los buscadores pueden mostrarla; va en el sitemap.' : 'Lleva noindex, sale del sitemap y no enlaza su versión en el otro idioma.'}</p>
        <span className="seo-serp-etiqueta" id="seo-serp-titulo">Vista previa en Google</span>
        <div className="serp" role="group" aria-labelledby="seo-serp-titulo">
          <span className="serp-url">{sitio.dominio}{publica === '/' ? '' : publica}</span>
          <span className="serp-titulo">{titulo}</span>
          <span className="serp-descripcion">{descripcion}</span>
          {!indexar ? <span className="chip aviso">No se indexa</span> : null}
        </div>
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={ocupado}>Guardar SEO</button></div>
      </form>
      {aviso ? <p className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</p> : null}
      <p className="sec">Revisa los problemas de todo el sitio en <a href="/sitio/seo" onClick={(e) => { e.preventDefault(); navegar('/sitio/seo'); }}>Sitio web › SEO</a>.</p>
    </section>
  );
}
