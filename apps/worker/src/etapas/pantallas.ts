// HU-0406 · Etapa 4 «Pantallas con el kit» (IA-15 v2): cada pantalla del guion sale con una disposición del kit y sus
// campos, sin HTML. Se componen hasta 4 a la vez y cada una lista se guarda como avance para verla en Producción sin
// esperar al resto (CP-043). Cada pantalla con actividad pide además sus datos a IA-07 (HU-0407, CP-044). Al terminar
// se arma el documento del curso con los bloques y se valida (CP-042).
import { type CursoDoc, observacionesRegla } from '@aptio/schema/revision';
import { hashNarracion, textoSeguro } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import { validarCurso, VERSION_ESQUEMA } from '@aptio/schema';
import {
  type CamposPantalla, DISPOSICION_DE_ACTIVIDAD, DISPOSICIONES_DE_JUEGO, type EstructuraCurso, type GuionCurso, type PantallaCompuesta,
  type PantallaGuion, type PantallasCurso, repeticionesSeguidas, type ResumenMaterial,
} from '@aptio/schema/generacion';
import { type Disposicion, KIT_INICIAL, modelosParaGenerar, type Paleta, type RolColor } from '@aptio/schema/marca';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';
import { FICHAS_INTERACCION, interaccionDe, modoDe, revisarActividad, type SalidaIa07 } from './actividades.js';

export const VERSION_PROMPT = 'v2';
export const VERSION_PROMPT_ACTIVIDAD = 'v2';
/** Pantallas que se componen a la vez (cada una es una llamada corta a la IA). */
export const EN_PARALELO = 4;
const FONDOS_PRIMARIO: readonly Disposicion[] = ['portada', 'seccion', 'cierre'];

type SalidaIa = Omit<PantallaCompuesta, 'orden' | 'capsulaId' | 'titulo'> & { pantallaId: string; actividad?: { tipo: string } };
type Bloque = Record<string, unknown>;
type Origen = { tipo: 'documento' | 'ia' | 'manual'; documentoId?: string; paginas?: number[]; revisado: boolean };

/** Reglas propias además del esquema (solo con un proveedor real: el simulado responde siempre el caso LOTO). */
export function revisarPantalla(p: { pantalla: Pick<PantallaGuion, 'id' | 'actividad'>; permitidas: readonly string[]; vecinas: string[] }) {
  return (datos: unknown): string[] => {
    const s = datos as SalidaIa;
    const errores: string[] = [];
    if (s.pantallaId !== p.pantalla.id) errores.push(`pantallaId debe ser "${p.pantalla.id}"`);
    if (!p.permitidas.includes(s.disposicion)) errores.push(`La disposición ${s.disposicion} no está en el kit: usa una de ${p.permitidas.join(', ')}`);
    const pedida = p.pantalla.actividad ? DISPOSICION_DE_ACTIVIDAD[p.pantalla.actividad.tipo] : undefined;
    if (p.pantalla.actividad) {
      if (pedida && s.disposicion !== pedida) errores.push(`La actividad ${p.pantalla.actividad.tipo} del guion va con la disposición ${pedida}`);
      if (s.actividad?.tipo !== p.pantalla.actividad.tipo) errores.push(`actividad.tipo debe ser ${p.pantalla.actividad.tipo}, la del guion`);
    } else if (DISPOSICIONES_DE_JUEGO.includes(s.disposicion)) {
      errores.push(`La pantalla no tiene actividad en el guion: no uses la disposición ${s.disposicion}`);
    }
    if (p.vecinas.length === 2 && p.vecinas.every((v) => v === s.disposicion)) {
      errores.push(`Las dos pantallas anteriores ya usan ${s.disposicion}: elige otra disposición`);
    }
    if (s.fondo === 'primario' && !FONDOS_PRIMARIO.includes(s.disposicion)) errores.push('El fondo primario es solo para portada, sección y cierre');
    const { opciones, correcta } = s.campos;
    if (correcta !== undefined) {
      const tope = s.disposicion === 'vf' ? 2 : (opciones?.length ?? 0);
      if (correcta >= tope) errores.push(`correcta (${correcta}) no es una opción de la pantalla`);
    }
    return errores;
  };
}

