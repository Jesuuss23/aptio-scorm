/**
 * HU-1508 · Sitio público rápido y accesible (REQ-109, CP-120, DA-08). Arma el HTML estático de cada página de una
 * versión del sitio con `react-dom/server`: documento HTML5 completo, CSS en línea, fuentes propias, sin JavaScript
 * (el menú de celular es un `<details>` nativo). Lo que se dibuja sale de `paginaServida`, así en producción nunca hay
 * un dato ficticio (RN-16-3). Todo texto pasa por React, que lo escapa (RN-16-7).
 */
import { createElement as h, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COLECCION_DE_BLOQUE } from '@aptio/schema/sitio-contenido';
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import type { EnlacePublico, NavegacionPublica } from '@aptio/schema/sitio-navegacion';
import { enlaceWhatsapp, NOMBRE_POR_DEFECTO, type SitioPublicado } from '@aptio/schema/sitio-ajustes';
import type { SectorPublicado } from '@aptio/schema/sitio-sectores';
import { type ArticuloPublico, type BlogPublico, categoriaInicial, ULTIMOS_BLOG } from '@aptio/schema/sitio-blog';
import { alternasDe, type Instantanea, navegacionDe, type PaginaServida, paginaServida } from '@aptio/schema/sitio-versiones';
import { CSS_SITIO, fuentesCss } from './estilos.js';
import { CARPETA_FUENTES, fuentes } from './fuentes.js';
import { type Idioma, INTERFAZ, TEXTOS } from './textos.js';

export interface OpcionesRender {
  entorno: EntornoSitio;
  /** Dominio público para canonical y sitemap, sin barra final: `https://aptioscorm.com`. */
  sitioUrl: string;
  /** Prefijo de las rutas dentro del HTML: `/s` si lo sirve la API, `''` si va en la raíz detrás de la CDN. */
  base: string;
  /** Año del pie (por defecto, el actual). */
  anio?: number;
  /**
   * HU-1511 · La copia del blog de WordPress que se ve ahora (RN-16-8). No entra en la versión: se suma en cada render,
   * así un artículo nuevo sale con la siguiente sincronización (CP-154). Sin ella, no hay sección Blog ni «Últimos artículos».
   */
  blog?: BlogPublico | null;
}

/** HU-1511 · Carpeta pública de las imágenes destacadas copiadas del blog (`sitio/blog/` en el bucket). */
export const CARPETA_BLOG = '_blog';

/** HU-1509 · Carpeta pública del logo y el favicon (`sitio/marca/` en el bucket). */
export const CARPETA_MARCA = '_marca';

/** HU-1509 · Nombre, logo, favicon y WhatsApp de la versión; las versiones anteriores a los ajustes usan la marca de siempre. */
export interface Marca { nombre: string; logo: SitioPublicado['logo']; favicon: SitioPublicado['favicon']; whatsapp: SitioPublicado['whatsapp'] }
export const marcaDe = (inst: Pick<Instantanea, 'sitio'> | null | undefined): Marca => ({
  nombre: inst?.sitio?.nombre ?? NOMBRE_POR_DEFECTO, logo: inst?.sitio?.logo ?? null, favicon: inst?.sitio?.favicon ?? null, whatsapp: inst?.sitio?.whatsapp ?? null,
});

/** HU-1509 · El dominio guardado en los ajustes de la versión manda sobre `SITIO_URL` para canonical, sitemap y robots. */
export function conDominio(inst: Pick<Instantanea, 'sitio'> | null | undefined, op: OpcionesRender): OpcionesRender {
  return inst?.sitio?.dominio ? { ...op, sitioUrl: `https://${inst.sitio.dominio}` } : op;
}

type Elemento = NonNullable<PaginaServida['bloques'][number]['elementos']>[number];
const idiomaDe = (i: string): Idioma => (i === 'en' ? 'en' : 'es');
const sinBarra = (u: string) => u.replace(/\/+$/, '');
const texto = (e: Elemento, campo: string): string => {
  const v = e.datos[campo];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};

/** La ruta pública de una página: las de inglés van bajo `/en` (`/en` para el inicio). */
export function rutaPublica(ruta: string, idioma: string): string {
  return idioma === 'en' ? `/en${ruta === '/' ? '' : ruta}` : ruta;
}

/** El objeto del bucket de una ruta pública: `/` → `index.html`, `/en/precios` → `en/precios/index.html`. */
export function archivoDeRuta(rutaPublicaPedida: string): string {
  const limpia = rutaPublicaPedida.replace(/^\/+|\/+$/g, '');
  return limpia ? `${limpia}/index.html` : 'index.html';
}

/** Un enlace del menú o del pie dentro del sitio: las rutas internas llevan la base; los externos van tal cual. */
function hrefDe(ruta: string, base: string): string {
  return ruta.startsWith('https://') ? ruta : `${base}${ruta}`;
}

