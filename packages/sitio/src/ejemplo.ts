/**
 * HU-1508 · Un sitio de ejemplo armado con la misma función que la API (`armarInstantanea`): el Inicio con sus bloques
 * del prototipo, una página de funcionalidad, las landings de sector (HU-1514), menú y pie, y el inicio en inglés con su
 * propio contenido, menú y pie (HU-1510). HU-1511: `blogDeEjemplo` es la copia del blog del prototipo (9 artículos en 7
 * categorías, con Noticias internas y un artículo ocultos), que el render suma en la sección Blog y el pie. Lo usan las pruebas, la medición con Lighthouse (CP-120) y Playwright. Un
 * testimonio va marcado como ficticio para probar que en producción no sale.
 */
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import { armarInstantanea, type Instantanea } from '@aptio/schema/sitio-versiones';
import { blogPublico, type BlogPublico, CONEXION_BLOG_POR_DEFECTO, type ConexionBlog, type FilaArticuloBlog, type FilaCategoriaBlog } from '@aptio/schema/sitio-blog';

const F = '2026-11-13T15:00:00.000Z';
const pagina = (id: string, ruta: string, titulo: string, tipos: string[], idioma = 'es') => ({
  id, ruta, idioma, titulo, estado: 'PUBLICADA', publicadaEn: F,
  bloques: tipos.map((tipo, orden) => ({ id: `${id}-${orden}`, tipo, orden, visible: true, ajustes: null })),
});
let n = 0;
const el = (coleccion: string, datos: Record<string, string | number>, ficticio = false, idioma = 'es') => ({ id: `e${++n}`, coleccion, orden: n, visible: true, ficticio, datos, idioma });
/** HU-1510 · Un elemento en inglés. */
const en = (coleccion: string, datos: Record<string, string | number>) => el(coleccion, datos, false, 'en');
/** HU-1514 · Las landings del prototipo: 4 publicadas y Sector público en borrador (no sale en el sitio, CP-158). */
const landing = (id: string, sector: string, titulo: string, texto: string, blog: string, estado = 'PUBLICADA') => ({
  ...pagina(id, `/sectores/${id}`, sector, ['hero', 'testimonios', 'faq', 'bloglista', 'cta']), estado, publicadaEn: estado === 'PUBLICADA' ? F : null,
  tipo: 'sector', sector, portada: { titulo, texto }, metaTitulo: `Capacitación en ${sector.toLowerCase()} con cápsulas SCORM`, blogCategoriaInicial: blog,
});
const enlace = (id: string, zona: string, texto: string, ruta: string | null, orden: number, padreId: string | null = null, idioma = 'es') => ({ id, zona, padreId, texto, ruta, orden, visible: true, idioma });

