// HU-0704 · Audio del cliente (CP-074, REQ-023, REQ-024, RN-07-4).
// - Usar la grabación: el material de audio es del proyecto del curso, está listo y transcrito, y el cliente autorizó
//   usarla (si no, 422 AUTORIZACION_REQUERIDA). En una versión: el texto de la narración pasa a ser la transcripción y la
//   pista en español queda con la voz del cliente, quién autorizó y cuándo, «pendiente» hasta que el worker (cola voz,
//   tarea GRABACION) deja su MP3, su boca y sus subtítulos.
// - Limpiar ruido: encola la limpieza con ffmpeg (cola media); el estado queda en los metadatos del audio original.
// - Re-locutar con voz IA: la transcripción pasa al texto de la narración con la voz del kit, como un cambio que
//   «↶ Deshacer» revierte (devuelve el texto anterior), y la cascada la dice con la voz de la IA (HU-0503).
import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { hashNarracion } from '@aptio/ai';
import type { Recurso } from '@aptio/db';
import { CASCADA_ES, ESPERA_CASCADA_MS, TAREA_CASCADA } from '@aptio/schema/generacion';
import { audioAUsar, esGrabacion, pistaDeGrabacion, type SegmentoTranscripcion, TAREA_GRABACION, TAREA_LIMPIAR, textoDeTranscripcion, VOZ_GRABACION } from '@aptio/schema/grabacion';
import { KIT_INICIAL } from '@aptio/schema/marca';
import { pantallasDe } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { ColasService } from '../trabajos/colas.service.js';
import { CursosService } from './cursos.service.js';
import type { AudioClienteDto, GrabacionEntradaDto, GrabacionResultadoDto, LimpiezaResultadoDto, RelocucionEntradaDto } from './grabacion.dto.js';

type Voz = { proveedor: string; voz: string; velocidad?: number };
type Pista = { estado: string; voz: Voz; hashTexto: string; recursoAudioId?: string; duracionMs?: number; bocas?: unknown; subtitulosId?: string; grabacion?: unknown };
type Narracion = { texto: { es?: string; en?: string }; porIdioma: { es?: Pista; en?: Pista } };
type Limpieza = { estado: 'procesando' | 'listo' | 'error'; recursoId?: string; error?: string };

const audioNoValido = (mensaje: string) => new UnprocessableEntityException({ codigo: 'AUDIO_NO_VALIDO', mensaje });
const limpiezaDe = (r: Pick<Recurso, 'metadatos'>) => ((r.metadatos as { limpieza?: Limpieza } | null)?.limpieza ?? null);