function Enlace({ e, base, actual }: { e: EnlacePublico; base: string; actual?: string }) {
  return e.externo
    ? h('a', { href: e.ruta, target: '_blank', rel: 'noopener' }, e.texto)
    : h('a', { href: hrefDe(e.ruta, base), ...(actual && e.ruta === actual ? { 'aria-current': 'page' } : {}) }, e.texto);
}

const LOGO = h('span', { className: 'logo', 'aria-hidden': 'true' },
  h('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' },
    h('path', { d: 'M6 6l12 12M18 6L6 18' }), h('circle', { cx: 6, cy: 6, r: 2.2, fill: '#fff' }), h('circle', { cx: 18, cy: 18, r: 2.2, fill: '#fff' })));

function Marcador({ marca, base }: { marca: Marca; base: string }) {
  const logo = marca.logo ? h('img', { className: 'logo-img', src: `${base}/${CARPETA_MARCA}/${marca.logo.archivo}`, alt: '', width: 32, height: 32 }) : LOGO;
  return h(Fragment, null, logo, marca.nombre === NOMBRE_POR_DEFECTO ? h('span', null, 'Aptio ', h('b', null, 'SCORM')) : h('span', null, marca.nombre));
}

/** HU-1510 · Adónde lleva el selector ES · EN de una página (CP-122), o null si no se muestra. */
export interface SelectorIdioma { actual: Idioma; destino: Idioma; ruta: string }

/**
 * El selector sale si está activo en los ajustes publicados y el inicio del otro idioma está publicado. Lleva a la misma
 * página en el otro idioma si está publicada; si no (borrador, programada o inexistente), al inicio de ese idioma.
 */
export function selectorDe(inst: Pick<Instantanea, 'paginas' | 'sitio'>, ruta: string, idioma: string): SelectorIdioma | null {
  if (inst.sitio?.mostrarSelectorIdioma === false) return null;
  const actual = idiomaDe(idioma);
  const destino: Idioma = actual === 'en' ? 'es' : 'en';
  const publicada = (r: string) => inst.paginas.some((p) => p.ruta === r && p.idioma === destino);
  if (!publicada('/')) return null;
  return { actual, destino, ruta: rutaPublica(publicada(ruta) ? ruta : '/', destino) };
}

/** El selector sin JavaScript: el idioma actual marcado y un enlace al otro, con su nombre para el lector de pantalla. */
function Idiomas({ s, base, clase }: { s: SelectorIdioma; base: string; clase: string }) {
  const sigla = (i: Idioma) => i.toUpperCase();
  return h('nav', { className: `idiomas ${clase}`, 'aria-label': INTERFAZ[s.actual].idioma },
    h('span', { className: 'actual', 'aria-current': 'true', lang: s.actual }, sigla(s.actual), h('span', { className: 'sr' }, ` (${INTERFAZ[s.actual].nombreIdioma})`)),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('a', { href: `${base}${s.ruta}`, hrefLang: s.destino, lang: s.destino }, sigla(s.destino), h('span', { className: 'sr' }, ` (${INTERFAZ[s.destino].nombreIdioma})`)));
}

function Cabecera({ menu, base, idioma, actual, marca, selector }: { menu: EnlacePublico[]; base: string; idioma: Idioma; actual: string; marca: Marca; selector: SelectorIdioma | null }) {
  const t = INTERFAZ[idioma];
  const lista = () => h('ul', null, menu.map((e) => h('li', { key: e.ruta + e.texto }, h(Enlace, { e, base, actual }))));
  return h('header', { className: 'shead' },
    h('div', { className: 'in' },
      h('a', { className: 'wm', href: `${base}${idioma === 'en' ? '/en' : '/'}` }, h(Marcador, { marca, base })),
      menu.length ? h('nav', { className: 'nav-escritorio', 'aria-label': t.principal }, lista()) : null,
      selector ? h(Idiomas, { s: selector, base, clase: 'idiomas-escritorio' }) : null,
      menu.length || selector ? h('details', { className: 'menu-celular' },
        h('summary', null, t.menu),
        h('div', { className: 'nav-celular' },
          menu.length ? h('nav', { 'aria-label': `${t.principal} (${t.menu.toLowerCase()})` }, lista()) : null,
          selector ? h(Idiomas, { s: selector, base, clase: 'idiomas-celular' }) : null)) : null));
}

/** HU-1514 · Una landing publicada, para el bloque «Sectores» y la columna del pie. */
export interface LandingPublica { nombre: string; ruta: string; titulo: string }

