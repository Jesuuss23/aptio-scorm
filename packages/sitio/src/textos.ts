/**
 * HU-1508 · Textos fijos de los bloques que aún no tienen datos editables (SUP-193). Salen tal cual de
 * `docs/diseno/sitio-comercial.html` y se reemplazan cuando llegue la historia de cada bloque. Son solo en español
 * hasta la HU-1510.
 */
export const HERO = {
  etiqueta: 'Microaprendizaje SCORM con revisión humana',
  titulo: 'Del material del cliente a un SCORM listo para el LMS',
  texto: 'Aptio SCORM genera cápsulas de 3 a 10 minutos con interacciones, personaje con voz, subtítulos y versión en inglés. Tu equipo revisa cada pantalla y exporta SCORM 1.2 o HTML para cualquier LMS.',
  vinetas: ['Cápsulas de 3 a 10 min', 'español e inglés', 'cualquier LMS'],
  cta1: { texto: 'Agendar demo', ruta: '/agendar-demo' },
  cta2: { texto: 'Ver planes', ruta: '/precios' },
  captura: {
    archivo: 'bloqueo-y-etiquetado.zip',
    formato: 'SCORM 1.2',
    etiqueta: 'Voz y boca generadas',
    titulo: 'Bloqueo y etiquetado',
    texto: 'Aísla cada fuente de energía antes de intervenir un equipo.',
    subtitulo: 'Antes de intervenir un equipo, bloquea cada fuente de energía y colócale tu etiqueta.',
    pie: 'Ana explica una pantalla del curso de bloqueo y etiquetado. La boca sigue al audio, sin video.',
  },
} as const;

/** La franja de confianza es una cifra de ejemplo: solo sale en pruebas (RN-16-3, SUP-194). */
export const CONFIANZA = { puntaje: '4.9', texto: 'de 5 según 120 equipos de capacitación' } as const;

export const CTA = {
  etiqueta: 'Empieza con tu material',
  titulo: 'Produce tu próxima cápsula con Aptio SCORM',
  texto: 'Te mostramos el generador con un documento tuyo en 30 minutos.',
} as const;

export const FHERO = {
  etiqueta: 'Personaje y voz',
  titulo: 'Un personaje que habla con la boca sincronizada',
  texto: 'Ana es un dibujo vectorial con capas. La boca se anima en el navegador a partir del audio, así que cambiar el texto no obliga a exportar otro video.',
} as const;

export const COMPARACION = {
  etiqueta: 'Antes y ahora',
  titulo: 'Del video al navegador',
  antes: { titulo: 'Con video', puntos: ['Vector, editor de video y luego SCORM', 'Un cambio de texto obliga a renderizar todo', 'Archivos pesados para el LMS', 'Sin subtítulos editables'] },
  ahora: { titulo: 'Con Aptio SCORM', puntos: ['La boca sale del audio, pantalla por pantalla', 'Se regenera solo la pantalla que cambió', 'Paquete liviano que funciona en el celular', 'Subtítulos editables por idioma'] },
} as const;

export const SECCIONES = {
  logos: 'Producen sus cápsulas con Aptio SCORM',
  pasos: { etiqueta: 'Cómo funciona', titulo: 'Del material a un paquete SCORM en tres pasos', texto: 'Tú pones el material y el criterio. El generador hace el trabajo repetitivo.' },
  funcionalidades: { etiqueta: 'Producto', titulo: 'Qué hace Aptio SCORM por tu equipo' },
  lms: { etiqueta: 'Entrega', titulo: 'Funciona con tu LMS', texto: 'El paquete cumple SCORM 1.2 de forma estricta. Para las plataformas más usadas dejamos además recomendaciones de configuración.' },
  testimonios: { etiqueta: 'Casos en Perú', titulo: 'Equipos que pasaron de semanas a días' },
  faq: { titulo: 'Preguntas frecuentes', texto: '¿No encuentras tu respuesta? Escríbenos o agenda una llamada.' },
} as const;

export const PIE = {
  marca: 'Cápsulas de microaprendizaje para equipos de capacitación. Un producto de AulasEducativas, hecho en Lima.',
} as const;

/** Descripción por defecto de cada página hasta el SEO por página (HU-1512). */
export const DESCRIPCION = 'Aptio SCORM genera cápsulas de microaprendizaje de 3 a 10 minutos con interacciones, personaje con voz, subtítulos e inglés, revisadas por tu equipo y listas para cualquier LMS.';

/** Textos de la estructura de la página por idioma (el contenido sigue en español hasta la HU-1510). */
export const INTERFAZ = {
  es: { saltar: 'Saltar al contenido', menu: 'Menú', principal: 'Principal', pie: 'Pie de página', inicio: 'Inicio', pruebas: 'Sitio de pruebas: puede mostrar datos de ejemplo.', ficticio: 'Dato de ejemplo', noEncontrada: 'Página no encontrada', noEncontradaTexto: 'La dirección no existe o la página ya no está publicada.', volver: 'Ir al inicio', derechos: 'Todos los derechos reservados.' },
  en: { saltar: 'Skip to content', menu: 'Menu', principal: 'Main', pie: 'Footer', inicio: 'Home', pruebas: 'Test site: it may show sample data.', ficticio: 'Sample data', noEncontrada: 'Page not found', noEncontradaTexto: 'The address does not exist or the page is no longer published.', volver: 'Go to the home page', derechos: 'All rights reserved.' },
} as const;
export type Idioma = keyof typeof INTERFAZ;
