import { BadGatewayException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ejecutarTarea, neutralizar, proveedorDesdeEntorno, proveedorSimulado, type ProveedorTexto, type ResultadoTarea, SalidaNoValida, TARIFAS } from '@aptio/ai';
import { ID_SEO, leerAjustesSitio, Prisma, type SitioPreguntaIa, type SitioPropuestaIa } from '@aptio/db';
import { CODIGO_LIMITE_GASTO, inicioMesLima, tipoDeTareaIA } from '@aptio/schema/conexiones';
import { ordenAlFinal } from '@aptio/schema/sitio-bloques';
import { NOMBRE_POR_DEFECTO } from '@aptio/schema/sitio-ajustes';
import { type DatosContenido, validarDatos } from '@aptio/schema/sitio-contenido';
import { aplicarCambiosSeo, leerSeo } from '@aptio/schema/sitio-seo';
import {
  aplicarMenciones, aplicarRastreadores, ASISTENTES_IA, erroresPropuestasIa, estadoRastreadores, ETIQUETA_MENCION, leerBloqueados, leerMenciones, LIMITES_SEO_IA,
  nombrePropuestaIa, prepararPropuestasIa, type PropuestaIa, type PropuestaPaginaIa, type PropuestaPreguntaIa, propuestasNuevas, type SalidaPropuestasIa,
  TAREA_SEO_IA, validarLlmsTxt, validarPreguntaObjetivo,
} from '@aptio/schema/sitio-seo-ia';
import { opcionesRenderDesdeEnv } from '@aptio/sitio';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { PreguntaIaCambioDto, PreguntaIaDto, PropuestaIaDto, PropuestasPedidasDto, SeoIaCambioDto, SeoIaDto } from './seo-ia.dto.js';

