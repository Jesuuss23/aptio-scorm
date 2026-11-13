/**
 * HU-1508 · Textos fijos de los bloques que aún no tienen datos editables (SUP-193). Salen tal cual de
 * `docs/diseno/sitio-comercial.html` y se reemplazan cuando llegue la historia de cada bloque. HU-1510: cada uno tiene
 * su versión en inglés (`TEXTOS.en`), traducida del prototipo y pendiente de revisión de producto (SUP-212).
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
  /** HU-1514 · Bloque «Sectores» del inicio y columna del pie. */
  sectores: { etiqueta: 'Sectores', titulo: 'Pensado para cómo capacita tu sector', verSolucion: 'Ver la solución' },
} as const;

export const PIE = {
  marca: 'Cápsulas de microaprendizaje para equipos de capacitación. Un producto de AulasEducativas, hecho en Lima.',
} as const;

/** Descripción por defecto de cada página hasta el SEO por página (HU-1512). */
export const DESCRIPCION = 'Aptio SCORM genera cápsulas de microaprendizaje de 3 a 10 minutos con interacciones, personaje con voz, subtítulos e inglés, revisadas por tu equipo y listas para cualquier LMS.';

/** Textos de la estructura de la página por idioma. */
export const INTERFAZ = {
  es: { saltar: 'Saltar al contenido', menu: 'Menú', principal: 'Principal', pie: 'Pie de página', inicio: 'Inicio', pruebas: 'Sitio de pruebas: puede mostrar datos de ejemplo.', ficticio: 'Dato de ejemplo', noEncontrada: 'Página no encontrada', noEncontradaTexto: 'La dirección no existe o la página ya no está publicada.', volver: 'Ir al inicio', derechos: 'Todos los derechos reservados.', mantenimiento: 'Volvemos pronto', mantenimientoTexto: 'Estamos haciendo mejoras en el sitio. Vuelve a intentarlo en unos minutos.', whatsapp: 'Escríbenos por WhatsApp', pestanaNueva: '(se abre en una pestaña nueva)', idioma: 'Idioma', nombreIdioma: 'Español' },
  en: { saltar: 'Skip to content', menu: 'Menu', principal: 'Main', pie: 'Footer', inicio: 'Home', pruebas: 'Test site: it may show sample data.', ficticio: 'Sample data', noEncontrada: 'Page not found', noEncontradaTexto: 'The address does not exist or the page is no longer published.', volver: 'Go to the home page', derechos: 'All rights reserved.', mantenimiento: 'We will be back soon', mantenimientoTexto: 'We are improving the site. Please try again in a few minutes.', whatsapp: 'Message us on WhatsApp', pestanaNueva: '(opens in a new tab)', idioma: 'Language', nombreIdioma: 'English' },
} as const;
export type Idioma = keyof typeof INTERFAZ;

/** HU-1510 · Los mismos textos fijos en inglés (traducción del prototipo, SUP-212). */
const HERO_EN = {
  etiqueta: 'SCORM microlearning with human review',
  titulo: "From your client's material to a SCORM package ready for the LMS",
  texto: 'Aptio SCORM builds 3 to 10 minute capsules with interactions, a speaking character, subtitles and an English version. Your team reviews every screen and exports SCORM 1.2 or HTML for any LMS.',
  vinetas: ['3 to 10 minute capsules', 'Spanish and English', 'any LMS'],
  cta1: { texto: 'Book a demo', ruta: '/agendar-demo' },
  cta2: { texto: 'See plans', ruta: '/precios' },
  captura: {
    archivo: 'lockout-tagout.zip',
    formato: 'SCORM 1.2',
    etiqueta: 'Generated voice and lip sync',
    titulo: 'Lockout and tagout',
    texto: 'Isolate every energy source before servicing equipment.',
    subtitulo: 'Before servicing equipment, lock out every energy source and attach your tag.',
    pie: 'Ana explains a screen of the lockout and tagout course. Her mouth follows the audio, with no video.',
  },
} as const;

/** Todos los textos fijos de un idioma. */
export const TEXTOS = {
  es: { HERO, CONFIANZA, CTA, FHERO, COMPARACION, SECCIONES, PIE, DESCRIPCION },
  en: {
    HERO: HERO_EN,
    CONFIANZA: { puntaje: '4.9', texto: 'out of 5 from 120 training teams' },
    CTA: { etiqueta: 'Start with your material', titulo: 'Produce your next capsule with Aptio SCORM', texto: 'We will show you the generator with one of your documents in 30 minutes.' },
    FHERO: {
      etiqueta: 'Character and voice',
      titulo: 'A character who speaks with lip sync',
      texto: 'Ana is a layered vector drawing. Her mouth is animated in the browser from the audio, so changing the text does not mean exporting another video.',
    },
    COMPARACION: {
      etiqueta: 'Before and now',
      titulo: 'From video to the browser',
      antes: { titulo: 'With video', puntos: ['Vector, video editor and then SCORM', 'A text change means rendering everything again', 'Heavy files for the LMS', 'No editable subtitles'] },
      ahora: { titulo: 'With Aptio SCORM', puntos: ['The mouth comes from the audio, screen by screen', 'Only the screen that changed is regenerated', 'A light package that works on phones', 'Editable subtitles per language'] },
    },
    SECCIONES: {
      logos: 'Teams producing their capsules with Aptio SCORM',
      pasos: { etiqueta: 'How it works', titulo: 'From material to a SCORM package in three steps', texto: 'You bring the material and the judgment. The generator does the repetitive work.' },
      funcionalidades: { etiqueta: 'Product', titulo: 'What Aptio SCORM does for your team' },
      lms: { etiqueta: 'Delivery', titulo: 'Works with your LMS', texto: 'The package strictly follows SCORM 1.2. For the most used platforms we also include setup recommendations.' },
      testimonios: { etiqueta: 'Customer stories', titulo: 'Teams that went from weeks to days' },
      faq: { titulo: 'Frequently asked questions', texto: "Can't find your answer? Write to us or book a call." },
      sectores: { etiqueta: 'Industries', titulo: 'Built for the way your industry trains', verSolucion: 'See the solution' },
    },
    PIE: { marca: 'Microlearning capsules for training teams. A product by AulasEducativas, made in Lima.' },
    DESCRIPCION: 'Aptio SCORM builds 3 to 10 minute microlearning capsules with interactions, a speaking character, subtitles and English, reviewed by your team and ready for any LMS.',
  },
} as const;