/** Item de lista en una línea: «Eléctrica: Tableros y motores», o «Identificar las fuentes…» si sigue en minúscula. */
const lineaItem = (it: { titulo: string; texto?: string }) =>
  it.texto ? `${it.titulo}${/^\p{Ll}/u.test(it.texto) ? ' ' : ': '}${it.texto}` : it.titulo;

/**
 * Bloques del curso desde los campos de IA-15 (reglas de casos/loto/README.md): cada campo es un texto con su rol e id
 * `<pantalla>-<campo>`, el personaje un bloque propio y la actividad, con los datos de IA-07, un bloque `interaccion`
 * (la situación, la pregunta o la afirmación de IA-15 ya van dentro de ella). Las imágenes las agrega la etapa 5; el
 * video, solo si el proyecto tiene uno del cliente.
 */
export function bloquesDe(
  p: Pick<PantallaCompuesta, 'id' | 'disposicion' | 'campos' | 'personaje' | 'actividad'>,
  origen: Origen,
  extra: { personajeRecursoId: string | null; videoRecursoId: string | null },
): Bloque[] {
  const c: CamposPantalla = p.campos;
  const bloques: Bloque[] = [];
  const texto = (rol: string, contenido: string | undefined, sufijo: string) => {
    if (contenido?.trim()) bloques.push({ id: `${p.id}-${sufijo}`, tipo: 'texto', rol, contenido: { es: contenido.trim() }, origen });
  };
  texto('titulo', c.titulo, 'titulo');
  texto('subtitulo', c.subtitulo, 'subtitulo');
  if (c.numero) texto('subtitulo', `Parte ${c.numero}`, 'numero');
  texto('destacado', c.datoGrande, 'dato-grande');
  texto('cuerpo', c.texto, 'texto');
  texto('cuerpo', c.burbuja, 'burbuja');
  texto('destacado', c.dato, 'dato');
  (c.items ?? []).forEach((it, i) => texto('cuerpo', lineaItem(it), `item-${i + 1}`));
  if (p.personaje && extra.personajeRecursoId) {
    bloques.push({ id: `${p.id}-personaje`, tipo: 'personaje', recursoId: extra.personajeRecursoId, pose: p.personaje.pose, lado: p.personaje.lado });
  }
  if (p.actividad?.interaccion) {
    bloques.push({ id: `${p.id}-actividad`, tipo: 'interaccion', interaccion: { tipo: p.actividad.tipo, ...p.actividad.interaccion } });
  }
  if (p.disposicion === 'video' && extra.videoRecursoId) {
    bloques.push({ id: `${p.id}-video`, tipo: 'video', recursoId: extra.videoRecursoId, marcadores: [], reglas: { impedirAdelantar: true, porcentajeMinimo: 90 } });
  }
  return bloques;
}