export function instantaneaDeEjemplo(entorno: EntornoSitio = 'produccion'): Instantanea {
  n = 0;
  return armarInstantanea({
    paginas: [
      pagina('inicio', '/', 'Inicio', ['hero', 'metricas', 'confianza', 'logos', 'pasos', 'funcionalidades', 'lms', 'sectores', 'testimonios', 'faq', 'bloglista', 'cta']),
      landing('mineria-y-energia', 'Minería y energía', 'Cápsulas de seguridad para operaciones mineras y de energía', 'Bloqueo y etiquetado, trabajos en altura y espacios confinados en cápsulas de 5 minutos para el celular.', 'Casos'),
      landing('banca-y-seguros', 'Banca y seguros', 'Cumplimiento normativo en cápsulas que sí se terminan', 'Prevención de lavado de activos y seguridad de la información en cápsulas cortas, con evaluación en tu LMS.', 'Estándares'),
      landing('retail-y-consumo', 'Retail y consumo', 'Inducciones de tienda que caben entre dos turnos', 'Producto, caja, atención y seguridad en cápsulas que el personal ve desde el celular.', 'Microaprendizaje'),
      landing('educacion-superior', 'Educación superior', 'Educación continua bilingüe sin doble producción', 'Tus clases en cápsulas en español e inglés dentro del mismo paquete.', 'Guías'),
      landing('sector-publico', 'Sector público', 'Capacitación accesible para servidores públicos', 'Cápsulas accesibles con subtítulos y navegación por teclado.', 'Accesibilidad', 'BORRADOR'),
      pagina('personaje', '/funcionalidades/personaje', 'Personaje', ['fhero', 'comparacion', 'testimonios', 'cta']),
      pagina('en', '/', 'Home', ['hero', 'metricas', 'testimonios', 'cta'], 'en'),
      { ...pagina('borrador', '/borrador', 'Borrador', ['hero']), estado: 'BORRADOR', publicadaEn: null },
    ],
    elementos: [
      el('cifras', { valor: '4 días', etiqueta: 'para entregar una cápsula de 30 pantallas' }),
      el('cifras', { valor: '2 idiomas', etiqueta: 'en un mismo paquete, con subtítulos' }),
      el('cifras', { valor: 'SCORM 1.2', etiqueta: 'estricto, para cualquier LMS' }),
      el('logos', { nombre: 'Minera Andina' }), el('logos', { nombre: 'Banco del Sur' }),
      el('pasos', { titulo: 'Sube el material', texto: 'Un tema, un documento largo o tu propio video.' }),
      el('pasos', { titulo: 'La IA propone', texto: 'Estructura, pantallas, voz, boca y subtítulos.' }),
      el('pasos', { titulo: 'Tu equipo revisa', texto: 'Aprueba pantalla por pantalla y exporta.' }),
      el('funcionalidades', { etiqueta: 'Revisión', titulo: 'Revisión pantalla por pantalla', texto: 'Comentarios del cliente y cambios en cascada.', vinetas: 'Aprobar o comentar\nRegenerar solo lo que cambió' }),
      el('funcionalidades', { etiqueta: 'Idiomas', titulo: 'Español e inglés', texto: 'Las dos versiones en un mismo paquete.' }),
      el('lms', { nombre: 'Moodle 4.5', nota: 'Con recomendaciones' }), el('lms', { nombre: 'Canvas' }),
      el('testimonios', { nombre: 'Mariana Paredes', cargo: 'Jefa de capacitación', empresa: 'Minera Andina', sector: 'Minería y energía', texto: 'Pasamos de semanas a días.', estrellas: 5 }),
      el('testimonios', { nombre: 'Jorge Huamán', cargo: 'Jefe de SSOMA', empresa: 'Energía Costa Verde', sector: 'Minería y energía', texto: 'Si cambia una norma, se regenera solo esa pantalla.', estrellas: 5 }),
      el('testimonios', { nombre: 'Carlos Alarcón', cargo: 'Coordinador de e-learning', empresa: 'Banco Altiplano', sector: 'Banca y seguros', texto: 'El paquete subió a nuestro Moodle sin ajustes.', estrellas: 5 }),
      el('testimonios', { nombre: 'Persona de ejemplo', cargo: 'Cargo', empresa: 'Empresa <b>ficticia</b>', texto: 'Texto de ejemplo.', estrellas: 5 }, true),
      el('preguntas', { pregunta: '¿Funciona con mi LMS?', respuesta: 'Sí: el paquete cumple SCORM 1.2 de forma estricta.' }),
      el('preguntas', { pregunta: '¿Sirve para procedimientos de seguridad?', respuesta: 'Sí: bloqueo y etiquetado, altura y espacios confinados.', pagina: '/sectores/mineria-y-energia' }),
      // HU-1510 · El contenido del sitio en inglés: la página /en solo usa estos.
      en('cifras', { valor: '4 days', etiqueta: 'to deliver a 30-screen capsule' }),
      en('cifras', { valor: '2 languages', etiqueta: 'in one package, with subtitles' }),
      en('testimonios', { nombre: 'Laura Mendoza', cargo: 'L&D Manager', empresa: 'Andes Mining Group', texto: 'We went from weeks to days.', estrellas: 5 }),
    ],
    enlaces: [
      enlace('m1', 'menu', 'Producto', '/funcionalidades/personaje', 0), enlace('m2', 'menu', 'Casos', '/#testimonios', 1),
      enlace('m3', 'menu', 'Blog', 'https://blog.aptioscorm.com', 2),
      enlace('c1', 'pie', 'Legal', null, 0), enlace('l1', 'pie', 'Privacidad', '/privacidad', 0, 'c1'),
      enlace('m1en', 'menu', 'Customer stories', '/en#testimonios', 0, null, 'en'), enlace('m2en', 'menu', 'Blog', 'https://blog.aptioscorm.com', 1, null, 'en'),
      enlace('c1en', 'pie', 'Company', null, 0, null, 'en'), enlace('l1en', 'pie', 'Privacy', '/en/privacidad', 0, 'c1en', 'en'),
    ],
  }, entorno);
}

