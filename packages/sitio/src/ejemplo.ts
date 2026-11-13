/**
 * HU-1508 · Un sitio de ejemplo armado con la misma función que la API (`armarInstantanea`): el Inicio con sus bloques
 * del prototipo, una página de funcionalidad, una en inglés, las landings de sector (HU-1514), menú y pie. Lo usan las
 * pruebas, la medición con Lighthouse (CP-120) y Playwright. Un testimonio va marcado como ficticio para probar que en producción no sale.
 */
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import { armarInstantanea, type Instantanea } from '@aptio/schema/sitio-versiones';

const F = '2026-11-13T15:00:00.000Z';
const pagina = (id: string, ruta: string, titulo: string, tipos: string[], idioma = 'es') => ({
  id, ruta, idioma, titulo, estado: 'PUBLICADA', publicadaEn: F,
  bloques: tipos.map((tipo, orden) => ({ id: `${id}-${orden}`, tipo, orden, visible: true, ajustes: null })),
});
let n = 0;
const el = (coleccion: string, datos: Record<string, string | number>, ficticio = false) => ({ id: `e${++n}`, coleccion, orden: n, visible: true, ficticio, datos });
/** HU-1514 · Las landings del prototipo: 4 publicadas y Sector público en borrador (no sale en el sitio, CP-158). */
const landing = (id: string, sector: string, titulo: string, texto: string, blog: string, estado = 'PUBLICADA') => ({
  ...pagina(id, `/sectores/${id}`, sector, ['hero', 'testimonios', 'faq', 'cta']), estado, publicadaEn: estado === 'PUBLICADA' ? F : null,
  tipo: 'sector', sector, portada: { titulo, texto }, metaTitulo: `Capacitación en ${sector.toLowerCase()} con cápsulas SCORM`, blogCategoriaInicial: blog,
});
const enlace = (id: string, zona: string, texto: string, ruta: string | null, orden: number, padreId: string | null = null) => ({ id, zona, padreId, texto, ruta, orden, visible: true });

export function instantaneaDeEjemplo(entorno: EntornoSitio = 'produccion'): Instantanea {
  n = 0;
  return armarInstantanea({
    paginas: [
      pagina('inicio', '/', 'Inicio', ['hero', 'metricas', 'confianza', 'logos', 'pasos', 'funcionalidades', 'lms', 'sectores', 'testimonios', 'faq', 'cta']),
      landing('mineria-y-energia', 'Minería y energía', 'Cápsulas de seguridad para operaciones mineras y de energía', 'Bloqueo y etiquetado, trabajos en altura y espacios confinados en cápsulas de 5 minutos para el celular.', 'Casos'),
      landing('banca-y-seguros', 'Banca y seguros', 'Cumplimiento normativo en cápsulas que sí se terminan', 'Prevención de lavado de activos y seguridad de la información en cápsulas cortas, con evaluación en tu LMS.', 'Estándares'),
      landing('retail-y-consumo', 'Retail y consumo', 'Inducciones de tienda que caben entre dos turnos', 'Producto, caja, atención y seguridad en cápsulas que el personal ve desde el celular.', 'Microaprendizaje'),
      landing('educacion-superior', 'Educación superior', 'Educación continua bilingüe sin doble producción', 'Tus clases en cápsulas en español e inglés dentro del mismo paquete.', 'Guías'),
      landing('sector-publico', 'Sector público', 'Capacitación accesible para servidores públicos', 'Cápsulas accesibles con subtítulos y navegación por teclado.', 'Accesibilidad', 'BORRADOR'),
      pagina('personaje', '/funcionalidades/personaje', 'Personaje', ['fhero', 'comparacion', 'testimonios', 'cta']),
      pagina('en', '/', 'Home', ['hero', 'cta'], 'en'),
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
    ],
    enlaces: [
      enlace('m1', 'menu', 'Producto', '/funcionalidades/personaje', 0), enlace('m2', 'menu', 'Casos', '/#testimonios', 1),
      enlace('m3', 'menu', 'Blog', 'https://blog.aptioscorm.com', 2),
      enlace('c1', 'pie', 'Legal', null, 0), enlace('l1', 'pie', 'Privacidad', '/privacidad', 0, 'c1'),
    ],
  }, entorno);
}
