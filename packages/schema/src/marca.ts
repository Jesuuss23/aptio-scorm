// Capa de marca (decisión 4): datos del kit que comparten la API, la web y, más adelante, el reproductor.

export type RolColor = 'primario' | 'secundario' | 'acento' | 'fondo' | 'texto';
export type Paleta = Record<RolColor, string>;

export const ROLES_COLOR: readonly RolColor[] = ['primario', 'secundario', 'acento', 'fondo', 'texto'];
export const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Estilos base del kit (prototipo unificado). */
export const ESTILOS_KIT = ['Industrial', 'Corporativo', 'Institucional', 'Infantil aula', 'Salud'] as const;
export type EstiloKit = (typeof ESTILOS_KIT)[number];

/**
 * Tipografías permitidas en el kit: lista cerrada de fuentes con licencia SIL Open Font License 1.1,
 * que se sirven desde el propio paquete (sin Google Fonts en tiempo de ejecución). Las fuentes propias del
 * cliente llegan después, con su licencia (SUP-17).
 */
export const FUENTES_KIT = [
  { id: 'barlow-condensed', familia: 'Barlow Condensed', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'montserrat', familia: 'Montserrat', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'poppins', familia: 'Poppins', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'merriweather', familia: 'Merriweather', categoria: 'titulos', licencia: 'OFL-1.1' },
  { id: 'plus-jakarta-sans', familia: 'Plus Jakarta Sans', categoria: 'ambos', licencia: 'OFL-1.1' },
  { id: 'atkinson-hyperlegible', familia: 'Atkinson Hyperlegible', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'open-sans', familia: 'Open Sans', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'nunito', familia: 'Nunito', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'lato', familia: 'Lato', categoria: 'textos', licencia: 'OFL-1.1' },
  { id: 'source-sans-3', familia: 'Source Sans 3', categoria: 'textos', licencia: 'OFL-1.1' },
] as const;
export type FuenteKit = (typeof FUENTES_KIT)[number];
export const FAMILIAS_KIT: readonly string[] = FUENTES_KIT.map((f) => f.familia);

/** Kit con el que arranca un cliente nuevo: el ejemplo industrial del prototipo, para que la vista previa no salga vacía. */
export const KIT_INICIAL = {
  estilo: 'Corporativo' as EstiloKit,
  paleta: { primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' } satisfies Paleta,
  tipografias: { titulos: 'Barlow Condensed', textos: 'Atkinson Hyperlegible' },
  voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 } },
};