/** Las landings de sector de la versión en un idioma, por nombre (solo están las publicadas: CP-158). */
export function landingsDe(inst: Pick<Instantanea, 'paginas'>, idioma: string): LandingPublica[] {
  return inst.paginas.filter((p) => p.idioma === idioma && p.sector)
    .map((p) => ({ nombre: p.sector!.nombre, ruta: rutaPublica(p.ruta, p.idioma), titulo: p.sector!.portada.titulo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function Pie({ pie, base, idioma, anio, nombre, landings, ultimos }: { pie: NavegacionPublica['pie']; base: string; idioma: Idioma; anio: number; nombre: string; landings: LandingPublica[]; ultimos: ArticuloPublico[] }) {
  const t = INTERFAZ[idioma];
  const T = TEXTOS[idioma];
  return h('footer', { className: 'sfoot', 'aria-label': t.pie },
    h('div', { className: 'in' },
      h('div', { className: 'cols' },
        h('div', null, h('p', { className: 'flogo' }, nombre), h('p', { style: { marginTop: 12 } }, T.PIE.marca)),
        pie.map((c) => h('div', { key: c.titulo },
          h('h2', null, c.ruta ? h(Enlace, { e: { texto: c.titulo, ruta: c.ruta, externo: c.externo ?? false }, base }) : c.titulo),
          h('ul', null, c.enlaces.map((e) => h('li', { key: e.ruta + e.texto }, h(Enlace, { e, base })))))),
        landings.length ? h('div', null, h('h2', null, T.SECCIONES.sectores.etiqueta),
          h('ul', null, landings.map((l) => h('li', { key: l.ruta }, h('a', { href: `${base}${l.ruta}` }, l.nombre))))) : null,
        // HU-1511 · CP-155: solo artículos visibles de categorías visibles.
        ultimos.length ? h('div', null, h('h2', null, T.SECCIONES.blog.ultimos),
          h('ul', null, ultimos.map((a) => h('li', { key: a.id }, h('a', { href: a.enlace }, a.titulo))))) : null),
      h('p', { className: 'bottom' }, `© ${anio} ${nombre}. ${t.derechos}`)));
}

const ANA = h('svg', { viewBox: '0 0 72 96', role: 'img', 'aria-label': 'Ana, la presentadora' },
  h('rect', { x: 16, y: 52, width: 40, height: 44, rx: 12, fill: '#004ECC' }), h('rect', { x: 31, y: 52, width: 10, height: 16, fill: '#FF6B35' }),
  h('path', { d: 'M18 58L12 82', stroke: '#004ECC', strokeWidth: 7, strokeLinecap: 'round' }), h('circle', { cx: 12, cy: 82, r: 3.6, fill: '#C68B62' }),
  h('path', { d: 'M54 58L66 46', stroke: '#004ECC', strokeWidth: 7, strokeLinecap: 'round' }), h('circle', { cx: 66, cy: 46, r: 3.6, fill: '#C68B62' }),
  h('circle', { cx: 36, cy: 38, r: 17, fill: '#C68B62' }), h('path', { d: 'M18 30a18 16 0 0 1 36 0z', fill: '#FF6B35' }),
  h('rect', { x: 15, y: 28, width: 42, height: 5, rx: 2.5, fill: '#FF6B35' }),
  h('circle', { cx: 29, cy: 37, r: 2, fill: '#102033' }), h('circle', { cx: 43, cy: 37, r: 2, fill: '#102033' }),
  h('ellipse', { cx: 36, cy: 46.5, rx: 6, ry: 4.8, fill: '#7A2E1F' }));

/** Encabezado de sección (etiqueta, título h2 y bajada), como `sh()` del prototipo. */
function Encabezado({ etiqueta, titulo, bajada, id }: { etiqueta?: string; titulo: string; bajada?: string; id: string }) {
  return h('div', { className: 'sh' }, etiqueta ? h('span', { className: 'tagp' }, etiqueta) : null, h('h2', { id }, titulo), bajada ? h('p', null, bajada) : null);
}

interface Contexto { base: string; idioma: Idioma; entorno: EntornoSitio; titulo: string; nivelPortada: 'h1' | 'h2'; clave: string; sector?: SectorPublicado | undefined; landings: LandingPublica[]; blog?: BlogPublico | null | undefined }

const fechaBlog = (iso: string, idioma: Idioma) => new Date(iso).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });

function TarjetaBlog({ a, blog, base, idioma }: { a: ArticuloPublico; blog: BlogPublico; base: string; idioma: Idioma }) {
  const T = TEXTOS[idioma].SECCIONES.blog;
  const nombres = a.categorias.map((slug) => blog.categorias.find((c) => c.slug === slug)?.nombre).filter(Boolean).join(' · ');
  return h('li', null, h('article', { className: 'bcard' },
    a.imagen ? h('img', { src: `${base}/${CARPETA_BLOG}/${a.imagen.archivo}`, alt: '', loading: 'lazy', decoding: 'async', ...(a.imagen.ancho && a.imagen.alto ? { width: a.imagen.ancho, height: a.imagen.alto } : {}) }) : null,
    h('div', { className: 'cuerpo' },
      nombres ? h('p', { className: 'bcat' }, nombres) : null,
      h('h3', null, h('a', { href: a.enlace }, a.titulo)),
      a.extracto ? h('p', null, a.extracto) : null,
      h('p', { className: 'bmeta' }, a.autor ? `${T.por} ${a.autor} · ` : '', h('time', { dateTime: a.fecha }, fechaBlog(a.fecha, idioma))))));
}

/**
 * HU-1511 · CP-123 · Sección Blog con filtro por categoría sin JavaScript: un botón de radio por filtro (Todas y cada
 * categoría visible con su número de artículos) y una lista por filtro con hasta `porPagina` artículos; el CSS de la
 * página (`cssBlog`) muestra la lista del radio marcado. En una landing empieza en su categoría inicial (CP-159).
 */
function SeccionBlog({ blog, c, id }: { blog: BlogPublico; c: Contexto; id: string }) {
  const T = TEXTOS[c.idioma].SECCIONES.blog;
  const inicial = categoriaInicial(blog, c.sector?.blogCategoria) ?? 'todas';
  const filtros = [{ slug: 'todas', nombre: T.todas, cantidad: blog.articulos.length }, ...blog.categorias];
  const nombre = `blog-${c.clave}`;
  const idFiltro = (slug: string) => `bf-${c.clave}-${slug}`;
  const conFiltros = blog.categorias.length > 0;
  return h('section', { className: 'bg-ice', id: 'blog', 'aria-labelledby': id }, h('div', { className: 'in' },
    h(Encabezado, { id, etiqueta: T.etiqueta, titulo: T.titulo, bajada: T.texto }),
    h('div', { className: 'blog-filtro', role: conFiltros ? 'group' : undefined, 'aria-label': conFiltros ? T.filtrar : undefined },
      conFiltros ? filtros.map((f) => h('input', { key: f.slug, type: 'radio', className: `bf bf-${f.slug}`, id: idFiltro(f.slug), name: nombre, value: f.slug, defaultChecked: f.slug === inicial })) : null,
      conFiltros ? h('ul', { className: 'filtros' }, filtros.map((f) => h('li', { key: f.slug },
        h('label', { htmlFor: idFiltro(f.slug), className: `e-${f.slug}` }, f.nombre, ' ', h('span', { className: 'n' }, `(${f.cantidad})`),
          h('span', { className: 'sr' }, ` ${f.cantidad === 1 ? T.articulo : T.articulos}`))))) : null,
      h('div', { className: 'listas' }, filtros.filter((f) => conFiltros || f.slug === 'todas').map((f) => {
        const lista = (f.slug === 'todas' ? blog.articulos : blog.articulos.filter((a) => a.categorias.includes(f.slug))).slice(0, blog.porPagina);
        return h('ul', { key: f.slug, className: `lista l-${f.slug}`, 'aria-label': f.nombre }, lista.map((a) => h(TarjetaBlog, { key: a.id, a, blog, base: c.base, idioma: c.idioma })));
      }))),
    blog.url ? h('p', { className: 'blog-todos' }, h('a', { className: 'btn', href: blog.url }, T.verTodos)) : null));
}

/** El CSS del filtro del blog para las categorías de la copia: muestra la lista del radio marcado y resalta su etiqueta. */
export function cssBlog(blog: BlogPublico | null | undefined): string {
  if (!blog?.articulos.length) return '';
  const slugs = ['todas', ...blog.categorias.map((c) => c.slug)];
  const sel = (f: (s: string) => string) => slugs.map(f).join(',');
  if (slugs.length === 1) return '.blog-filtro .l-todas{display:grid}';
  return `${sel((s) => `.bf-${s}:checked~.listas .l-${s}`)}{display:grid}`
    + `${sel((s) => `.bf-${s}:checked~.filtros .e-${s}`)}{background:var(--b700);border-color:var(--b700);color:#fff}`
    + `${sel((s) => `.bf-${s}:checked~.filtros .e-${s} .n`)}{color:#fff}`
    + `${sel((s) => `.bf-${s}:focus-visible~.filtros .e-${s}`)}{outline:3px solid var(--orange);outline-offset:2px}`;
}

const Fic = ({ e, idioma }: { e: Elemento; idioma: Idioma }) => (e.ficticio ? h('span', { className: 'fic' }, INTERFAZ[idioma].ficticio) : null);

function bloque(tipo: string, elementos: Elemento[] | undefined, c: Contexto): ReactNode {
  const els = elementos ?? [];
  const T = TEXTOS[c.idioma];
  const ruta = (r: string) => `${c.base}${rutaPublica(r, c.idioma)}`;
  const id = `b-${c.clave}`;
  if (COLECCION_DE_BLOQUE[tipo] && els.length === 0) return null;
  switch (tipo) {
    case 'hero': {
      // HU-1514 · En una landing, la portada propia y el nombre del sector como etiqueta.
      const portada = c.sector ? { etiqueta: c.sector.nombre, titulo: c.sector.portada.titulo, texto: c.sector.portada.texto } : T.HERO;
      const titulo = h(c.nivelPortada, null, portada.titulo);
      return h('section', { className: 'hero', 'aria-label': portada.titulo },
        h('div', { className: 'in' },
          h('span', { className: 'tagp' }, portada.etiqueta), titulo, h('p', { className: 'lead' }, portada.texto),
          h('p', { className: 'facts' }, `${T.HERO.vinetas.join(', ')}.`),
          h('div', { className: 'cta-fila' },
            h('a', { className: 'btn primary', href: ruta(T.HERO.cta1.ruta) }, T.HERO.cta1.texto),
            h('a', { className: 'btn', href: ruta(T.HERO.cta2.ruta) }, T.HERO.cta2.texto)),
          h('figure', { className: 'shot' },
            h('div', { className: 'stage' },
              h('div', { className: 'bar5' }, h('b', null, T.HERO.captura.archivo), h('span', null, T.HERO.captura.formato), h('span', null, T.HERO.captura.etiqueta)),
              h('div', { className: 'scene' }, h('div', null, ANA), h('div', { className: 'slide' }, h('b', null, T.HERO.captura.titulo), h('p', null, T.HERO.captura.texto))),
              h('p', { className: 'subs' }, T.HERO.captura.subtitulo)),
            h('figcaption', null, T.HERO.captura.pie))));
    }
    case 'fhero':
      return h('section', { className: 'hero fhero', 'aria-label': T.FHERO.titulo },
        h('div', { className: 'in' },
          h('p', { className: 'crumb-s' }, h('a', { href: `${c.base}${c.idioma === 'en' ? '/en' : '/'}` }, INTERFAZ[c.idioma].inicio), ` / ${c.titulo}`),
          h('span', { className: 'tagp' }, T.FHERO.etiqueta), h(c.nivelPortada, null, T.FHERO.titulo), h('p', { className: 'lead' }, T.FHERO.texto),
          h('div', { className: 'cta-fila', style: { justifyContent: 'flex-start' } }, h('a', { className: 'btn primary', href: ruta(T.HERO.cta1.ruta) }, T.HERO.cta1.texto))));
    case 'confianza':
      if (c.entorno === 'produccion') return null;
      return h('section', { style: { padding: '0 0 32px' } }, h('div', { className: 'in' },
        h('p', { className: 'proof' }, h('b', null, T.CONFIANZA.puntaje), ` ${T.CONFIANZA.texto}`, h('span', { className: 'fic' }, INTERFAZ[c.idioma].ficticio))));
    case 'metricas':
      return h('section', { style: { padding: '0 0 40px' }, 'aria-label': c.idioma === 'en' ? 'Key figures' : 'Cifras' }, h('div', { className: 'in' },
        h('ul', { className: 'statrow' }, els.map((e, i) => h('li', { key: i, className: 'stat' }, h('b', null, texto(e, 'valor')), h('span', null, texto(e, 'etiqueta'), h(Fic, { e, idioma: c.idioma })))))));
    case 'logos':
      return h('section', { style: { padding: '32px 0 64px' }, 'aria-label': T.SECCIONES.logos }, h('div', { className: 'in' },
        h('p', { className: 'logos-t' }, T.SECCIONES.logos),
        h('ul', { className: 'logos' }, els.map((e, i) => h('li', { key: i }, texto(e, 'nombre'), h(Fic, { e, idioma: c.idioma }))))));
    case 'pasos':
      return h('section', { className: 'bg-ice', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.SECCIONES.pasos.etiqueta, titulo: T.SECCIONES.pasos.titulo, bajada: T.SECCIONES.pasos.texto }),
        h('ol', { className: 'cards3' }, els.map((e, i) => h('li', { key: i, className: `pcard${i === 1 ? ' ia' : ''}` },
          h('span', { className: 'n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
          h('h3', null, texto(e, 'titulo'), h(Fic, { e, idioma: c.idioma })), h('p', null, texto(e, 'texto')))))));
    case 'funcionalidades':
      return h('section', { 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.SECCIONES.funcionalidades.etiqueta, titulo: T.SECCIONES.funcionalidades.titulo }),
        h('ul', { className: 'fcards' }, els.map((e, i) => {
          const vinetas = texto(e, 'vinetas').split('\n').map((v) => v.trim()).filter(Boolean);
          return h('li', { key: i, className: 'fcard' },
            h('span', { className: 'ic' }, texto(e, 'etiqueta')), h('h3', null, texto(e, 'titulo'), h(Fic, { e, idioma: c.idioma })), h('p', null, texto(e, 'texto')),
            vinetas.length ? h('ul', null, vinetas.map((v, j) => h('li', { key: j }, v))) : null);
        }))));
    case 'lms':
      return h('section', { className: 'bg-ice2', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.SECCIONES.lms.etiqueta, titulo: T.SECCIONES.lms.titulo, bajada: T.SECCIONES.lms.texto }),
        h('ul', { className: 'lmscards' }, els.map((e, i) => h('li', { key: i }, h('b', null, texto(e, 'nombre'), h(Fic, { e, idioma: c.idioma })), texto(e, 'nota') ? h('span', null, texto(e, 'nota')) : null)))));
    case 'testimonios':
      return h('section', { className: 'bg-ice', id: 'testimonios', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.SECCIONES.testimonios.etiqueta, titulo: T.SECCIONES.testimonios.titulo }),
        h('ul', { className: 'tcards' }, els.map((e, i) => h('li', { key: i }, h('figure', { className: 'tcard' },
          h('blockquote', null, h('p', null, texto(e, 'texto'))),
          h('figcaption', null, h('b', null, texto(e, 'nombre'), h(Fic, { e, idioma: c.idioma })), `${texto(e, 'cargo')}, ${texto(e, 'empresa')}`)))))));
    case 'faq':
      return h('section', { id: 'faq', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, titulo: T.SECCIONES.faq.titulo, bajada: T.SECCIONES.faq.texto }),
        h('div', { className: 'faq' }, els.map((e, i) => h('details', { key: i },
          h('summary', null, texto(e, 'pregunta'), h(Fic, { e, idioma: c.idioma })), h('p', null, texto(e, 'respuesta')))))));
    case 'cta':
      return h('section', { style: { paddingTop: 24 }, 'aria-labelledby': id }, h('div', { className: 'in' },
        h('div', { className: 'ctabox' },
          h('span', { className: 'tagp' }, T.CTA.etiqueta), h('h2', { id }, T.CTA.titulo), h('p', null, T.CTA.texto),
          h('div', { className: 'cta-fila' },
            h('a', { className: 'btn primary', href: ruta(T.HERO.cta1.ruta) }, T.HERO.cta1.texto),
            h('a', { className: 'btn', href: ruta(T.HERO.cta2.ruta) }, T.HERO.cta2.texto)))));
    case 'comparacion':
      return h('section', { className: 'bg-ice', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.COMPARACION.etiqueta, titulo: T.COMPARACION.titulo }),
        h('div', { className: 'vs2' },
          h('div', { className: 'old' }, h('h3', null, T.COMPARACION.antes.titulo), h('ul', null, T.COMPARACION.antes.puntos.map((p) => h('li', { key: p }, p)))),
          h('div', { className: 'new' }, h('h3', null, T.COMPARACION.ahora.titulo), h('ul', null, T.COMPARACION.ahora.puntos.map((p) => h('li', { key: p }, p)))))));
    case 'sectores':
      // HU-1514 · Las landings publicadas del mismo idioma; sin ninguna, el bloque no sale (CP-158).
      if (!c.landings.length) return null;
      return h('section', { id: 'sectores', 'aria-labelledby': id }, h('div', { className: 'in' },
        h(Encabezado, { id, etiqueta: T.SECCIONES.sectores.etiqueta, titulo: T.SECCIONES.sectores.titulo }),
        h('ul', { className: 'fcards' }, c.landings.map((l) => h('li', { key: l.ruta },
          h('a', { className: 'fcard sector', href: `${c.base}${l.ruta}` },
            h('h3', null, l.nombre), h('p', null, l.titulo), h('span', { className: 'more' }, T.SECCIONES.sectores.verSolucion)))))));
    case 'bloglista':
      // HU-1511 · Sin copia del blog o sin artículos visibles, el bloque no sale.
      if (!c.blog?.articulos.length) return null;
      return h(SeccionBlog, { blog: c.blog, c, id });
    default:
      // Planes (S13), precios, comparativa y agendador llegan con su historia (SUP-193).
      return null;
  }
}