/** HU-1511 · La copia del blog del prototipo: lo que guardaría la sincronización con WordPress (sin imágenes). */
export function blogDeEjemplo(): { conexion: ConexionBlog; categorias: FilaCategoriaBlog[]; articulos: FilaArticuloBlog[]; publico: BlogPublico } {
  const conexion: ConexionBlog = { ...CONEXION_BLOG_POR_DEFECTO, url: 'https://blog.aptioscorm.com' };
  const nombres = ['Microaprendizaje', 'Estándares', 'Guías', 'Accesibilidad', 'Gestión', 'Casos', 'Noticias internas'];
  const slugs = ['microaprendizaje', 'estandares', 'guias', 'accesibilidad', 'gestion', 'casos', 'noticias-internas'];
  const categorias: FilaCategoriaBlog[] = nombres.map((nombre, i) => ({ id: i + 3, nombre, slug: slugs[i]!, orden: i, visible: nombre !== 'Noticias internas' }));
  const cat = (nombre: string) => nombres.indexOf(nombre) + 3;
  const art = (id: number, slug: string, titulo: string, categoria: string, extracto: string, autor: string, fecha: string, visible = true): FilaArticuloBlog => ({
    id, titulo, extracto, categorias: [cat(categoria)], autor, fecha: `${fecha}T14:00:00.000Z`, enlace: `${conexion.url}/${slug}/`, visible, imagen: null, imagenAncho: null, imagenAlto: null,
  });
  const articulos = [
    art(412, 'que-es-una-capsula-de-microaprendizaje', 'Qué es una cápsula de microaprendizaje y cuándo usarla', 'Microaprendizaje', 'Cinco señales de que un tema funciona mejor en 5 minutos que en una hora.', 'Carla Montoya', '2026-10-28'),
    art(405, 'scorm-12-scorm-2004-cmi5', 'SCORM 1.2, SCORM 2004 y cmi5: cuál pedir a tu proveedor', 'Estándares', 'Qué registra cada formato y por qué SCORM 1.2 sigue siendo el más compatible.', 'Luis Ríos', '2026-10-21'),
    art(398, 'preparar-un-manual-para-una-capsula', 'Cómo preparar un manual para convertirlo en cápsula', 'Guías', 'Lo que la IA necesita para resumir sin perder lo importante.', 'Carla Montoya', '2026-10-14'),
    art(391, 'subtitulos-y-accesibilidad', 'Subtítulos y accesibilidad en cursos corporativos', 'Accesibilidad', 'WebVTT, contraste y navegación con teclado sin complicarte.', 'Sofía Cárdenas', '2026-10-07'),
    art(384, 'cuanto-cuesta-producir-un-curso', 'Cuánto cuesta producir un curso: cómo medirlo', 'Gestión', 'Una plantilla para medir horas por pantalla antes de cambiar de proceso.', 'Luis Ríos', '2026-09-30'),
    art(377, 'bloqueo-y-etiquetado-en-5-minutos', 'Bloqueo y etiquetado explicado en 5 minutos', 'Casos', 'Cómo se armó una cápsula de seguridad desde un manual de 40 páginas.', 'Carla Montoya', '2026-09-23'),
    art(370, 'guiones-para-voz-con-ia', 'Cómo escribir guiones que suenen bien con voz de IA', 'Guías', 'Frases cortas, números escritos y pausas: lo que mejora la locución.', 'Sofía Cárdenas', '2026-09-16'),
    art(363, 'evaluacion-formativa-vs-sumativa', 'Evaluación formativa y sumativa en cápsulas cortas', 'Microaprendizaje', 'Cuándo enseñar con la pregunta y cuándo medir con ella.', 'Luis Ríos', '2026-09-09', false),
    art(356, 'aniversario-del-equipo', 'Celebramos 10 años del equipo de producción', 'Noticias internas', 'Un repaso de los proyectos que nos trajeron hasta aquí.', 'Equipo Aptio', '2026-09-02'),
  ];
  return { conexion, categorias, articulos, publico: blogPublico(conexion, categorias, articulos) };
}