/** Tipo de pantalla del curso según la estructura (como el caso LOTO: la actividad es interactiva). */
function tipoCurso(tipo: string, disposicion: Disposicion): 'portada' | 'contenido' | 'interactiva' | 'evaluacion' | 'video' | 'cierre' {
  if (disposicion === 'video') return 'video';
  if (tipo === 'portada' || tipo === 'cierre' || tipo === 'evaluacion') return tipo;
  return tipo === 'actividad' ? 'interactiva' : 'contenido';
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function textoPantallas(listas: number, total: number, terminado: boolean, actividades = 0): string {
  if (!terminado) return `${listas} de ${total} pantallas listas`;
  const conDatos = actividades ? ` · ${plural(actividades, 'actividad', 'actividades')} con sus datos` : '';
  return `${plural(total, 'pantalla armada', 'pantallas armadas')} con el kit${conDatos} · curso validado`;
}

/** Corre `trabajo` sobre la lista con a lo más `n` a la vez, en orden de llegada. */
async function enParalelo<T>(lista: T[], n: number, trabajo: (x: T, i: number) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const hilo = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      await trabajo(lista[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, hilo));
}

export const componerPantallas: EjecutorEtapa = async (ctx: ContextoEtapa) => {
  const estructura = ctx.anteriores.OBJETIVOS_ESTRUCTURA as EstructuraCurso | undefined;
  const guion = ctx.anteriores.STORYBOARD_GUION as GuionCurso | undefined;
  if (!estructura) throw new Error('Falta el resultado de la etapa 2 (Objetivos y estructura)');
  if (!guion) throw new Error('Falta el resultado de la etapa 3 (Storyboard y guion)');
  const resumen = (ctx.anteriores.RESUMEN_MATERIAL as ResumenMaterial | undefined) ?? { documentos: [], ideas: [] };

  const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
    where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
    include: {
      cliente: { include: { glosario: { orderBy: { termino: 'asc' } }, kit: { include: { pantallasModelo: { where: { activa: true } } } } } },
      materiales: { where: { estado: 'listo' }, orderBy: { creadoEn: 'asc' } },
    },
  });
  const kit = proyecto.cliente.kit;
  const paleta = (kit?.paleta as Paleta | undefined) ?? KIT_INICIAL.paleta;
  const tipografias = (kit?.tipografias as PantallasCurso['kit']['tipografias'] | undefined) ?? KIT_INICIAL.tipografias;
  const voz = ((kit?.voces as Record<string, { proveedor: string; voz: string; velocidad?: number }> | undefined)?.es) ?? KIT_INICIAL.voces.es;
  const delKit = kit?.personaje as { recursoId?: string; nombre?: string; poses?: string[] } | null | undefined;
  const personaje = delKit?.recursoId ? { recursoId: delKit.recursoId, nombre: delKit.nombre ?? 'Personaje', poses: delKit.poses ?? [] } : null;

  // Recursos del cliente que el curso referencia: los documentos (trazabilidad), el video y el personaje.
  const ids = [...proyecto.materiales.map((m) => m.recursoId), personaje?.recursoId].filter((x): x is string => Boolean(x));
  const recursosBd = await ctx.bd.recurso.findMany({ where: { id: { in: ids }, organizacionId: ctx.organizacionId } });
  const recursoDe = (id: string | null | undefined) => recursosBd.find((r) => r.id === id);
  const video = proyecto.materiales.find((m) => m.tipo === 'VIDEO' && recursoDe(m.recursoId));

  // Por disposición, el primer modelo activo del cliente o el del estilo base (CP-025, CP-026). Sin video del cliente no
  // se ofrece la disposición video.
  const modelos: PantallasCurso['modelos'] = {};
  for (const m of modelosParaGenerar(kit?.pantallasModelo ?? [])) modelos[m.disposicion] ??= m.definicion;
  const plantillas = new Map<string, string>();
  for (const m of modelosParaGenerar(kit?.pantallasModelo ?? [])) if (!plantillas.has(m.disposicion)) plantillas.set(m.disposicion, m.modeloId ?? `base-${m.disposicion}`);
  const permitidas = (Object.keys(modelos) as Disposicion[]).filter((d) => d !== 'video' || video);

  const kitNombre = proyecto.cliente.nombre;
  const objetivos = new Map(estructura.objetivos.map((o) => [o.id, o]));
  const deEstructura = new Map(estructura.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas.map((p) => [p.id, p]))));
  const ideas = new Map(resumen.ideas.map((x) => [x.id, x]));
  const lista = guion.capsulas.flatMap((c) => c.pantallas.map((p) => ({ capsulaId: c.id, p })));
  const listas: (PantallaCompuesta | undefined)[] = new Array(lista.length);
  const datos = (): PantallasCurso => ({
    total: lista.length,
    kit: { nombre: kitNombre, paleta, tipografias, personaje: personaje?.nombre ?? null },
    modelos,
    pantallas: listas.filter((x): x is PantallaCompuesta => Boolean(x)),
    advertencias: [],
  });

  // Los avances se guardan uno detrás de otro: así uno viejo nunca pisa a uno más nuevo.
  let cola = ctx.avance(textoPantallas(0, lista.length, false), datos());
  const avisar = () => {
    cola = cola.then(() => {
      const d = datos();
      return ctx.avance(textoPantallas(d.pantallas.length, lista.length, false), d);
    });
    return cola;
  };

  /** IA-07 para una pantalla con actividad: el reto final es sumativo y lo demás formativo. */
  const datosActividad = async (p: PantallaGuion) => {
    const tipo = p.actividad!.tipo;
    const e = deEstructura.get(p.id);
    const modo = modoDe(e?.tipo ?? p.tipo, tipo);
    const usadas = (e?.fragmentoIds ?? []).flatMap((id) => ideas.get(id) ?? []);
    const r = await ctx.ia<SalidaIa07>('IA-07', {
      cliente: { nombre: proyecto.cliente.nombre },
      glosario: proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
      pantalla: { id: p.id }, tipo, modo,
      nombreInteraccion: FICHAS_INTERACCION[tipo]?.nombre ?? tipo,
      fichaInteraccion: FICHAS_INTERACCION[tipo]?.ficha ?? null,
      objetivos: estructura.objetivos.map((o) => `${o.id} · ${textoSeguro(o.texto.es ?? o.verbo)}`).join('\n'),
      guion: JSON.stringify({ id: p.id, titulo: textoSeguro(p.titulo), textoPantalla: textoSeguro(p.textoPantalla), narracion: textoSeguro(p.narracion), consigna: textoSeguro(p.actividad!.consigna) }, null, 2),
      fragmentos: usadas.map((x) => `${x.id} · documento ${x.materialId} · p. ${x.paginas.join(', ')} · ${textoSeguro(x.texto)}`).join('\n') || null,
    }, {
      version: VERSION_PROMPT_ACTIVIDAD,
      ...(ctx.proveedor !== 'simulado' ? { validarExtra: revisarActividad({ pantallaId: p.id, tipo, modo, objetivoIds: [...objetivos.keys()] }) } : {}),
    });
    return interaccionDe(p.id, r.datos);
  };

  await enParalelo(lista, EN_PARALELO, async ({ capsulaId, p }, i) => {
    const vecinas = [listas[i - 2], listas[i - 1]].filter((x) => x && x.capsulaId === capsulaId).map((x) => x!.disposicion);
    const objetivo = p.objetivoIds.map((id) => objetivos.get(id)?.texto.es).filter(Boolean).join(' · ');
    const r = await ctx.ia<SalidaIa>('IA-15', {
      cliente: { nombre: proyecto.cliente.nombre },
      glosario: proyecto.cliente.glosario.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir })),
      kit: { nombre: textoSeguro(kitNombre), disposiciones: permitidas.join(', ') },
      personaje: personaje ? `${textoSeguro(personaje.nombre)} (poses: ${(personaje.poses.length ? personaje.poses : ['explicando', 'advirtiendo', 'celebrando', 'pensando', 'neutral']).join(', ')})` : 'sin personaje: no incluyas el campo personaje',
      objetivo: objetivo || null,
      disposicionesVecinas: vecinas.length ? vecinas.join(', ') : '(ninguna todavía)',
      pantalla: { id: p.id },
      guion: JSON.stringify({
        id: p.id, tipo: p.tipo, titulo: textoSeguro(p.titulo), textoPantalla: textoSeguro(p.textoPantalla), narracion: textoSeguro(p.narracion),
        visual: textoSeguro(p.visual), ...(p.actividad ? { actividad: { tipo: p.actividad.tipo, consigna: textoSeguro(p.actividad.consigna) } } : {}),
      }, null, 2),
    }, {
      version: VERSION_PROMPT,
      ...(ctx.proveedor !== 'simulado' ? { validarExtra: revisarPantalla({ pantalla: p, permitidas, vecinas }) } : {}),
    });
    const { pantallaId: _id, actividad: _a, personaje: pose, ...salida } = r.datos;
    // La actividad es la del guion, con sus datos de IA-07 (HU-0407).
    const actividad = p.actividad ? { ...p.actividad, interaccion: await datosActividad(p) } : undefined;
    // En exploración, la escena que pidió IA-15 es la imagen de la actividad: lleva su id para la etapa de ilustraciones.
    const pedidosImagen = actividad?.tipo === 'INT-06'
      ? salida.pedidosImagen.map((x) => (x.uso === 'escena' ? { ...x, id: `${p.id}-escena` } : x))
      : salida.pedidosImagen;
    // El personaje solo si el kit tiene uno.
    listas[i] = {
      ...salida, pedidosImagen, id: p.id, orden: i + 1, capsulaId, titulo: p.titulo,
      ...(personaje && pose ? { personaje: pose } : {}),
      ...(actividad ? { actividad } : {}),
    };
    await avisar();
  });
  await cola;

  const pantallas = listas as PantallaCompuesta[];
  const advertencias = repeticionesSeguidas(pantallas).map((t) => `${t.ids.join(', ')} usan seguidas la disposición ${t.disposicion}`);
  if (proyecto.cliente.kit === null) advertencias.unshift('El cliente no tiene kit: las pantallas usan los colores y modelos del estilo base');

  // ---- Documento del curso (CP-042) ----
  const porId = new Map(pantallas.map((x) => [x.id, x]));
  const guionDe = new Map(guion.capsulas.flatMap((c) => c.pantallas.map((p) => [p.id, p])));
  const recursos: Record<string, unknown>[] = [];
  const agregarRecurso = (r: Record<string, unknown>) => {
    if (!recursos.some((x) => x.id === r.id)) recursos.push(r);
  };
  const origenDe = (p: PantallaGuion): Origen => {
    const d = p.origen.tipo === 'documento' ? resumen.documentos.find((x) => x.materialId === p.origen.documentoId) : undefined;
    const material = d ? proyecto.materiales.find((m) => m.id === d.materialId) : undefined;
    if (!d || !material) return { tipo: p.origen.tipo === 'documento' ? 'ia' : p.origen.tipo, revisado: false };
    const rec = recursoDe(material.recursoId);
    agregarRecurso({ id: d.materialId, tipo: 'documento', origen: 'cliente', nombre: d.nombre, mime: rec?.mime ?? 'application/pdf' });
    return { tipo: 'documento', documentoId: d.materialId, paginas: p.origen.paginas ?? [], revisado: false };
  };
  if (personaje) {
    agregarRecurso({ id: personaje.recursoId, tipo: 'svg', origen: 'biblioteca', nombre: recursoDe(personaje.recursoId)?.nombre ?? 'personaje.svg', mime: 'image/svg+xml' });
  }
  // La escena de cada exploración: se registra ahora y la dibuja la etapa de ilustraciones.
  for (const x of pantallas.filter((y) => y.actividad?.tipo === 'INT-06')) {
    agregarRecurso({ id: `${x.id}-escena`, tipo: 'imagen', origen: 'generado', nombre: `${x.id}-escena.png`, mime: 'image/png' });
  }
  if (video) {
    const rec = recursoDe(video.recursoId)!;
    agregarRecurso({ id: rec.id, tipo: 'video', origen: 'cliente', nombre: rec.nombre, mime: rec.mime });
  }

  const modulos = estructura.modulos.map((m) => ({
    id: m.id, titulo: soloEs(m.titulo, proyecto.nombre),
    capsulas: m.capsulas.map((c) => ({
      id: c.id, titulo: soloEs(c.titulo, proyecto.nombre), objetivoIds: c.objetivoIds, duracionEstimadaMin: c.duracionEstimadaMin,
      pantallas: c.pantallas.flatMap((e) => {
        const x = porId.get(e.id);
        const g = guionDe.get(e.id);
        if (!x || !g) return [];
        const bloques = bloquesDe(x, origenDe(g), { personajeRecursoId: personaje?.recursoId ?? null, videoRecursoId: video?.recursoId ?? null });
        const conPersonaje = bloques.some((b) => b.tipo === 'personaje');
        return [{
          id: x.id, titulo: { es: g.titulo }, tipo: tipoCurso(e.tipo, x.disposicion),
          ...(e.objetivoIds.length ? { objetivoIds: e.objetivoIds } : {}),
          plantilla: plantillas.get(x.disposicion)!, estado: 'propuesta-ia', obligatoria: true, bloques,
          ...(g.narracion.trim() ? { narracion: narracion(g.narracion.trim(), voz, conPersonaje ? `${x.id}-personaje` : undefined) } : {}),
          disposicion: x.disposicion, fondo: x.fondo as RolColor,
        }];
      }),
    })),
  }));

  const conDatos = pantallas.filter((x) => x.actividad?.interaccion);
  const sumativa = conDatos.some((x) => x.actividad!.interaccion!.modo === 'sumativa');
  const ahora = new Date().toISOString();
  const documento = {
    versionEsquema: VERSION_ESQUEMA,
    id: `curso-${proyecto.id}`,
    metadatos: {
      titulo: { es: proyecto.nombre }, cliente: { id: proyecto.cliente.id, nombre: proyecto.cliente.nombre }, publico: proyecto.publico ?? '',
      duracionEstimadaMin: modulos.flatMap((m) => m.capsulas).reduce((n, c) => n + c.duracionEstimadaMin, 0), autor: 'Generador Aptio', creado: ahora, actualizado: ahora,
    },
    idiomas: ['es'], modoIdioma: 'unico', kitMarcaId: kit?.id ?? 'estilo-base',
    objetivos: estructura.objetivos.map((o) => ({ id: o.id, texto: soloEs(o.texto, o.verbo), nivelBloom: o.nivelBloom })),
    modulos,
    // Con un reto final sumativo, la nota define el completado; sin él, basta recorrer las pantallas obligatorias.
    seguimiento: { criterioCompletado: sumativa ? 'sumativa' : 'pantallas-obligatorias', notaMinima: 70, intentosMaximos: null, notaReportada: 'mejor' },
    recursos,
  };
  const v = validarCurso(documento);
  if (!v.valido) throw new Error(`El curso armado no valida: ${v.errores.slice(0, 3).join('; ')}`);

  // Generar de nuevo reemplaza el documento; la versión anterior queda en el historial.
  const curso = await ctx.bd.$transaction(async (tx) => {
    const previo = await tx.curso.findUnique({ where: { proyectoId: proyecto.id } });
    const c = previo
      ? await tx.curso.update({ where: { id: previo.id }, data: { documento: documento as Prisma.InputJsonValue, versionEsquema: VERSION_ESQUEMA, version: { increment: 1 } } })
      : await tx.curso.create({ data: { organizacionId: ctx.organizacionId, proyectoId: proyecto.id, versionEsquema: VERSION_ESQUEMA, documento: documento as Prisma.InputJsonValue } });
    await tx.cursoVersion.create({ data: { cursoId: c.id, version: c.version, documento: documento as Prisma.InputJsonValue, motivo: 'generación' } });
    // HU-0501: las observaciones por reglas se calculan de nuevo con el curso nuevo; las demás se conservan.
    await tx.observacion.deleteMany({ where: { cursoId: c.id, origen: 'regla' } });
    const observaciones = observacionesRegla(documento as unknown as CursoDoc);
    if (observaciones.length) await tx.observacion.createMany({ data: observaciones.map((o) => ({ cursoId: c.id, ...o, origen: 'regla' })) });
    return c;
  });

  const final: PantallasCurso = { ...datos(), pantallas, advertencias, curso: { id: curso.id, version: curso.version } };
  return { texto: textoPantallas(pantallas.length, lista.length, true, conDatos.length), datos: final };
};

function soloEs(t: { es?: string; en?: string }, respaldo: string): { es: string } {
  return { es: t.es?.trim() || t.en?.trim() || respaldo };
}

/** Narración pendiente de voz (la genera la etapa 6): el hash liga el audio al texto y a la voz del kit. */
function narracion(texto: string, voz: { proveedor: string; voz: string; velocidad?: number }, personajeBloqueId?: string) {
  const velocidad = voz.velocidad ?? 1;
  const hashTexto = hashNarracion(texto, voz.voz, velocidad);
  return {
    texto: { es: texto },
    ...(personajeBloqueId ? { personajeBloqueId } : {}),
    porIdioma: { es: { estado: 'pendiente', voz: { proveedor: voz.proveedor, voz: voz.voz, velocidad }, hashTexto } },
  };
}
