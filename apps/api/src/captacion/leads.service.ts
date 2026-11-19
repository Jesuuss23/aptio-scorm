import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { eliminarDatosTitular, huellaCorreo, leerAjustesSitio, type Prisma } from '@aptio/db';
import { etapaTrasAgendar } from '@aptio/schema/agenda';
import { etiquetaOrigen, fusionarLead, leadNuevo, leadsACsv, leerHistorial, LIMITES_LEAD, resumenUtm, validarEnvioLead, type EnvioLead } from '@aptio/schema/leads';
import type { UsuarioSesion } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { LimitadorService } from '../comun/limitador.js';
import { CorreoService } from '../correo/correo.service.js';
import { CrmService, crmDeLead } from './crm.service.js';
import { ChatbotService } from './chatbot.service.js';
import { PopupsService } from './popups.service.js';
import type { ConsultaLeadsDto, FiltroLeadsDto, LeadDto, ListaLeadsDto, TitularEliminacionDto, TitularEliminadoDto } from './leads.dto.js';

/** HU-1601 · Envíos por IP en cada ventana; más, 429 (aparte del límite general de /publico/*, SUP-169). */
export const LIMITE_LEADS = { envios: 5, ventanaMs: 10 * 60_000 } as const;

type FilaLead = Prisma.LeadGetPayload<object>;
type FilaLeadCrm = Prisma.LeadGetPayload<{ include: { envios: { include: { conexion: true } } } }>;
const CON_ENVIOS = { envios: { include: { conexion: true } } } as const;

export const aLeadDto = (l: FilaLeadCrm): LeadDto => ({
  id: l.id, correo: l.correo, nombre: l.nombre, empresa: l.empresa, mensaje: l.mensaje, origen: l.origen, via: l.via,
  paginaEntrada: l.paginaEntrada, paginaFormulario: l.paginaFormulario, utmSource: l.utmSource, utmMedium: l.utmMedium, utmCampaign: l.utmCampaign,
  utmTerm: l.utmTerm, utmContent: l.utmContent, referente: l.referente, idioma: l.idioma, etapa: l.etapa, consentimiento: l.consentimiento,
  consentimientoEn: l.consentimientoEn?.toISOString() ?? null, totalContactos: l.totalContactos, historialContactos: leerHistorial(l.historialContactos),
  creadoEn: l.creadoEn.toISOString(), actualizadoEn: l.actualizadoEn.toISOString(), crm: crmDeLead(l.envios),
});

export type ResultadoCaptura = { estado: 'guardado'; leadId: string; nuevo: boolean } | { estado: 'descartado' };

/**
 * HU-1601 · Leads con origen, página de entrada y UTM (REQ-074, RN-17-1). La entrada pública es de datos no
 * confiables: se valida con `@aptio/schema/leads`, se guarda un lead por correo con la atribución del primer contacto y
 * cada envío posterior suma al historial. El aviso al correo de leads va aparte: si falla, el lead ya está guardado.
 */
@Injectable()
export class LeadsService {
  private readonly log = new Logger('Leads');
  /**
   * Los avisos por correo en curso, encadenados (las pruebas los esperan; la respuesta al visitante no). Se encadenan
   * todos y no solo el último: si no, un aviso anterior que tarda más podría llegar después de esperarlo.
   */
  ultimoAviso: Promise<void> = Promise.resolve();
  /** HU-1602 · El último encolado al CRM en curso (la respuesta al visitante tampoco lo espera). */
  ultimoEnvio: Promise<unknown> = Promise.resolve();