/** Contraste mínimo de texto normal (WCAG 2.2 AA). */
export const CONTRASTE_AA = 4.5;

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Relación de contraste WCAG entre dos colores hex (#RRGGBB), de 1 a 21. */
export function contraste(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) throw new Error(`Color no válido: ${HEX.test(a) ? b : a}`);
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

export interface Advertencia {
  codigo: 'CONTRASTE_BAJO';
  mensaje: string;
  colores: [RolColor, RolColor];
  relacion: number;
}

/**
 * Pares de la paleta que se usan como texto sobre fondo en las pantallas. Un contraste bajo advierte y no
 * bloquea (RN-02-2): la marca del cliente manda, pero el equipo debe saberlo.
 */
const PARES_TEXTO: [RolColor, RolColor][] = [['texto', 'fondo'], ['primario', 'fondo']];

const redondear = (n: number) => Math.round(n * 100) / 100;

export function revisarPaleta(p: Paleta): { textoFondo: number; cumpleAA: boolean; advertencias: Advertencia[] } {
  const advertencias: Advertencia[] = [];
  for (const [t, f] of PARES_TEXTO) {
    const relacion = redondear(contraste(p[t], p[f]));
    if (relacion < CONTRASTE_AA) {
      advertencias.push({
        codigo: 'CONTRASTE_BAJO',
        mensaje: `El ${t} sobre el ${f} tiene contraste ${relacion.toFixed(1).replace('.', ',')}:1, menor a 4,5:1`,
        colores: [t, f],
        relacion,
      });
    }
  }
  const textoFondo = redondear(contraste(p.texto, p.fondo));
  return { textoFondo, cumpleAA: textoFondo >= CONTRASTE_AA, advertencias };
}

// ---------- Personaje (HU-0203, docs/20-guia-diseno.md §1) ----------

export const BOCAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'] as const;
export type Boca = (typeof BOCAS)[number];

/** Capas sin las que el reproductor no puede animar al personaje. */
export const CAPAS_OBLIGATORIAS = [
  'personaje', 'cabeza', 'ojos_abiertos', 'ojos_cerrados', 'pose_neutral', 'pose_explicando',
  'boca_A', 'boca_B', 'boca_C', 'boca_D', 'boca_E', 'boca_F', 'boca_X',
] as const;
export const CAPAS_RECOMENDADAS = ['boca_G', 'boca_H', 'pose_celebrando', 'pose_advirtiendo', 'pose_pensando', 'cejas'] as const;

/** Si falta una boca recomendada, el reproductor usa la más parecida (RN-07-3). */
export const REEMPLAZO_BOCA: Partial<Record<Boca, Boca>> = { G: 'B', H: 'C' };

/** Peso máximo del personaje: más pesado se nota en el celular. */
export const MAX_BYTES_PERSONAJE = 200 * 1024;
const BYTES_IDEALES_PERSONAJE = 120 * 1024;

export interface RevisionPersonaje {
  bocasDisponibles: Boca[];
  bocasFaltantes: Boca[];
  /** Boca que la reemplaza mientras el diseñador la agrega: { G: 'B' }. */
  reemplazos: Partial<Record<Boca, Boca>>;
  poses: string[];
  /** Bloquean: el personaje no se puede usar. */
  errores: string[];
  /** No bloquean. */
  avisos: string[];
}

export function revisarPersonaje({ ids, viewBox, bytes }: { ids: readonly string[]; viewBox: string | null; bytes: number }): RevisionPersonaje {
  const hay = new Set(ids);
  const bocasDisponibles = BOCAS.filter((b) => hay.has(`boca_${b}`));
  const bocasFaltantes = BOCAS.filter((b) => !hay.has(`boca_${b}`));
  const reemplazos: Partial<Record<Boca, Boca>> = {};
  for (const b of bocasFaltantes) {
    const r = REEMPLAZO_BOCA[b];
    if (r && hay.has(`boca_${r}`)) reemplazos[b] = r;
  }
  const errores = CAPAS_OBLIGATORIAS.filter((c) => !hay.has(c)).map((c) => `Falta la capa obligatoria «${c}»`);
  if (bytes > MAX_BYTES_PERSONAJE) errores.push(`Pesa ${Math.round(bytes / 1024)} KB; el máximo es 200 KB`);
  const avisos = CAPAS_RECOMENDADAS.filter((c) => !hay.has(c)).map((c) => {
    const boca = c.startsWith('boca_') ? (c.slice(5) as Boca) : null;
    return boca && reemplazos[boca] ? `${boca} falta: se usa la ${reemplazos[boca]} hasta que se agregue` : `Falta la capa recomendada «${c}»`;
  });
  if (!viewBox) avisos.push('Falta viewBox: el personaje no se adaptará a la pantalla');
  else {
    const [, , ancho, alto] = viewBox.trim().split(/[\s,]+/).map(Number);
    if (ancho && alto && Math.abs(ancho / alto - 0.75) > 0.02) avisos.push(`Proporción ${ancho}:${alto}; se espera 3:4 (por ejemplo 300 × 400)`);
  }
  if (bytes > BYTES_IDEALES_PERSONAJE && bytes <= MAX_BYTES_PERSONAJE) avisos.push(`Pesa ${Math.round(bytes / 1024)} KB; lo ideal es menos de 120 KB`);
  return { bocasDisponibles, bocasFaltantes, reemplazos, poses: ids.filter((i) => i.startsWith('pose_')).map((i) => i.slice(5)), errores, avisos };
}

// ---------- Pantallas modelo (HU-0204, docs/20-guia-diseno.md §4) ----------

/** Disposiciones del curso (curso-v0.schema.json, $defs.pantalla.disposicion). */
export const DISPOSICIONES = [
  'portada', 'objetivos', 'personaje', 'dato', 'idea', 'lista', 'memoria', 'clasificar', 'ordenar',
  'decision', 'video', 'hotspot', 'quiz', 'vf', 'resumen', 'seccion', 'resultados', 'cierre',
] as const;
export type Disposicion = (typeof DISPOSICIONES)[number];

export const NOMBRE_DISPOSICION: Record<Disposicion, string> = {
  portada: 'Portada', objetivos: 'Objetivos', personaje: 'Personaje', dato: 'Dato', idea: 'Idea clave', lista: 'Lista',
  memoria: 'Memoria', clasificar: 'Clasificar', ordenar: 'Ordenar', decision: 'Decisión', video: 'Video',
  hotspot: 'Puntos en escena', quiz: 'Pregunta', vf: 'Mito o realidad', resumen: 'Resumen', seccion: 'Sección',
  resultados: 'Resultados', cierre: 'Cierre',
};

/** Zonas que el generador llena en cada disposición (tabla de la guía de diseño). */
export const ZONAS: Record<Disposicion, readonly string[]> = {
  portada: ['titulo', 'subtitulo', 'personaje', 'fondo'],
  objetivos: ['titulo', 'lista'],
  personaje: ['personaje', 'globo', 'titulo'],
  dato: ['dato', 'texto', 'icono'],
  idea: ['titulo', 'texto', 'dato', 'imagen'],
  lista: ['titulo', 'tarjetas'],
  memoria: ['titulo', 'juego'],
  clasificar: ['titulo', 'juego'],
  ordenar: ['titulo', 'juego'],
  decision: ['situacion', 'opciones', 'retroalimentacion'],
  video: ['video', 'marcadores'],
  hotspot: ['escena', 'puntos', 'detalle'],
  quiz: ['pregunta', 'opciones', 'marcador'],
  vf: ['afirmacion', 'botones'],
  resumen: ['titulo', 'ideas'],
  seccion: ['numero', 'titulo'],
  resultados: ['puntaje', 'estrellas', 'insignia'],
  cierre: ['titulo', 'personaje', 'boton'],
};

export const TAMANOS_ZONA = ['sm', 'md', 'lg', 'xl'] as const;
export const ALINEACIONES = ['inicio', 'centro', 'fin'] as const;

/** Zona en porcentaje del lienzo (0–100): el reproductor no usa píxeles fijos (decisión 4). */
export interface ZonaModelo {
  zona: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color?: RolColor;
  tamano?: (typeof TAMANOS_ZONA)[number];
  alineacion?: (typeof ALINEACIONES)[number];
}

/** Definición de una pantalla modelo: fondo con un rol del kit y zonas por dispositivo. */
export interface DefinicionModelo {
  fondo: RolColor;
  celular: ZonaModelo[];
  escritorio: ZonaModelo[];
}

export const DISPOSITIVOS = ['celular', 'escritorio'] as const;

/** Errores de una definición; vacío si es válida. Las zonas deben ser de la disposición y caber en el lienzo. */
export function erroresDefinicion(disposicion: string, d: unknown): string[] {
  if (!(DISPOSICIONES as readonly string[]).includes(disposicion)) return [`Disposición desconocida: ${disposicion}`];
  const zonas = ZONAS[disposicion as Disposicion];
  const def = d as Partial<DefinicionModelo> | null;
  if (!def || typeof def !== 'object') return ['La definición debe ser un objeto'];
  const errores: string[] = [];
  if (!def.fondo || !ROLES_COLOR.includes(def.fondo)) errores.push('El fondo debe ser un color del kit (primario, secundario, acento, fondo o texto)');
  for (const disp of DISPOSITIVOS) {
    const lista = def[disp];
    if (!Array.isArray(lista) || lista.length === 0) {
      errores.push(`Faltan las zonas de ${disp}`);
      continue;
    }
    const vistas = new Set<string>();
    for (const z of lista as Partial<ZonaModelo>[]) {
      const nombre = String(z?.zona ?? '');
      if (!zonas.includes(nombre)) errores.push(`${disp}: la zona «${nombre}» no es de la disposición ${disposicion}`);
      if (vistas.has(nombre)) errores.push(`${disp}: la zona «${nombre}» está repetida`);
      vistas.add(nombre);
      const [x, y, ancho, alto] = [z?.x, z?.y, z?.ancho, z?.alto].map(Number) as [number, number, number, number];
      const enRango = [x, y, ancho, alto].every((n) => Number.isFinite(n) && n >= 0 && n <= 100);
      if (!enRango || ancho === 0 || alto === 0 || x + ancho > 100.01 || y + alto > 100.01) {
        errores.push(`${disp}: la zona «${nombre}» debe caber en el lienzo (porcentajes de 0 a 100)`);
      }
      if (z?.color !== undefined && !ROLES_COLOR.includes(z.color)) errores.push(`${disp}: la zona «${nombre}» usa un color fuera del kit`);
      if (z?.tamano !== undefined && !(TAMANOS_ZONA as readonly string[]).includes(z.tamano)) errores.push(`${disp}: tamaño no válido en «${nombre}»`);
      if (z?.alineacion !== undefined && !(ALINEACIONES as readonly string[]).includes(z.alineacion)) errores.push(`${disp}: alineación no válida en «${nombre}»`);
    }
  }
  return errores;
}

/**
 * Modelo del estilo base de una disposición (RN-02-5). Apila las zonas: en celular una debajo de otra y en
 * escritorio en dos columnas cuando hay imagen o personaje. El equipo gráfico reemplaza estos modelos con el
 * diseño del estilo base en S3; mientras tanto el generador tiene siempre un modelo por disposición.
 */
export function modeloBase(disposicion: Disposicion): DefinicionModelo {
  const zonas = ZONAS[disposicion].filter((z) => z !== 'fondo');
  const visual = new Set(['personaje', 'imagen', 'escena', 'video', 'icono', 'insignia']);
  const apilar = (lista: readonly string[], x: number, ancho: number): ZonaModelo[] => {
    const alto = Math.floor(84 / Math.max(lista.length, 1));
    return lista.map((zona, i) => ({ zona, x, y: 8 + i * alto, ancho, alto: alto - 2, ...estiloBase(zona) }));
  };
  const visuales = zonas.filter((z) => visual.has(z));
  const textos = zonas.filter((z) => !visual.has(z));
  const escritorio = visuales.length && textos.length ? [...apilar(textos, 6, 50), ...apilar(visuales, 60, 34)] : apilar(zonas, 10, 80);
  return { fondo: disposicion === 'portada' || disposicion === 'seccion' ? 'primario' : 'fondo', celular: apilar(zonas, 6, 88), escritorio };
}

function estiloBase(zona: string): Partial<ZonaModelo> {
  if (['titulo', 'pregunta', 'afirmacion', 'situacion', 'numero', 'puntaje', 'dato'].includes(zona)) return { color: 'primario', tamano: zona === 'numero' || zona === 'dato' ? 'xl' : 'lg' };
  if (['boton', 'botones', 'opciones', 'marcador'].includes(zona)) return { color: 'acento', tamano: 'md' };
  return { color: 'texto', tamano: 'sm' };
}

export interface ModeloParaGenerar {
  disposicion: Disposicion;
  nombre: string;
  definicion: DefinicionModelo;
  origen: 'cliente' | 'base';
  modeloId?: string;
}

/**
 * Modelos que usa el generador (CP-025, CP-026): por cada disposición, los modelos activos del cliente y, si no
 * tiene ninguno de esa disposición, el del estilo base.
 */
export function modelosParaGenerar(
  delCliente: readonly { id: string; disposicion: string; nombre: string; definicion: unknown; activa: boolean; orden: number }[],
): ModeloParaGenerar[] {
  return DISPOSICIONES.flatMap((disposicion) => {
    const propios = delCliente
      .filter((m) => m.activa && m.disposicion === disposicion)
      .sort((a, b) => a.orden - b.orden)
      .map((m): ModeloParaGenerar => ({ disposicion, nombre: m.nombre, definicion: m.definicion as DefinicionModelo, origen: 'cliente', modeloId: m.id }));
    return propios.length ? propios : [{ disposicion, nombre: `${NOMBRE_DISPOSICION[disposicion]} (estilo base)`, definicion: modeloBase(disposicion), origen: 'base' as const }];
  });
}

// ---------- Cambiar diseño de la pantalla (HU-0605, RN-06-3, SUP-44) ----------

/** Las composiciones de contenido que se intercambian en el editor, con los nombres del prototipo. */
export const DISENOS_CONTENIDO = ['idea', 'personaje', 'dato', 'lista'] as const satisfies readonly Disposicion[];
export type DisenoContenido = (typeof DISENOS_CONTENIDO)[number];
export const NOMBRE_DISENO: Record<DisenoContenido, string> = {
  idea: 'Idea + ilustración', personaje: 'Personaje habla', dato: 'Dato grande', lista: 'Tarjetas con íconos',
};
export const esDisenoContenido = (d: unknown): d is DisenoContenido => (DISENOS_CONTENIDO as readonly unknown[]).includes(d);

/**
 * Los diseños que se ofrecen para una pantalla: las 4 composiciones de contenido. Una pantalla con actividad o video,
 * o la de resultados, no cambia de diseño en el editor (vacío).
 */
export function disenosPara(p: { disposicion?: string; bloques: { tipo: string }[] }): DisenoContenido[] {
  if (p.disposicion === 'resultados' || p.bloques.some((b) => b.tipo === 'interaccion' || b.tipo === 'video')) return [];
  return [...DISENOS_CONTENIDO];
}

/** Disposiciones sin actividad que no se ofrecen como diseño, pero a las que se puede volver (Deshacer). */
export const DISPOSICIONES_DE_TEXTO = ['portada', 'objetivos', 'seccion', 'resumen', 'cierre'] as const satisfies readonly Disposicion[];

/** Si la pantalla puede pasar a `destino`: una de contenido, o volver a una de texto, y nunca en una pantalla con actividad. */
export function disenoPermitido(p: { disposicion?: string; bloques: { tipo: string }[] }, destino: unknown): destino is Disposicion {
  if (!disenosPara(p).length) return false;
  return esDisenoContenido(destino) || (DISPOSICIONES_DE_TEXTO as readonly unknown[]).includes(destino);
}

/** La plantilla del kit para la nueva disposición: cambia el sufijo (`kit-x-idea` → `kit-x-lista`); si no lo tiene, el estilo base. */
export function plantillaPara(plantilla: string, disposicion: Disposicion): string {
  const sufijo = DISPOSICIONES.find((d) => plantilla.endsWith(`-${d}`));
  return sufijo ? `${plantilla.slice(0, -sufijo.length)}${disposicion}` : `base-${disposicion}`;
}
