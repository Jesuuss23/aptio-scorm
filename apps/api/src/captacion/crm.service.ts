import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException, type OnModuleDestroy, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { COLA_CRM, type DatosEnvioCrm, opcionesRedis, opcionesTareaCrm, prefijoColas, TAREA_CRM } from '@aptio/colas';
import type { Prisma } from '@aptio/db';
import {
  CAMPOS_LEAD_CRM, DESCRIPCION_CRM, ETIQUETA_CAMPO_CRM, esTipoCrm, MAPEO_POR_DEFECTO, mapeoDe, motivoSeguro, NOMBRE_CRM, resumenCrm, tieneMapeo, TIPOS_CRM, type TipoCrm,
  validarMapeo, validarUrlWebhook,
} from '@aptio/schema/crm';
import { CABECERA_FIRMA, clavesFaltantes, type DependenciasCrm, generarSecreto, probarCrm, TOLERANCIA_FIRMA_S } from '@aptio/schema/crm-envio';
import { Queue } from 'bullmq';
import type { UsuarioSesion } from '../comun/roles.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { ConexionCrmDto, CrmCambioDto, CrmDto, PruebaCrmDto } from './crm.dto.js';
import type { CrmLeadDto } from './leads.dto.js';

const PLAZO_REDIS_MS = 2000;
type FilaConexion = Prisma.CrmConexionGetPayload<object>;
type FilaEnvio = Prisma.LeadEnvioGetPayload<{ include: { conexion: true } }>;

/** La columna «CRM» del lead con los envíos de las conexiones activas. */
export function crmDeLead(envios: readonly FilaEnvio[]): CrmLeadDto {
  const activos = envios.filter((e) => e.conexion.activa && esTipoCrm(e.conexion.tipo)).sort((a, b) => TIPOS_CRM.indexOf(a.conexion.tipo as TipoCrm) - TIPOS_CRM.indexOf(b.conexion.tipo as TipoCrm));
  const r = resumenCrm(activos.map((e) => ({ tipo: e.conexion.tipo as TipoCrm, estado: e.estado, motivo: e.motivo })));
  return { ...r, envios: activos.map((e) => ({ tipo: e.conexion.tipo, estado: e.estado, intentos: e.intentos, motivo: e.motivo, enviadoEn: e.enviadoEn?.toISOString() ?? null })) };
}

/**
 * HU-1602 · Integración con CRM (REQ-075, RN-17-2, PNT-34). Las conexiones (HubSpot, Pipedrive, Zoho y el webhook), su
 * mapeo, la clave del webhook y el envío de cada lead a la cola `crm`. Las claves de los CRM viven en el entorno; el
 * panel solo dice si están. Encolar nunca hace fallar la captura del lead: si Redis no responde, el envío queda en
 * «error» con el motivo y se reintenta a mano.
 */