@Injectable()
export class GrabacionService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
    private readonly almacenes: AlmacenService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** El material de audio del proyecto, listo y transcrito, con su recurso original. 422 AUDIO_NO_VALIDO si no. */
  private async material(organizacionId: string, proyectoId: string, materialId: string) {
    const m = await this.bd.materialFuente.findFirst({ where: { id: materialId, proyectoId, proyecto: { organizacionId } } });
    if (!m) throw audioNoValido('Ese audio no es del proyecto de este curso');
    if (m.tipo !== 'AUDIO') throw audioNoValido('El material elegido no es un audio');
    if (m.estado !== 'listo' || !m.recursoId) throw audioNoValido('El audio todavía no está transcrito: espera a que termine o vuelve a subirlo');
    const texto = textoDeTranscripcion(m.transcripcion as unknown as SegmentoTranscripcion[]);
    if (!texto) throw audioNoValido('La transcripción del audio está vacía');
    const original = await this.bd.recurso.findFirst({ where: { id: m.recursoId, organizacionId } });
    if (!original) throw audioNoValido('El archivo del audio ya no existe (¿se borró por la retención del cliente?)');
    return { m, texto, original };
  }

  async listar(u: UsuarioSesion, cursoId: string): Promise<AudioClienteDto[]> {
    const c = await this.cursos.buscar(u, cursoId);
    const materiales = await this.bd.materialFuente.findMany({ where: { proyectoId: c.proyectoId, tipo: 'AUDIO', estado: 'listo', recursoId: { not: null } }, orderBy: { creadoEn: 'asc' } });
    const recursos = await this.bd.recurso.findMany({ where: { id: { in: materiales.map((m) => m.recursoId!) }, organizacionId: c.organizacionId } });
    const limpios = await this.bd.recurso.findMany({
      where: { id: { in: recursos.flatMap((r) => (limpiezaDe(r)?.recursoId ? [limpiezaDe(r)!.recursoId!] : [])) }, organizacionId: c.organizacionId },
    });
    const url = (r: Recurso) => this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre);
    const salida: AudioClienteDto[] = [];
    for (const m of materiales) {
      const r = recursos.find((x) => x.id === m.recursoId);
      const texto = textoDeTranscripcion(m.transcripcion as unknown as SegmentoTranscripcion[]);
      if (!r || !texto) continue;
      const l = limpiezaDe(r);
      const limpio = l?.recursoId ? limpios.find((x) => x.id === l.recursoId) : undefined;
      const duracion = (r.metadatos as { duracionS?: number } | null)?.duracionS;
      salida.push({
        materialId: m.id, recursoId: r.id, nombre: r.nombre, duracionS: typeof duracion === 'number' ? duracion : null, texto, url: await url(r),
        limpieza: l ? { estado: l.estado, ...(limpio ? { recursoId: limpio.id, url: await url(limpio) } : {}), ...(l.error ? { error: l.error } : {}) } : null,
      });
    }
    return salida;
  }

  async usar(u: UsuarioSesion, cursoId: string, pantallaId: string, dto: GrabacionEntradaDto): Promise<GrabacionResultadoDto> {
    const organizacionId = organizacionDe(u);
    // RN-07-4: la voz real se usa solo con la autorización registrada.
    if (dto.autorizado !== true) throw new UnprocessableEntityException({ codigo: 'AUTORIZACION_REQUERIDA', mensaje: 'Marca «El cliente autorizó usar esta grabación» para usarla en el curso' });
    const c = await this.cursos.buscar(u, cursoId);
    const { m, texto, original } = await this.material(organizacionId, c.proyectoId, dto.materialId);
    const l = limpiezaDe(original);
    if (dto.usarLimpio && (l?.estado !== 'listo' || !l.recursoId)) throw audioNoValido('La versión limpia todavía no está lista: usa «Limpiar ruido» primero');
    const fuente = audioAUsar({ original: original.id, limpio: l?.estado === 'listo' ? (l.recursoId ?? null) : null }, dto.usarLimpio ? 'limpio' : 'original');
    const usuario = await this.bd.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { nombre: true } });
    const datos = { materialId: m.id, recursoOrigenId: fuente.recursoId, version: fuente.version, autorizadoPor: usuario.nombre, autorizadoEn: new Date().toISOString() };

    const r = await this.cursos.guardar(u, cursoId, dto.version ?? null, 'grabación del cliente', (doc) => {
      const p = pantallasDe(doc).find((x) => x.id === pantallaId);
      if (!p) throw new NotFoundException('Pantalla no encontrada');
      const n = (p as unknown as { narracion?: Narracion }).narracion;
      if (!n?.porIdioma.es) throw new UnprocessableEntityException({ codigo: 'NARRACION_NO_VALIDA', mensaje: 'Esta pantalla no tiene narración en español' });
      // El audio, la boca y los subtítulos anteriores ya no van: el worker deja los de la grabación.
      const anteriores = new Set([n.porIdioma.es.recursoAudioId, n.porIdioma.es.subtitulosId].filter(Boolean));
      const d = doc as unknown as { recursos: { id: string }[] };
      d.recursos = d.recursos.filter((x) => !anteriores.has(x.id));
      n.texto = { ...n.texto, es: texto };
      n.porIdioma.es = pistaDeGrabacion(datos, texto);
      p.estado = 'borrador';
      return {};
    });
    await this.bd.narracion.upsert({
      where: { cursoId_pantallaId_idioma: { cursoId, pantallaId, idioma: 'es' } },
      create: { cursoId, pantallaId, idioma: 'es', textoHash: '', origen: 'grabacion', voz: VOZ_GRABACION.voz, estado: 'GENERANDO' },
      update: { origen: 'grabacion', voz: VOZ_GRABACION.voz, estado: 'GENERANDO' },
    });
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'GRABACION_AUTORIZADA', entidad: 'Curso', entidadId: cursoId, datos: { pantallaId, ...datos } } });
    try {
      await this.colas.encolar('voz', { trabajoId: cursoId, organizacionId, tarea: TAREA_GRABACION, pantallaId, grabacion: { materialId: m.id, recursoId: fuente.recursoId, version: fuente.version, autorizadoPor: datos.autorizadoPor, autorizadoEn: datos.autorizadoEn } }, `grabacion-${cursoId}-${pantallaId}-${randomUUID()}`);
    } catch (e) {
      await this.bd.narracion.updateMany({ where: { cursoId, pantallaId, idioma: 'es' }, data: { estado: 'ERROR' } });
      throw e;
    }
    return { version: r.version, estado: 'GENERANDO', regenerando: ['voz-es', 'boca', 'subtitulos-es'] };
  }

  async limpiar(u: UsuarioSesion, materialId: string): Promise<LimpiezaResultadoDto> {
    const organizacionId = organizacionDe(u);
    const m = await this.bd.materialFuente.findFirst({ where: { id: materialId, proyecto: { organizacionId } }, select: { proyectoId: true } });
    if (!m) throw new NotFoundException('Material no encontrado');
    const { original } = await this.material(organizacionId, m.proyectoId, materialId);
    const previa = limpiezaDe(original);
    if (previa?.estado === 'listo') return { estado: 'listo' };
    if (previa?.estado === 'procesando') return { estado: 'procesando' };
    const anotar = (limpieza: Limpieza) => this.bd.recurso.update({ where: { id: original.id }, data: { metadatos: { ...((original.metadatos as object | null) ?? {}), limpieza } } });
    await anotar({ estado: 'procesando' });
    try {
      await this.colas.encolar('media', { trabajoId: materialId, organizacionId, tarea: TAREA_LIMPIAR }, `limpiar-${materialId}-${randomUUID()}`);
    } catch (e) {
      await anotar({ estado: 'error', error: 'No se pudo encolar la limpieza; intenta de nuevo' });
      throw e;
    }
    return { estado: 'procesando' };
  }

  async relocutar(u: UsuarioSesion, cursoId: string, pantallaId: string, dto: RelocucionEntradaDto): Promise<GrabacionResultadoDto> {
    const organizacionId = organizacionDe(u);
    const c = await this.cursos.buscar(u, cursoId);
    const { texto } = await this.material(organizacionId, c.proyectoId, dto.materialId);
    const kit = await this.bd.proyecto.findUniqueOrThrow({ where: { id: c.proyectoId }, select: { cliente: { select: { kit: { select: { voces: true } } } } } });
    const vozKit = ((kit.cliente.kit?.voces as { es?: Voz } | null)?.es) ?? KIT_INICIAL.voces.es;
    let voz: Voz = vozKit;
    let textoAnterior = '';
    const r = await this.cursos.guardar(u, cursoId, dto.version ?? null, 're-locución', (doc) => {
      const p = pantallasDe(doc).find((x) => x.id === pantallaId);
      if (!p) throw new NotFoundException('Pantalla no encontrada');
      const n = (p as unknown as { narracion?: Narracion }).narracion;
      const pista = n?.porIdioma.es;
      if (!n || !pista) throw new UnprocessableEntityException({ codigo: 'NARRACION_NO_VALIDA', mensaje: 'Esta pantalla no tiene narración en español' });
      if (n.texto.es === texto && !esGrabacion(pista)) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'La narración ya dice esa transcripción con la voz del kit' });
      textoAnterior = n.texto.es ?? '';
      // Una grabación vuelve a la voz del kit; una voz de la IA conserva la suya.
      voz = esGrabacion(pista) ? { ...vozKit } : pista.voz;
      n.texto = { ...n.texto, es: texto };
      delete pista.grabacion;
      pista.voz = voz;
      pista.hashTexto = hashNarracion(texto, voz.voz, voz.velocidad ?? 1);
      if (pista.estado === 'generado') pista.estado = 'desactualizado';
      p.estado = 'borrador';
      return {};
    });
    // El hash de la Narracion no se toca: así la voz de la IA ve que el texto cambió y lo dice de nuevo (RN-07-1).
    await this.bd.narracion.upsert({
      where: { cursoId_pantallaId_idioma: { cursoId, pantallaId, idioma: 'es' } },
      create: { cursoId, pantallaId, idioma: 'es', textoHash: '', origen: 'tts', voz: voz.voz, velocidad: voz.velocidad ?? 1, estado: 'DESACTUALIZADA' },
      update: { origen: 'tts', voz: voz.voz, velocidad: voz.velocidad ?? 1, estado: 'DESACTUALIZADA' },
    });
    await this.colas.encolarConEspera('voz', { trabajoId: cursoId, organizacionId, tarea: TAREA_CASCADA, pantallaId }, `cascada-${cursoId}-${pantallaId}`, ESPERA_CASCADA_MS);
    return { version: r.version, estado: 'DESACTUALIZADA', regenerando: [...CASCADA_ES], textoAnterior };
  }
}
