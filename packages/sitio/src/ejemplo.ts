/**
 * HU-1508 · Un sitio de ejemplo armado con la misma función que la API (`armarInstantanea`): el Inicio con sus bloques
 * del prototipo, una página de funcionalidad, una en inglés, menú y pie. Lo usan las pruebas, la medición con Lighthouse
 * (CP-120) y Playwright. Un testimonio va marcado como ficticio para probar que en producción no sale.
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
const enlace = (id: string, zona: string, texto: string, ruta: string | null, orden: number, padreId: string | null = null) => ({ id, zona, padreId, texto, ruta, orden, visible: true });

export function instantaneaDeEjemplo(entorno: EntornoSitio = 'produccion'): Instantanea {
  n = 0;
  return armarInstantanea({
    paginas: [
      pagina('inicio', '/', 'Inicio', ['hero', 'metricas', 'confianza', 'logos', 'pasos', 'funcionalidades', 'lms', 'testimonios', 'faq', 'cta']),
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
      el('testimonios', { nombre: 'Mariana Paredes', cargo: 'Jefa de capacitación', empresa: 'Minera Andina', texto: 'Pasamos de semanas a días.', estrellas: 5 }),
      el('testimonios', { nombre: 'Persona de ejemplo', cargo: 'Cargo', empresa: 'Empresa <b>ficticia</b>', texto: 'Texto de ejemplo.', estrellas: 5 }, true),
      el('preguntas', { pregunta: '¿Funciona con mi LMS?', respuesta: 'Sí: el paquete cumple SCORM 1.2 de forma estricta.' }),
    ],
    enlaces: [
      enlace('m1', 'menu', 'Producto', '/funcionalidades/personaje', 0), enlace('m2', 'menu', 'Casos', '/#testimonios', 1),
      enlace('m3', 'menu', 'Blog', 'https://blog.aptioscorm.com', 2),
      enlace('c1', 'pie', 'Legal', null, 0), enlace('l1', 'pie', 'Privacidad', '/privacidad', 0, 'c1'),
    ],
  }, entorno);
}