@Injectable()
export class CrmService implements OnModuleDestroy {
  private readonly log = new Logger('Crm');
  private cola?: Queue<DatosEnvioCrm>;
  /** Lo que usa «Enviar prueba» para llamar afuera (las pruebas lo reemplazan). */
  deps: DependenciasCrm = {};

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private get crm(): Queue<DatosEnvioCrm> {
    this.cola ??= new Queue<DatosEnvioCrm>(COLA_CRM, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  private async conPlazo<T>(p: Promise<T>): Promise<T> {
    let reloj: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([p, new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), PLAZO_REDIS_MS); })]);
    } finally {
      clearTimeout(reloj);
    }
  }

  /** Las cuatro conexiones; las que no tienen fila todavía salen apagadas con el mapeo de por defecto. */
  private async filas(): Promise<Map<TipoCrm, FilaConexion | undefined>> {
    const filas = await this.bd.crmConexion.findMany();
    return new Map(TIPOS_CRM.map((t) => [t, filas.find((f) => f.tipo === t)]));
  }

  private faltan(tipo: TipoCrm, f: Pick<FilaConexion, 'url' | 'secreto'> | undefined): string[] {
    if (tieneMapeo(tipo)) return clavesFaltantes(tipo, this.deps.entorno ?? process.env);
    return [...(f?.url ? [] : ['url']), ...(f?.secreto ? [] : ['secreto'])];
  }

  private aDto(tipo: TipoCrm, f: FilaConexion | undefined): ConexionCrmDto {
    const faltan = this.faltan(tipo, f);
    return {
      tipo, nombre: NOMBRE_CRM[tipo], descripcion: DESCRIPCION_CRM[tipo], activa: f?.activa ?? false, configurada: !faltan.length, faltan,
      mapeo: tieneMapeo(tipo) ? (mapeoDe(tipo, f?.mapeo) as Record<string, string>) : null,
      mapeoPorDefecto: tieneMapeo(tipo) ? (MAPEO_POR_DEFECTO[tipo] as Record<string, string>) : null,
      url: tipo === 'webhook' ? (f?.url ?? null) : null, secreto: tipo === 'webhook' ? (f?.secreto ?? null) : null, actualizadoEn: f?.actualizadoEn.toISOString() ?? null,
    };
  }

  async estado(): Promise<CrmDto> {
    const filas = await this.filas();
    return {
      conexiones: TIPOS_CRM.map((t) => this.aDto(t, filas.get(t))),
      campos: CAMPOS_LEAD_CRM.map((c) => ({ campo: c, etiqueta: ETIQUETA_CAMPO_CRM[c] })),
      cabeceraFirma: CABECERA_FIRMA, toleranciaSegundos: TOLERANCIA_FIRMA_S,
    };
  }

  /**
   * Activar, desactivar, el mapeo de un CRM o la URL del webhook. 422 si el cambio no vale: mapeo en el webhook o URL
   * en un CRM, mapeo o URL no válidos, o activar sin la clave del entorno (FALTA_CLAVE) o sin la URL (FALTA_URL).
   * Activar el webhook sin clave la genera. No envía los leads anteriores.
   */
  async cambiar(u: UsuarioSesion, c: CrmCambioDto): Promise<CrmDto> {
    const tipo = c.tipo as TipoCrm;
    const actual = (await this.filas()).get(tipo);
    const datos: Prisma.CrmConexionUncheckedCreateInput = { tipo };
    const errores: { campo: string; mensaje: string }[] = [];
    if (c.mapeo !== undefined) {
      if (!tieneMapeo(tipo)) errores.push({ campo: 'mapeo', mensaje: 'El webhook manda el lead completo: no tiene mapeo de campos' });
      else {
        const m = validarMapeo(tipo, c.mapeo);
        if (m.ok) datos.mapeo = m.mapeo as Prisma.InputJsonValue;
        else errores.push(...m.errores);
      }
    }
    if (c.url !== undefined) {
      if (tipo !== 'webhook') errores.push({ campo: 'url', mensaje: `${NOMBRE_CRM[tipo]} no usa URL: su dirección es fija` });
      else {
        const r = validarUrlWebhook(c.url);
        if (r.ok) datos.url = r.url;
        else errores.push({ campo: 'url', mensaje: r.mensaje });
      }
    }
    if (errores.length) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });
    const activa = c.activa ?? actual?.activa ?? false;
    if (activa) {
      if (tieneMapeo(tipo)) {
        const faltan = this.faltan(tipo, undefined);
        if (faltan.length) throw new UnprocessableEntityException({ codigo: 'FALTA_CLAVE', mensaje: `No se puede activar ${NOMBRE_CRM[tipo]}: define ${faltan.join(', ')} en el entorno del servidor` });
      } else {
        const url = datos.url !== undefined ? datos.url : actual?.url;
        if (!url) throw new UnprocessableEntityException({ codigo: 'FALTA_URL', mensaje: 'Para activar el webhook, escribe su URL https://' });
        if (!actual?.secreto) datos.secreto = generarSecreto();
      }
    }
    if (c.activa !== undefined) datos.activa = c.activa;
    const { tipo: _t, ...cambio } = datos;
    await this.bd.crmConexion.upsert({ where: { tipo }, create: datos, update: cambio });
    await this.auditar(u, 'CRM_CONEXION_EDITADA', tipo, {
      tipo, ...(c.activa !== undefined ? { activa: c.activa } : {}), ...(datos.mapeo !== undefined ? { mapeo: datos.mapeo } : {}), ...(datos.url !== undefined ? { url: datos.url } : {}),
      ...(datos.secreto ? { secretoGenerado: true } : {}),
    });
    return this.estado();
  }

  /** Una clave nueva del webhook: la anterior deja de valer en el siguiente envío. Se audita sin la clave. */
  async regenerarSecreto(u: UsuarioSesion): Promise<CrmDto> {
    await this.bd.crmConexion.upsert({ where: { tipo: 'webhook' }, create: { tipo: 'webhook', secreto: generarSecreto() }, update: { secreto: generarSecreto() } });
    await this.auditar(u, 'CRM_SECRETO_REGENERADO', 'webhook', { tipo: 'webhook' });
    return this.estado();
  }

  /** «Enviar prueba»: el webhook recibe `lead.prueba` firmado; un CRM, una lectura que comprueba la clave (CP-130). */
  async probar(u: UsuarioSesion, tipo: string): Promise<PruebaCrmDto> {
    if (!esTipoCrm(tipo)) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La conexión no existe' });
    const f = (await this.filas()).get(tipo);
    if (tipo === 'webhook' && !f?.url) throw new UnprocessableEntityException({ codigo: 'FALTA_URL', mensaje: 'Escribe la URL del webhook antes de probarlo' });
    if (tipo === 'webhook' && !f?.secreto) throw new UnprocessableEntityException({ codigo: 'FALTA_SECRETO', mensaje: 'Genera la clave del webhook antes de probarlo' });
    const r = await probarCrm({ tipo, url: f?.url ?? null, secreto: f?.secreto ?? null }, this.deps);
    await this.auditar(u, 'CRM_PRUEBA_ENVIADA', tipo, { tipo, ok: r.ok, ...(r.ok ? {} : { motivo: r.motivo }) });
    return r.ok ? { ok: true, mensaje: r.detalle } : { ok: false, mensaje: r.motivo };
  }

  /**
   * Pone el lead en la cola para cada conexión activa (o solo las que no están enviadas, con `soloPendientes`). Devuelve
   * los tipos encolados. Si Redis no responde, el envío queda «error» con el motivo y, con `lanzar`, responde 503.
   */
  async encolar(leadId: string, evento: DatosEnvioCrm['evento'], opciones: { soloPendientes?: boolean; lanzar?: boolean } = {}): Promise<TipoCrm[]> {
    const activas = (await this.bd.crmConexion.findMany({ where: { activa: true } })).filter((c) => esTipoCrm(c.tipo));
    const encolados: TipoCrm[] = [];
    for (const c of activas) {
      const previo = await this.bd.leadEnvio.findUnique({ where: { leadId_conexionId: { leadId, conexionId: c.id } } });
      if (opciones.soloPendientes && previo?.estado === 'enviado') continue;
      const envio = await this.bd.leadEnvio.upsert({ where: { leadId_conexionId: { leadId, conexionId: c.id } }, create: { leadId, conexionId: c.id }, update: { estado: 'pendiente', motivo: null } });
      const entrega = randomUUID();
      try {
        await this.conPlazo(this.crm.add(TAREA_CRM, { envioId: envio.id, evento, entrega }, opcionesTareaCrm(entrega)));
        encolados.push(c.tipo as TipoCrm);
      } catch (e) {
        const motivo = motivoSeguro(`No se pudo encolar el envío: ${e instanceof Error ? e.message : String(e)}`);
        this.log.warn(`${motivo} (lead ${leadId}, ${c.tipo})`);
        await this.bd.leadEnvio.update({ where: { id: envio.id }, data: { estado: 'error', motivo } });
        if (opciones.lanzar) throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE', mensaje: 'La cola de envíos no responde: inténtalo en unos minutos' });
      }
    }
    return encolados;
  }

  /** «Reintentar» de la fila: vuelve a encolar el lead en las conexiones activas que no lo tienen enviado. */
  async sincronizar(u: UsuarioSesion, leadId: string): Promise<TipoCrm[]> {
    const lead = await this.bd.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El lead no existe' });
    if (!(await this.bd.crmConexion.count({ where: { activa: true } }))) throw new UnprocessableEntityException({ codigo: 'SIN_CONEXIONES', mensaje: 'Activa una conexión de CRM o el webhook antes de sincronizar' });
    const encolados = await this.encolar(leadId, 'lead.actualizado', { soloPendientes: true, lanzar: true });
    await this.auditar(u, 'LEAD_SINCRONIZACION_REINTENTADA', leadId, { encolados }, 'Lead');
    return encolados;
  }

  private auditar(u: UsuarioSesion, accion: string, entidadId: string, datos: Record<string, unknown>, entidad = 'CrmConexion') {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad, entidadId, datos: datos as Prisma.InputJsonValue } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }
}