  constructor(private readonly baseDatos: BaseDatosService, private readonly limitador: LimitadorService, private readonly correo: CorreoService, private readonly crm: CrmService, private readonly popups: PopupsService, private readonly chatbot: ChatbotService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private encadenarAviso(aviso: Promise<void>, leadId: string): void {
    const seguro = aviso.catch((e: unknown) => this.log.warn(`No se pudo avisar del lead ${leadId}: ${e instanceof Error ? e.message : String(e)}`));
    this.ultimoAviso = Promise.all([this.ultimoAviso, seguro]).then(() => undefined);
  }

  /** Vacía las ventanas del límite (pruebas). */
  reiniciarLimite(): void {
    this.limitador.reiniciar('leads');
  }

  /** ¿Esta IP ya hizo demasiados envíos en la ventana? Cuenta cada intento, también los no válidos. */

  /**
   * Un envío del sitio. 429 si la IP pasó el límite; 422 NO_VALIDO con `detalles` si no valida. Con el campo trampa
   * lleno no se guarda nada, pero quien envía no lo nota. `base` es donde se sirve el sitio (`/s`).
   */
  async capturar(entrada: unknown, ip: string, base: string, ahora = new Date()): Promise<ResultadoCaptura> {
    await this.limitador.exigir('leads', ip, LIMITE_LEADS, 'Recibimos varios envíos seguidos: espera unos minutos e intenta de nuevo');
    const r = validarEnvioLead(entrada, base);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    if (r.trampa) return { estado: 'descartado' };
    const { lead, nuevo } = await this.guardar(r.envio, ahora);
    // HU-1603 · El correo dejado en un popup cuenta como su conversión (el `popupId` viene del script del sitio).
    if (r.envio.via === 'popup') await this.popups.convertirPorCorreo((entrada as { popupId?: unknown } | null)?.popupId).catch((e: unknown) => this.log.warn(`No se pudo contar la conversión del popup: ${e instanceof Error ? e.message : String(e)}`));
    // HU-1604 · El correo y la pregunta dejados en el chat: la conversación pasa a «lead».
    if (r.envio.via === 'chatbot') await this.chatbot.marcar((entrada as { conversacionId?: unknown } | null)?.conversacionId, 'lead');
    this.encadenarAviso(this.avisar(lead, nuevo, r.envio), lead.id);
    // HU-1602 · Al CRM y al webhook activos: el alta, o un contacto nuevo del mismo correo.
    this.ultimoEnvio = this.crm.encolar(lead.id, nuevo ? 'lead.creado' : 'lead.actualizado').catch((e: unknown) => this.log.warn(`No se pudo encolar el lead ${lead.id} al CRM: ${e instanceof Error ? e.message : String(e)}`));
    return { estado: 'guardado', leadId: lead.id, nuevo };
  }

  /**
   * HU-1605 · El lead de una demo agendada (vía agendador, ya validado con la reserva): se guarda como cualquier envío,
   * pasa a «Demo» si estaba en «Nuevo» o «Contactado» (SUP-254, excepción a SUP-236), avisa al correo de leads y va al
   * CRM. El límite por IP lo aplica la reserva.
   */
  async registrarAgendado(envio: EnvioLead, ahora = new Date()): Promise<{ leadId: string; nuevo: boolean }> {
    let { lead, nuevo } = await this.guardar(envio, ahora);
    const etapa = etapaTrasAgendar(lead.etapa);
    if (etapa !== lead.etapa) lead = await this.bd.lead.update({ where: { id: lead.id }, data: { etapa } });
    this.encadenarAviso(this.avisar(lead, nuevo, envio), lead.id);
    this.ultimoEnvio = this.crm.encolar(lead.id, nuevo ? 'lead.creado' : 'lead.actualizado').catch((e: unknown) => this.log.warn(`No se pudo encolar el lead ${lead.id} al CRM: ${e instanceof Error ? e.message : String(e)}`));
    return { leadId: lead.id, nuevo };
  }

  /**
   * HU-1703 · El lead de una suscripción pagada, dentro de la transacción del alta (la organización, el administrador,
   * la suscripción y el lead se crean juntos o no se crea nada). El aviso y el CRM van después, con `trasGuardar`.
   */
  async guardarEnTransaccion(tx: Prisma.TransactionClient, envio: EnvioLead, ahora: Date, etapa?: string): Promise<{ lead: FilaLead; nuevo: boolean }> {
    const actual = await tx.lead.findUnique({ where: { correo: envio.correo } });
    if (actual) {
      const c = fusionarLead(actual, envio, ahora);
      const lead = await tx.lead.update({ where: { id: actual.id }, data: { ...c, historialContactos: c.historialContactos as unknown as Prisma.InputJsonValue, ...(etapa ? { etapa } : {}) } });
      return { lead, nuevo: false };
    }
    const d = leadNuevo(envio, ahora);
    const lead = await tx.lead.create({ data: { ...d, historialContactos: d.historialContactos as unknown as Prisma.InputJsonValue, ...(etapa ? { etapa } : {}) } });
    return { lead, nuevo: true };
  }

  /** El aviso al correo de leads y el envío al CRM de un lead ya guardado (no esperan; si fallan, se registra). */
  trasGuardar(lead: FilaLead, nuevo: boolean, envio: EnvioLead): void {
    this.encadenarAviso(this.avisar(lead, nuevo, envio), lead.id);
    this.ultimoEnvio = this.crm.encolar(lead.id, nuevo ? 'lead.creado' : 'lead.actualizado').catch((e: unknown) => this.log.warn(`No se pudo encolar el lead ${lead.id} al CRM: ${e instanceof Error ? e.message : String(e)}`));
  }

  /** Un lead por correo: si dos envíos llegan juntos, el segundo se suma al primero en vez de fallar. */
  private async guardar(envio: EnvioLead, ahora: Date, intento = 0): Promise<{ lead: FilaLead; nuevo: boolean }> {
    const actual = await this.bd.lead.findUnique({ where: { correo: envio.correo } });
    if (actual) {
      const c = fusionarLead(actual, envio, ahora);
      const lead = await this.bd.lead.update({ where: { id: actual.id }, data: { ...c, historialContactos: c.historialContactos as unknown as Prisma.InputJsonValue } });
      return { lead, nuevo: false };
    }
    const d = leadNuevo(envio, ahora);
    try {
      const lead = await this.bd.lead.create({ data: { ...d, historialContactos: d.historialContactos as unknown as Prisma.InputJsonValue } });
      return { lead, nuevo: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002' && intento === 0) return this.guardar(envio, ahora, 1);
      throw e;
    }
  }

  /** El aviso al «correo de leads» de Ajustes del sitio; sin correo guardado, no se envía nada. */
  private async avisar(lead: FilaLead, nuevo: boolean, envio: EnvioLead): Promise<void> {
    const para = (await leerAjustesSitio(this.bd))?.correoLeads;
    if (!para) return;
    const lineas = [
      nuevo ? 'Llegó un lead nuevo desde el sitio.' : `El lead volvió a escribir (${lead.totalContactos} contactos).`,
      '',
      `Nombre: ${lead.nombre || '(sin nombre)'}`,
      `Correo: ${lead.correo}`,
      `Empresa: ${lead.empresa ?? '(sin empresa)'}`,
      `Origen: ${etiquetaOrigen(lead.origen)}${lead.origen !== lead.via ? ` (vía ${etiquetaOrigen(lead.via)})` : ''}`,
      `Página de entrada: ${lead.paginaEntrada}`,
      `Página del envío: ${envio.paginaFormulario ?? envio.paginaEntrada}`,
      `UTM: ${resumenUtm(lead)}${lead.utmCampaign ? ` · ${lead.utmCampaign}` : ''}`,
      ...(envio.mensaje ? ['', 'Mensaje:', envio.mensaje] : []),
      '',
      'Revísalo en Captación › Leads y CRM.',
    ];
    await this.correo.enviar({ para, asunto: `${nuevo ? 'Lead nuevo' : 'Lead que vuelve'} · ${etiquetaOrigen(lead.origen)} · ${lead.nombre || lead.correo}`, texto: lineas.join('\n') });
  }

  private donde(f: FiltroLeadsDto): Prisma.LeadWhereInput {
    return { ...(f.origen ? { origen: f.origen } : {}), ...(f.etapa ? { etapa: f.etapa } : {}) };
  }

  async listar(q: ConsultaLeadsDto): Promise<ListaLeadsDto> {
    const pagina = q.pagina ?? 1;
    const porPagina = q.porPagina ?? 25;
    const where = this.donde(q);
    const [filas, total] = await Promise.all([
      this.bd.lead.findMany({ where, orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }], skip: (pagina - 1) * porPagina, take: porPagina, include: CON_ENVIOS }),
      this.bd.lead.count({ where }),
    ]);
    return { leads: filas.map(aLeadDto), total, pagina, porPagina };
  }