const aPreguntaDto = (p: SitioPreguntaIa): PreguntaIaDto => ({
  id: p.id, pregunta: p.pregunta, menciones: leerMenciones(p.menciones), creadoEn: p.creadoEn.toISOString(), actualizadoEn: p.actualizadoEn.toISOString(),
});
const aPropuestaDto = (p: SitioPropuestaIa): PropuestaIaDto => ({
  id: p.id, tipo: p.tipo, datos: p.datos as Record<string, string>, estado: p.estado, ...(p.creadoId ? { creadoId: p.creadoId } : {}), creadoEn: p.creadoEn.toISOString(),
});
const noValido = (errores: { campo: string; mensaje: string }[], codigo = 'NO_VALIDO') =>
  new UnprocessableEntityException({ codigo, mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1513 · Sitio web › SEO para IA (REQ-072, PNT-30): llms.txt, los rastreadores de IA de robots.txt (CP-126), las
 * preguntas objetivo con la marca manual de cada asistente y las propuestas de la IA (IA-19), que solo se vuelven
 * borradores (CP-127). llms.txt y los rastreadores llegan al sitio con «Publicar cambios», dentro de la versión. Solo
 * el superadmin; cada cambio queda en la auditoría.
 */
@Injectable()
export class SeoIaService {
  /** El proveedor de texto del entorno (simulado sin credenciales). Las pruebas lo reemplazan para forzar respuestas. */
  proveedor: ProveedorTexto = proveedorDesdeEntorno(process.env, () => proveedorSimulado());

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private auditar(u: UsuarioSesion, accion: string, entidad: string, entidadId: string, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad, entidadId, datos: datos as Prisma.InputJsonValue } });
  }

  private pendientes() {
    return this.bd.sitioPropuestaIa.findMany({ where: { estado: 'pendiente' }, orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }] });
  }

  async ver(): Promise<SeoIaDto> {
    const [fila, preguntas, propuestas, publicadas, conFaq] = await Promise.all([
      this.bd.sitioSeo.findUnique({ where: { id: ID_SEO } }),
      this.bd.sitioPreguntaIa.findMany({ orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] }),
      this.pendientes(),
      this.bd.sitioPagina.count({ where: { estado: 'PUBLICADA' } }),
      this.bd.sitioPagina.count({ where: { estado: 'PUBLICADA', datosEstructurados: 'FAQPage' } }),
    ]);
    return {
      llmsTxt: fila?.llmsTxt ?? '',
      rastreadores: estadoRastreadores(fila?.rastreadoresBloqueados),
      asistentes: ASISTENTES_IA.map((a) => ({ ...a })),
      preguntas: preguntas.map(aPreguntaDto),
      propuestas: propuestas.map(aPropuestaDto),
      paginasFaq: { conFaq, publicadas },
    };
  }

  async actualizar(u: UsuarioSesion, dto: SeoIaCambioDto): Promise<SeoIaDto> {
    if (dto.llmsTxt === undefined && dto.rastreadores === undefined) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica llmsTxt o rastreadores' });
    const antes = await this.bd.sitioSeo.findUnique({ where: { id: ID_SEO } });
    const data: { llmsTxt?: string; rastreadoresBloqueados?: string[] } = {};
    if (dto.llmsTxt !== undefined) {
      const r = validarLlmsTxt(dto.llmsTxt);
      if (!r.ok) throw noValido(r.errores);
      if (r.llmsTxt !== (antes?.llmsTxt ?? '')) data.llmsTxt = r.llmsTxt;
    }
    const bloqueadosAntes = leerBloqueados(antes?.rastreadoresBloqueados);
    if (dto.rastreadores !== undefined) {
      const r = aplicarRastreadores(bloqueadosAntes, dto.rastreadores);
      if (!r.ok) throw noValido(r.errores);
      if (r.bloqueados.join() !== bloqueadosAntes.join()) data.rastreadoresBloqueados = r.bloqueados;
    }
    if (Object.keys(data).length) {
      await this.bd.sitioSeo.upsert({ where: { id: ID_SEO }, create: { id: ID_SEO, ...data, actualizadoPorId: u.id }, update: { ...data, actualizadoPorId: u.id } });
      // El texto completo no va a la auditoría (hasta 20 000 caracteres): basta con su tamaño antes y después.
      if (data.llmsTxt !== undefined) await this.auditar(u, 'SITIO_LLMS_EDITADO', 'SitioSeo', ID_SEO, { caracteresAntes: (antes?.llmsTxt ?? '').length, caracteres: data.llmsTxt.length });
      if (data.rastreadoresBloqueados) await this.auditar(u, 'SITIO_RASTREADORES_EDITADOS', 'SitioSeo', ID_SEO, { antes: bloqueadosAntes, bloqueados: data.rastreadoresBloqueados });
    }
    return this.ver();
  }

  // ── Preguntas objetivo ─────────────────────────────────────────────────────────────────────────────────────────────

  async crearPregunta(u: UsuarioSesion, texto: string): Promise<PreguntaIaDto> {
    const otras = await this.bd.sitioPreguntaIa.findMany({ select: { pregunta: true } });
    const r = validarPreguntaObjetivo(texto, otras.map((o) => o.pregunta));
    if (!r.ok) throw this.errorPregunta(r);
    const p = await this.bd.sitioPreguntaIa.create({ data: { pregunta: r.pregunta, menciones: leerMenciones(null) as unknown as Prisma.InputJsonValue } });
    await this.auditar(u, 'SITIO_PREGUNTA_IA_CREADA', 'SitioPreguntaIa', p.id, { pregunta: p.pregunta });
    return aPreguntaDto(p);
  }

  async cambiarPregunta(u: UsuarioSesion, id: string, dto: PreguntaIaCambioDto, ahora = new Date()): Promise<PreguntaIaDto> {
    if (dto.pregunta === undefined && dto.menciones === undefined) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica pregunta o menciones' });
    const actual = await this.buscarPregunta(id);
    const data: Prisma.SitioPreguntaIaUpdateInput = {};
    const auditoria: Record<string, unknown> = {};
    if (dto.pregunta !== undefined) {
      const otras = await this.bd.sitioPreguntaIa.findMany({ where: { id: { not: id } }, select: { pregunta: true } });
      const r = validarPreguntaObjetivo(dto.pregunta, otras.map((o) => o.pregunta));
      // El límite de la lista no aplica al editar una que ya está en ella.
      if (!r.ok && r.codigo !== 'LIMITE_PREGUNTAS') throw this.errorPregunta(r);
      const texto = r.ok ? r.pregunta : dto.pregunta.replace(/\s+/g, ' ').trim();
      if (texto !== actual.pregunta) {
        data.pregunta = texto;
        Object.assign(auditoria, { antes: actual.pregunta, pregunta: texto });
      }
    }
    if (dto.menciones !== undefined) {
      const r = aplicarMenciones(actual.menciones, dto.menciones, ahora);
      if (!r.ok) throw noValido(r.errores);
      data.menciones = r.menciones as unknown as Prisma.InputJsonValue;
      auditoria.menciones = Object.fromEntries(Object.keys(dto.menciones).map((a) => [a, r.menciones[a as keyof typeof r.menciones].estado]));
    }
    if (!Object.keys(data).length) return aPreguntaDto(actual);
    const p = await this.bd.sitioPreguntaIa.update({ where: { id }, data });
    await this.auditar(u, data.menciones && !data.pregunta ? 'SITIO_PREGUNTA_IA_REVISADA' : 'SITIO_PREGUNTA_IA_EDITADA', 'SitioPreguntaIa', id, auditoria);
    return aPreguntaDto(p);
  }

  async borrarPregunta(u: UsuarioSesion, id: string): Promise<void> {
    const actual = await this.buscarPregunta(id);
    await this.bd.sitioPreguntaIa.delete({ where: { id } });
    await this.auditar(u, 'SITIO_PREGUNTA_IA_BORRADA', 'SitioPreguntaIa', id, { pregunta: actual.pregunta });
  }

  private async buscarPregunta(id: string): Promise<SitioPreguntaIa> {
    const p = await this.bd.sitioPreguntaIa.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pregunta no existe' });
    return p;
  }

  private errorPregunta(r: { codigo: string; errores: { campo: string; mensaje: string }[] }): Error {
    const cuerpo = { codigo: r.codigo, mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores };
    return r.codigo === 'PREGUNTA_REPETIDA' ? new ConflictException(cuerpo) : new UnprocessableEntityException(cuerpo);
  }

  // ── Propuestas de la IA (IA-19, CP-127) ────────────────────────────────────────────────────────────────────────────

  /**
   * «✦ Proponer contenido»: corre IA-19 con las preguntas objetivo, las páginas y las preguntas frecuentes del sitio,
   * valida la salida (esquema y reglas; hasta 3 intentos) y guarda solo lo nuevo como propuestas pendientes. El consumo
   * queda en un TrabajoIA de la plataforma (sin organización ni proyecto), también si la tarea falla.
   */
  async proponer(u: UsuarioSesion, ahora = new Date()): Promise<PropuestasPedidasDto> {
    const [preguntas, paginas, faq, pendientes, ajustes] = await Promise.all([
      this.bd.sitioPreguntaIa.findMany({ orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] }),
      this.bd.sitioPagina.findMany({ orderBy: [{ ruta: 'asc' }, { idioma: 'asc' }], select: { ruta: true, idioma: true, titulo: true, estado: true, metaDescripcion: true } }),
      this.bd.sitioElemento.findMany({ where: { coleccion: 'preguntas' }, orderBy: { orden: 'asc' }, select: { datos: true } }),
      this.pendientes(),
      leerAjustesSitio(this.bd),
    ]);
    if (!preguntas.length) throw new UnprocessableEntityException({ codigo: 'SIN_PREGUNTAS', mensaje: 'Agrega al menos una pregunta objetivo antes de pedir propuestas' });
    const tipo = tipoDeTareaIA(TAREA_SEO_IA);
    const conexion = await this.vigilarLimite(u, tipo, ahora);
    const proveedor = this.conModelo(conexion?.proveedor === this.proveedor.nombre ? conexion.modelo : null);
    const trabajo = await this.bd.trabajoIA.create({ data: { organizacionId: null, tarea: TAREA_SEO_IA, tipo, proveedor: proveedor.nombre, modelo: '-', estado: 'EN_CURSO' } });
    const guardar = (r: Omit<ResultadoTarea, 'datos'>, estado: 'COMPLETADO' | 'ERROR', error: string | null) => this.bd.trabajoIA.update({
      where: { id: trabajo.id },
      data: {
        estado, error, proveedor: r.proveedor, modelo: r.modelo, versionPrompt: r.versionPrompt, intentos: r.intentos,
        tokensEntrada: r.consumo.tokensEntrada + r.consumo.tokensCacheLeidos + r.consumo.tokensCacheEscritos, tokensSalida: r.consumo.tokensSalida,
        costoUsd: r.costoUsd, duracionMs: r.duracionMs,
      },
    });
    const faqs = faq.map((f) => f.datos as DatosContenido);
    const variables = {
      sitio: { nombre: neutralizar(ajustes?.nombre || NOMBRE_POR_DEFECTO), url: ajustes?.dominio ? `https://${ajustes.dominio}` : opcionesRenderDesdeEnv().sitioUrl },
      // Los textos del sitio los escribe el superadmin, pero van como datos: neutralizados y dentro de <datos_sitio>.
      preguntasObjetivo: neutralizar(preguntas.map((p) => {
        const m = leerMenciones(p.menciones);
        return `- ${p.pregunta} (${ASISTENTES_IA.map((a) => `${a.nombre}: ${ETIQUETA_MENCION[m[a.id].estado].toLowerCase()}`).join(', ')})`;
      }).join('\n')),
      paginas: neutralizar(paginas.map((p) => `- ${p.titulo} · ${p.ruta} · ${p.idioma} · ${p.estado === 'PUBLICADA' ? 'publicada' : 'sin publicar'}${p.metaDescripcion ? ` · ${p.metaDescripcion}` : ''}`).join('\n') || '(el sitio todavía no tiene páginas)'),
      preguntasFrecuentes: neutralizar(faqs.map((f) => `- ${String(f.pregunta ?? '')}${f.pagina ? ` (${String(f.pagina)})` : ''}`).join('\n') || '(todavía no hay preguntas frecuentes)'),
      maximo: LIMITES_SEO_IA.propuestasPorPedido,
    };
    let r: ResultadoTarea<SalidaPropuestasIa>;
    try {
      r = await ejecutarTarea<SalidaPropuestasIa>(proveedor, TAREA_SEO_IA, variables, { preparar: prepararPropuestasIa, validarExtra: (d) => erroresPropuestasIa(d as SalidaPropuestasIa) });
    } catch (e) {
      if (e instanceof SalidaNoValida) {
        await guardar(e.registro, 'ERROR', e.message);
        throw new BadGatewayException({ codigo: 'PROPUESTA_NO_VALIDA', mensaje: 'La IA no logró una propuesta válida; vuelve a intentarlo' });
      }
      await this.bd.trabajoIA.update({ where: { id: trabajo.id }, data: { estado: 'ERROR', error: e instanceof Error ? e.message : String(e) } });
      throw new BadGatewayException({ codigo: 'IA_NO_DISPONIBLE', mensaje: 'No se pudo consultar a la IA; vuelve a intentarlo en unos minutos' });
    }
    await guardar(r, 'COMPLETADO', null);
    const nuevas = propuestasNuevas(r.datos, {
      rutas: paginas.filter((p) => p.idioma === 'es').map((p) => p.ruta),
      rutasPropuestas: pendientes.filter((p) => p.tipo === 'pagina').map((p) => (p.datos as unknown as PropuestaPaginaIa).ruta),
      preguntas: [...faqs.map((f) => String(f.pregunta ?? '')), ...pendientes.filter((p) => p.tipo === 'pregunta').map((p) => (p.datos as unknown as PropuestaPreguntaIa).pregunta)],
    });
    if (nuevas.length) {
      await this.bd.sitioPropuestaIa.createMany({ data: nuevas.map((p) => ({ tipo: p.tipo, datos: this.sinTipo(p), trabajoId: trabajo.id })) });
    }
    await this.auditar(u, 'SITIO_PROPUESTAS_IA_PEDIDAS', 'TrabajoIA', trabajo.id, { tarea: TAREA_SEO_IA, recibidas: r.datos.propuestas.length, nuevas: nuevas.length, modelo: r.modelo, costoUsd: r.costoUsd });
    return { nuevas: nuevas.length, observaciones: r.datos.observaciones ?? [], propuestas: (await this.pendientes()).map(aPropuestaDto), trabajoId: trabajo.id };
  }

  private sinTipo(p: PropuestaIa): Prisma.InputJsonValue {
    const { tipo: _tipo, ...datos } = p;
    return datos as Prisma.InputJsonValue;
  }

  /** El proveedor con el modelo de la conexión de la plataforma; el simulado no cambia (como en el worker). */
  private conModelo(modelo: string | null | undefined): ProveedorTexto {
    if (!modelo || this.proveedor.nombre === 'simulado') return this.proveedor;
    if (!TARIFAS[modelo]) throw new UnprocessableEntityException({ codigo: 'MODELO_SIN_TARIFA', mensaje: `No hay tarifa registrada para el modelo ${modelo}` });
    return { ...this.proveedor, modeloPara: () => modelo };
  }

  /**
   * El límite de gasto de la plataforma: la conexión de texto sin organización (`ConfigProveedor`). Si el gasto del mes
   * de los trabajos de la plataforma ya llegó al límite, no se llama al proveedor (422 LIMITE_GASTO) y queda en la auditoría.
   */
  private async vigilarLimite(u: UsuarioSesion, tipo: ReturnType<typeof tipoDeTareaIA>, ahora: Date) {
    const conexion = await this.bd.configProveedor.findFirst({ where: { organizacionId: null, tarea: tipo, activo: true } });
    if (conexion?.limiteGastoMensualUsd == null) return conexion;
    const limite = Number(conexion.limiteGastoMensualUsd);
    const suma = await this.bd.trabajoIA.aggregate({ where: { organizacionId: null, tipo, creadoEn: { gte: inicioMesLima(ahora) } }, _sum: { costoUsd: true } });
    const gasto = Number(suma._sum.costoUsd ?? 0);
    if (gasto < limite) return conexion;
    await this.bd.auditoria.create({
      data: { usuarioId: u.id, organizacionId: null, accion: 'LIMITE_GASTO_ALCANZADO', entidad: 'ConfigProveedor', entidadId: conexion.id, datos: { tarea: tipo, gastoUsd: gasto, limiteUsd: limite, tareaIa: TAREA_SEO_IA } },
    });
    throw new UnprocessableEntityException({ codigo: CODIGO_LIMITE_GASTO, mensaje: `La IA de la plataforma llegó a su límite de gasto del mes (USD ${gasto.toFixed(2)} de ${limite.toFixed(2)}). Sube el límite para pedir más propuestas.` });
  }

  private async buscarPendiente(id: string): Promise<SitioPropuestaIa> {
    const p = await this.bd.sitioPropuestaIa.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La propuesta no existe' });
    if (p.estado !== 'pendiente') throw new ConflictException({ codigo: 'PROPUESTA_RESUELTA', mensaje: p.estado === 'descartada' ? 'La propuesta ya se descartó' : 'La propuesta ya tiene su borrador' });
    return p;
  }

  /**
   * CP-127 · «Crear borrador»: una propuesta de página crea una página en BORRADOR (título, ruta, meta título y meta
   * descripción); una de pregunta frecuente crea la pregunta oculta en Contenido. Nada se publica ni cambia el sitio.
   */
  async crearBorrador(u: UsuarioSesion, id: string): Promise<PropuestaIaDto> {
    const p = await this.buscarPendiente(id);
    const propuesta = { tipo: p.tipo, ...(p.datos as object) } as PropuestaIa;
    let creadoId: string;
    if (propuesta.tipo === 'pagina') {
      const seo = aplicarCambiosSeo(leerSeo({}), { metaTitulo: propuesta.metaTitulo, metaDescripcion: propuesta.metaDescripcion });
      if (!seo.ok) throw noValido(seo.errores);
      try {
        const pagina = await this.bd.sitioPagina.create({ data: { ruta: propuesta.ruta, idioma: 'es', titulo: propuesta.titulo, estado: 'BORRADOR', metaTitulo: seo.datos.metaTitulo, metaDescripcion: seo.datos.metaDescripcion } });
        creadoId = pagina.id;
        await this.auditar(u, 'SITIO_PAGINA_CREADA', 'SitioPagina', pagina.id, { ruta: pagina.ruta, idioma: pagina.idioma, estado: pagina.estado, propuestaIaId: id });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException({ codigo: 'RUTA_EN_USO', mensaje: `Ya hay una página en ${propuesta.ruta}: descarta la propuesta o cambia la ruta de esa página` });
        }
        throw e;
      }
    } else {
      const validos = validarDatos('preguntas', { pregunta: propuesta.pregunta, respuesta: propuesta.respuesta, ...(propuesta.pagina ? { pagina: propuesta.pagina } : {}) });
      if (!validos.ok) throw noValido(validos.errores);
      const e = await this.bd.$transaction(async (tx) => {
        const actuales = await tx.sitioElemento.findMany({ where: { coleccion: 'preguntas', idioma: 'es' }, select: { id: true, orden: true, visible: true } });
        return tx.sitioElemento.create({ data: { coleccion: 'preguntas', idioma: 'es', orden: ordenAlFinal(actuales), visible: false, ficticio: false, datos: validos.datos } });
      });
      creadoId = e.id;
      await this.auditar(u, 'SITIO_ELEMENTO_AGREGADO', 'SitioElemento', e.id, { coleccion: 'preguntas', idioma: 'es', orden: e.orden, ficticio: false, datos: validos.datos, propuestaIaId: id });
    }
    const lista = await this.bd.sitioPropuestaIa.update({ where: { id }, data: { estado: 'borrador_creado', creadoId } });
    await this.auditar(u, 'SITIO_PROPUESTA_IA_BORRADOR', 'SitioPropuestaIa', id, { tipo: p.tipo, nombre: nombrePropuestaIa(propuesta), creadoId });
    return aPropuestaDto(lista);
  }

  async descartar(u: UsuarioSesion, id: string): Promise<PropuestaIaDto> {
    const p = await this.buscarPendiente(id);
    const lista = await this.bd.sitioPropuestaIa.update({ where: { id }, data: { estado: 'descartada' } });
    await this.auditar(u, 'SITIO_PROPUESTA_IA_DESCARTADA', 'SitioPropuestaIa', id, { tipo: p.tipo, nombre: nombrePropuestaIa({ tipo: p.tipo, ...(p.datos as object) } as PropuestaIa) });
    return aPropuestaDto(lista);
  }
}