function Documento({ titulo, descripcion, canonical, alternas = [], idioma, entorno, base, favicon, robots, cssExtra = '', children }: {
  titulo: string; descripcion: string; canonical: string | null; alternas?: { hreflang: string; href: string }[]; idioma: Idioma; entorno: EntornoSitio; base: string; favicon: Marca['favicon']; robots?: string; cssExtra?: string; children?: ReactNode;
}) {
  const lista = fuentes();
  return h('html', { lang: idioma },
    h('head', null,
      h('meta', { charSet: 'utf-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('title', null, titulo),
      h('meta', { name: 'description', content: descripcion }),
      canonical ? h('link', { rel: 'canonical', href: canonical }) : null,
      alternas.map((a) => h('link', { key: a.hreflang, rel: 'alternate', hrefLang: a.hreflang, href: a.href })),
      h('meta', { name: 'robots', content: robots ?? (entorno === 'produccion' && canonical ? 'index, follow' : 'noindex, nofollow') }),
      h('meta', { name: 'theme-color', content: '#004ECC' }),
      favicon ? h('link', { rel: 'icon', href: `${base}/${CARPETA_MARCA}/${favicon.archivo}`, type: favicon.mime }) : null,
      lista.filter((f) => f.precargar).map((f) => h('link', { key: f.archivo, rel: 'preload', href: `${base}/${CARPETA_FUENTES}/${f.archivo}`, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })),
      h('style', { dangerouslySetInnerHTML: { __html: fuentesCss(lista, base) + CSS_SITIO + cssExtra } })),
    h('body', null, children));
}

function Marco({ nav, op, idioma, actual, marca, landings, selector = null, children }: { nav: NavegacionPublica; op: OpcionesRender; idioma: Idioma; actual: string; marca: Marca; landings: LandingPublica[]; selector?: SelectorIdioma | null; children?: ReactNode }) {
  const t = INTERFAZ[idioma];
  return h(Fragment, null,
    h('a', { className: 'saltar', href: '#contenido' }, t.saltar),
    op.entorno === 'pruebas' ? h('p', { className: 'aviso-pruebas' }, t.pruebas) : null,
    h(Cabecera, { menu: nav.menu, base: op.base, idioma, actual, marca, selector }),
    h('main', { id: 'contenido', tabIndex: -1 }, children),
    h(Pie, { pie: nav.pie, base: op.base, idioma, anio: op.anio ?? new Date().getFullYear(), nombre: marca.nombre, landings, ultimos: (op.blog?.articulos ?? []).slice(0, ULTIMOS_BLOG) }),
    marca.whatsapp ? h('a', { className: 'whatsapp', href: enlaceWhatsapp(marca.whatsapp), target: '_blank', rel: 'noopener', 'aria-label': `${t.whatsapp} ${t.pestanaNueva}` }, WHATSAPP) : null);
}

const WHATSAPP = h('svg', { width: 28, height: 28, viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: '#fff' },
  h('path', { d: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z' }));

/**
 * HU-1510 · CP-122 · hreflang de una ruta: `es`, `en` y `x-default` (el español) solo si está publicada en los dos
 * idiomas; si no, ninguno (RN-16-6).
 */
export function alternasHref(inst: Pick<Instantanea, 'paginas'>, ruta: string, sitioUrl: string): { hreflang: string; href: string }[] {
  const alternas = alternasDe(inst, ruta);
  if (!alternas.length) return [];
  const url = (idioma: string) => sinBarra(sitioUrl) + rutaPublica(ruta, idioma);
  return [...alternas.map((a) => ({ hreflang: a.idioma, href: url(a.idioma) })), { hreflang: 'x-default', href: url('es') }];
}

const documento = (nodo: ReactNode) => `<!doctype html>${renderToStaticMarkup(nodo)}`;

/** El HTML completo de una página de la instantánea, o `null` si no está publicada en ella. */
export function renderizarPagina(inst: Instantanea, ruta: string, idioma: string, opciones: OpcionesRender): string | null {
  const op = conDominio(inst, opciones);
  const marca = marcaDe(inst);
  const p = paginaServida(inst, ruta, idioma, op.entorno);
  if (!p) return null;
  const i = idiomaDe(p.idioma);
  const publica = rutaPublica(p.ruta, p.idioma);
  const landings = landingsDe(inst, p.idioma);
  let hayH1 = false;
  const bloques = p.bloques.map((b, n) => {
    const portada = b.tipo === 'hero' || b.tipo === 'fhero';
    const nodo = bloque(b.tipo, b.elementos, { base: op.base, idioma: i, entorno: op.entorno, titulo: p.titulo, nivelPortada: portada && !hayH1 ? 'h1' : 'h2', clave: String(n), sector: p.sector, landings, blog: op.blog });
    if (nodo && portada) hayH1 = true;
    return nodo ? h(Fragment, { key: n }, nodo) : null;
  });
  const cuerpo = h(Fragment, null,
    hayH1 ? null : h('section', { className: 'titulo-pagina' }, h('div', { className: 'in' }, h('h1', null, p.titulo))),
    bloques);
  return documento(h(Documento, {
    // HU-1514 · Una landing usa su meta título y el texto de su portada como descripción (RN-16-9).
    titulo: p.sector ? p.sector.metaTitulo : p.ruta === '/' ? `${marca.nombre} · ${p.titulo}` : `${p.titulo} · ${marca.nombre}`,
    descripcion: p.sector?.portada.texto ?? TEXTOS[i].DESCRIPCION,
    canonical: sinBarra(op.sitioUrl) + publica, alternas: alternasHref(inst, p.ruta, op.sitioUrl), idioma: i, entorno: op.entorno, base: op.base, favicon: marca.favicon,
    cssExtra: p.bloques.some((b) => b.tipo === 'bloglista') ? cssBlog(op.blog) : '',
  }, h(Marco, { nav: navegacionDe(inst, i), op, idioma: i, actual: p.ruta, marca, landings, selector: selectorDe(inst, p.ruta, i) }, cuerpo)));
}

/** La página 404 del sitio, con el menú y el pie de la versión (o sin ellos si aún no hay versión). */
export function renderizar404(inst: Instantanea | null, op: OpcionesRender, idioma: string = 'es'): string {
  const i = idiomaDe(idioma);
  const t = INTERFAZ[i];
  const marca = marcaDe(inst);
  return documento(h(Documento, { titulo: `${t.noEncontrada} · ${marca.nombre}`, descripcion: t.noEncontradaTexto, canonical: null, idioma: i, entorno: op.entorno, base: op.base, favicon: marca.favicon },
    h(Marco, { nav: inst ? navegacionDe(inst, i) : { menu: [], pie: [] }, op, idioma: i, actual: '', marca, landings: inst ? landingsDe(inst, i) : [] },
      h('section', { className: 'no-encontrada' }, h('div', { className: 'in' },
        h('h1', null, t.noEncontrada), h('p', null, t.noEncontradaTexto),
        h('a', { className: 'btn primary', href: `${op.base}${i === 'en' ? '/en' : '/'}` }, t.volver))))));
}

/**
 * HU-1509 · CP-121 · La página de aviso del modo mantenimiento (se sirve con 503): solo la marca, el aviso y el mensaje
 * opcional del superadmin, sin menú ni enlaces, y `noindex`. El texto se escapa como todo lo demás (RN-16-7).
 */
export function renderizarMantenimiento(inst: Pick<Instantanea, 'sitio'> | null, op: OpcionesRender, mensaje: string | null, idioma: string = 'es'): string {
  const i = idiomaDe(idioma);
  const t = INTERFAZ[i];
  const marca = { ...marcaDe(inst), whatsapp: null };
  return documento(h(Documento, { titulo: `${t.mantenimiento} · ${marca.nombre}`, descripcion: t.mantenimientoTexto, canonical: null, idioma: i, entorno: op.entorno, base: op.base, favicon: marca.favicon, robots: 'noindex, nofollow' },
    h(Fragment, null,
      h('header', { className: 'shead' }, h('div', { className: 'in' }, h('span', { className: 'wm' }, h(Marcador, { marca, base: op.base })))),
      h('main', { id: 'contenido' },
        h('section', { className: 'mantenimiento' }, h('div', { className: 'in' },
          h('h1', null, t.mantenimiento), h('p', null, t.mantenimientoTexto), mensaje ? h('p', null, mensaje) : null))))));
}

const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * El sitemap de la versión: solo sus páginas, con la fecha de publicación como `lastmod`. HU-1510: una ruta publicada
 * en los dos idiomas lleva sus `xhtml:link` alternos (es, en y x-default) en cada una de sus dos URL.
 */
export function sitemapXml(inst: Pick<Instantanea, 'paginas'>, sitioUrl: string): string {
  const base = sinBarra(sitioUrl);
  const filas = [...inst.paginas].sort((a, b) => a.idioma.localeCompare(b.idioma) || a.ruta.localeCompare(b.ruta));
  const urls = filas.map((p) => {
    const alternas = alternasHref(inst, p.ruta, sitioUrl).map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escaparXml(a.href)}"/>`).join('');
    return `  <url><loc>${escaparXml(base + rutaPublica(p.ruta, p.idioma))}</loc>${p.publicadaEn ? `<lastmod>${p.publicadaEn}</lastmod>` : ''}${alternas}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
}

/**
 * robots.txt: en producción permite todo y apunta al sitemap (HU-1511: y al del blog de WordPress, `wp-sitemap.xml`);
 * en pruebas no deja indexar nada.
 */
export function robotsTxt(op: OpcionesRender): string {
  const blog = op.blog?.url ? `Sitemap: ${op.blog.url}/wp-sitemap.xml\n` : '';
  return op.entorno === 'produccion'
    ? `User-agent: *\nAllow: /\n\nSitemap: ${sinBarra(op.sitioUrl)}/sitemap.xml\n${blog}`
    : 'User-agent: *\nDisallow: /\n';
}

export interface ArchivoSitio { archivo: string; contenido: string; mime: string }

/** Todos los archivos de una versión: una página por ruta e idioma, la 404, el sitemap y robots.txt. */
export function renderizarSitio(inst: Instantanea, opciones: OpcionesRender): ArchivoSitio[] {
  const op = conDominio(inst, opciones);
  const html = 'text/html; charset=utf-8';
  const paginas = inst.paginas.flatMap((p) => {
    const contenido = renderizarPagina(inst, p.ruta, p.idioma, op);
    return contenido ? [{ archivo: archivoDeRuta(rutaPublica(p.ruta, p.idioma)), contenido, mime: html }] : [];
  });
  return [
    ...paginas,
    { archivo: '404.html', contenido: renderizar404(inst, op), mime: html },
    { archivo: 'sitemap.xml', contenido: sitemapXml(inst, op.sitioUrl), mime: 'application/xml; charset=utf-8' },
    { archivo: 'robots.txt', contenido: robotsTxt(op), mime: 'text/plain; charset=utf-8' },
  ];
}
