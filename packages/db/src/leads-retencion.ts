// SUP-237 · Retención de los leads del sitio (Ley 29733): se borran solos tras los días de retención sin actividad, y
// el superadmin los borra a pedido del titular. Las citas del agendador no se borran (cuentan en el Resumen y en la
// agenda de los asesores): se anonimizan. Lo usan el worker (borrado diario) y la API (pedido del titular).
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

/** Días sin actividad tras los que se borra un lead (por defecto, 2 años). Se cambia con `RETENCION_LEADS_DIAS`. */
export const RETENCION_LEADS_DIAS = 730;
const DIA_MS = 24 * 60 * 60 * 1000;

export function retencionLeadsDias(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.RETENCION_LEADS_DIAS);
  return Number.isInteger(n) && n >= 30 && n <= 3650 ? n : RETENCION_LEADS_DIAS;
}

/** Huella del correo para la Auditoría: permite comprobar un pedido sin guardar el correo. */
export const huellaCorreo = (correo: string): string => createHash('sha256').update(correo.trim().toLowerCase()).digest('hex');

/** Lo que dejan las citas anonimizadas en lugar de los datos del titular. */
export const CITA_ANONIMA = { nombre: 'Titular eliminado', correo: '', empresa: null, lms: null } as const;

type Bd = PrismaClient | Prisma.TransactionClient;

export interface ResultadoTitular {
  /** El lead existía y se borró. */
  lead: boolean;
  citas: number;
  /** Citas por venir que se cancelaron: el titular ya no quiere que lo contacten. */
  citasCanceladas: number;
  /** Copias en los CRM conectados: hay que pedir su borrado allí (el sitio no las borra). */
  crm: { tipo: string; idExterno: string | null }[];
}

/** Borra el lead de ese correo, anonimiza sus citas y cancela las que vienen. Corre dentro de una transacción. */
export async function eliminarDatosTitular(tx: Prisma.TransactionClient, correo: string, ahora = new Date()): Promise<ResultadoTitular> {
  const c = correo.trim().toLowerCase();
  const lead = await tx.lead.findUnique({ where: { correo: c }, select: { id: true, envios: { where: { estado: 'enviado' }, select: { idExterno: true, conexion: { select: { tipo: true } } } } } });
  const deLaPersona: Prisma.AgendaCitaWhereInput = { OR: [{ correo: c }, ...(lead ? [{ leadId: lead.id }] : [])] };
  const { count: citasCanceladas } = await tx.agendaCita.updateMany({ where: { AND: [deLaPersona, { estado: 'confirmada', inicio: { gt: ahora } }] }, data: { estado: 'cancelada', canceladaPor: 'titular' } });
  const { count: citas } = await tx.agendaCita.updateMany({ where: deLaPersona, data: { ...CITA_ANONIMA, leadId: null } });
  if (lead) await tx.lead.delete({ where: { id: lead.id } });
  return { lead: Boolean(lead), citas, citasCanceladas, crm: (lead?.envios ?? []).map((e) => ({ tipo: e.conexion.tipo, idExterno: e.idExterno })) };
}

export interface ResultadoRetencionLeads {
  leads: number;
  citas: number;
}

/** Borrado diario: los leads sin actividad desde hace más de `dias` y las citas de esa antigüedad, anonimizadas. */
export async function borrarLeadsVencidos(bd: Bd, ahora = new Date(), dias = retencionLeadsDias()): Promise<ResultadoRetencionLeads> {
  const limite = new Date(ahora.getTime() - dias * DIA_MS);
  const { count: leads } = await bd.lead.deleteMany({ where: { actualizadoEn: { lt: limite } } });
  const { count: citas } = await bd.agendaCita.updateMany({ where: { inicio: { lt: limite }, NOT: { nombre: CITA_ANONIMA.nombre, correo: '' } }, data: { ...CITA_ANONIMA, leadId: null } });
  if (leads || citas) {
    await bd.auditoria.create({ data: { accion: 'LEADS_BORRADOS', entidad: 'Lead', datos: { motivo: 'retencion', dias, leads, citas } } });
  }
  return { leads, citas };
}
