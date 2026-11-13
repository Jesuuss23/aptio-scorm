// HU-1514 · Ficha de una landing por sector en el Editor de página (PNT-25, REQ-092): sector, portada, meta título y
// categoría inicial del blog, con las mismas reglas que la API (`@aptio/schema/sitio-sectores`). Dice qué falta para
// publicar (RN-16-9) y cuántos testimonios coinciden con el sector, y avisa si al cambiarlo dejan de coincidir (CP-157).
import { aplicarCambiosSector, faltantesParaPublicar, LIMITES_SECTOR, mismoSector } from '@aptio/schema/sitio-sectores';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type ElementoSitio, ErrorApi, type PaginaSitio } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const contar = (lista: ElementoSitio[] | null, sector: string) => (lista ?? []).filter((t) => mismoSector(t.datos.sector, sector)).length;
const testimonios = (n: number) => (n === 1 ? '1 testimonio' : `${n} testimonios`);

export function FichaLanding({ pagina, alGuardar }: { pagina: PaginaSitio; alGuardar: (p: PaginaSitio) => void }) {
  const [sector, setSector] = useState(pagina.sector ?? '');
  const [portadaTitulo, setPortadaTitulo] = useState(pagina.portada?.titulo ?? '');
  const [portadaTexto, setPortadaTexto] = useState(pagina.portada?.texto ?? '');
  const [metaTitulo, setMetaTitulo] = useState(pagina.metaTitulo ?? '');
  const [blog, setBlog] = useState(pagina.blogCategoriaInicial ?? '');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [lista, setLista] = useState<ElementoSitio[] | null>(null);

  useEffect(() => {
    api.elementosSitio('testimonios').then(setLista, () => setLista(null));
  }, []);

  const cambios = { sector, portada: { titulo: portadaTitulo, texto: portadaTexto }, metaTitulo, blogCategoriaInicial: blog };
  const faltan = faltantesParaPublicar({ portada: pagina.portada, metaTitulo: pagina.metaTitulo });
  const delSector = contar(lista, sector);
  const antes = contar(lista, pagina.sector ?? '');
  const pierde = !mismoSector(sector, pagina.sector) && antes > 0 ? antes : 0;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = aplicarCambiosSector({ sector: pagina.sector, portada: pagina.portada, metaTitulo: pagina.metaTitulo, blogCategoriaInicial: pagina.blogCategoriaInicial }, cambios);
    if (!r.ok) return setAviso({ tipo: 'error', texto: r.errores.map((x) => x.mensaje).join('. ') });
    setOcupado(true);
    setAviso(null);
    try {
      const p = await api.cambiarPaginaSitio(pagina.id, { sector: r.datos.sector ?? '', portada: r.datos.portada, metaTitulo: r.datos.metaTitulo, blogCategoriaInicial: r.datos.blogCategoriaInicial });
      alGuardar(p);
      setAviso({ tipo: 'ok', texto: p.estado === 'PUBLICADA' ? 'Se guardó la landing. Llega al sitio con «Publicar cambios».' : 'Se guardó la landing.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar la landing') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ficha-landing" aria-labelledby="ficha-landing-titulo">
      <h3 id="ficha-landing-titulo">Landing de sector</h3>
      {faltan.length
        ? <p className="nota aviso">Para publicarla falta: {faltan.map((f) => f.mensaje.replace(/^Falta /, '')).join(', ')}.</p>
        : <p className="nota validado">Tiene portada y meta título: se puede publicar.</p>}
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="Landing de sector" noValidate>
        <label className="campo" htmlFor="landing-sector">Sector
          <input id="landing-sector" value={sector} onChange={(e) => setSector(e.target.value)} maxLength={LIMITES_SECTOR.sector} aria-describedby="landing-sector-ayuda" />
        </label>
        <p className="sec" id="landing-sector-ayuda">
          {lista ? `${testimonios(delSector)} de este sector en Contenido › Testimonios${delSector ? '' : ': la landing mostrará todos los visibles'}.` : 'Los testimonios se eligen por este nombre.'}
          {pierde ? ` Al cambiar el sector, ${testimonios(pierde)} de «${pagina.sector}» ${pierde === 1 ? 'deja' : 'dejan'} de coincidir.` : ''}
        </p>
        <label className="campo" htmlFor="landing-portada-titulo">Título de la portada
          <input id="landing-portada-titulo" value={portadaTitulo} onChange={(e) => setPortadaTitulo(e.target.value)} maxLength={LIMITES_SECTOR.portadaTitulo} />
        </label>
        <label className="campo" htmlFor="landing-portada-texto">Texto de la portada
          <textarea id="landing-portada-texto" rows={3} value={portadaTexto} onChange={(e) => setPortadaTexto(e.target.value)} maxLength={LIMITES_SECTOR.portadaTexto} />
        </label>
        <label className="campo" htmlFor="landing-meta">Meta título
          <input id="landing-meta" value={metaTitulo} onChange={(e) => setMetaTitulo(e.target.value)} maxLength={LIMITES_SECTOR.metaTitulo} aria-describedby="landing-meta-ayuda" />
        </label>
        <p className="sec" id="landing-meta-ayuda">El título que ven los buscadores y la pestaña del navegador (hasta {LIMITES_SECTOR.metaTitulo} caracteres).</p>
        <label className="campo" htmlFor="landing-blog">Categoría inicial del blog (opcional)
          <input id="landing-blog" value={blog} onChange={(e) => setBlog(e.target.value)} maxLength={LIMITES_SECTOR.blogCategoria} aria-describedby="landing-blog-ayuda" />
        </label>
        <p className="sec" id="landing-blog-ayuda">La sección Blog de la landing empezará filtrada por esta categoría cuando esté conectado el blog.</p>
        <p className="sec">Preguntas: las asignadas a {pagina.ruta}, las del inicio y las que no tienen página.</p>
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={ocupado}>Guardar landing</button></div>
      </form>
      {aviso ? <p className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</p> : null}
    </section>
  );
}