  async cambiarEtapa(u: UsuarioSesion, id: string, etapa: string): Promise<LeadDto> {
    const actual = await this.bd.lead.findUnique({ where: { id }, include: CON_ENVIOS });
    if (!actual) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El lead no existe' });
    if (actual.etapa === etapa) return aLeadDto(actual);
    await this.bd.lead.update({ where: { id }, data: { etapa } });
    await this.auditar(u, 'LEAD_ETAPA_CAMBIADA', id, { antes: actual.etapa, etapa });
    // HU-1602 · La etapa nueva llega al CRM; si la cola no responde, el envío queda en «error» y la fila lo muestra.
    await this.crm.encolar(id, 'lead.actualizado');
    return aLeadDto(await this.bd.lead.findUniqueOrThrow({ where: { id }, include: CON_ENVIOS }));
  }

  /** El CSV con los filtros aplicados (hasta 5000, del más nuevo al más antiguo). Es exportar datos personales: se audita. */
  async exportar(u: UsuarioSesion, f: FiltroLeadsDto): Promise<{ csv: string; filas: number }> {
    const filas = await this.bd.lead.findMany({ where: this.donde(f), orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }], take: LIMITES_LEAD.exportar });
    await this.auditar(u, 'LEADS_EXPORTADOS', null, { filas: filas.length, filtros: { ...(f.origen ? { origen: f.origen } : {}), ...(f.etapa ? { etapa: f.etapa } : {}) } });
    return { csv: leadsACsv(filas), filas: filas.length };
  }

  /**
   * SUP-237 · Borrar a pedido del titular (Ley 29733): el lead de ese correo se borra con sus envíos al CRM, sus citas
   * se anonimizan y las que venían se cancelan. La Auditoría guarda la huella del correo, no el correo. Las copias en
   * los CRM conectados se devuelven para pedir allí su borrado. Responde igual exista o no el correo.
   */
  async eliminarTitular(u: UsuarioSesion, dto: TitularEliminacionDto): Promise<TitularEliminadoDto> {
    const r = await this.bd.$transaction((tx) => eliminarDatosTitular(tx, dto.correo));
    await this.auditar(u, 'LEAD_ELIMINADO_TITULAR', null, { correoHuella: huellaCorreo(dto.correo), motivo: dto.motivo.trim(), lead: r.lead, citas: r.citas, citasCanceladas: r.citasCanceladas, crm: r.crm.map((x) => x.tipo) });
    return r;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'Lead', entidadId, datos: datos as Prisma.InputJsonValue } });
  }
}
