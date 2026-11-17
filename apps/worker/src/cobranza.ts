/**
 * HU-1708 · Cobranza y suspensión (REQ-088, CP-150, RN-18-8). La tarea periódica `renovar-suscripciones` de la cola
 * `suscripciones`, idempotente (puede correr dos veces seguidas, o atrasada, sin duplicar nada):
 *
 * 1. vence las suscripciones que pidieron cancelar al fin del período (no se renuevan);
 * 2. al llegar `finPeriodo`, crea la `Renovacion` del período siguiente (única por suscripción y período), aplica la
 *    bajada programada (el precio publicado vigente del plan nuevo) y deja la suscripción en PAGO_PENDIENTE;
 * 3. hace los intentos de los días 0, 1, 3 y 7: con la pasarela de pruebas cobra solo (la tarjeta terminada en 0002
 *    rechaza); con Stripe o Culqi envía al administrador el correo con el enlace a «Pagar ahora» (hasta la HU-1711, que
 *    guarda el medio de pago);
 * 4. el día 10 sin pago, deja la suscripción SUSPENDIDA (solo lectura) y avisa por correo.
 *
 * El pago (del webhook o del cobro de pruebas) lo resuelve `resolverPagoRenovacion` de `@aptio/db`, el mismo de la API.
 */
import { Prisma, type PrismaClient, precioPublicado, resolverPagoRenovacion } from '@aptio/db';
import { cobroPruebaAprueba, DIAS_INTENTOS, fechaDelPaso, montoRenovacion, periodoRenovado, siguientePaso } from '@aptio/schema/cobranza';
import { renuevaConDescuento } from '@aptio/schema/cupones';
import { entornoSitio, type EntornoSitio } from '@aptio/schema/sitio-ficticios';
import { monto2, PASARELA_PRUEBA } from '@aptio/schema/suscripciones';
import type { Correo, EnviarCorreo } from './correo.js';
import { fechaLarga, procesarVencimiento } from './suscripciones.js';

export type PrecioDe = (slug: string, ciclo: string, mon: 'PEN' | 'USD') => Promise<number | null>;
const moneda = (m: string) => (m === 'USD' ? 'USD' : 'PEN') as 'PEN' | 'USD';

export interface OpcionesCobranza {
  enviar: EnviarCorreo;
  /** Encola «emitir comprobante» del cobro aprobado (`jobId` = id del cobro). */
  encolarComprobante: (cobroId: string) => Promise<unknown>;
  entorno?: EntornoSitio | undefined;
  /** El precio publicado vigente de un plan (por defecto, el de la última versión del sitio). Las pruebas lo fijan. */
  precio?: PrecioDe | undefined;
  /** Solo estas organizaciones (las pruebas no tocan las suscripciones de otras). */
  organizaciones?: readonly string[] | undefined;
  /** La consola web, para el enlace a «Pagar ahora». */
  webUrl?: string | undefined;
}

export interface ResumenCobranza { canceladas: number; creadas: number; intentos: number; cobradas: number; suspendidas: number }

type FilaRenovacion = Prisma.RenovacionGetPayload<{ include: { plan: true; suscripcion: true; organizacion: true } }>;
const CON_TODO = { plan: true, suscripcion: true, organizacion: true } as const;

const enlacePago = (o: OpcionesCobranza, r: { id: string }) => `${o.webUrl ?? process.env.WEB_URL ?? 'http://localhost:5173'}/plan?renovacion=${r.id}`;

/** Los administradores activos de la organización: a ellos va la cobranza. */
async function administradores(bd: PrismaClient, organizacionId: string) {
  return bd.usuario.findMany({ where: { organizacionId, rol: 'ADMINISTRADOR', activo: true }, select: { email: true, nombre: true }, orderBy: { creadoEn: 'asc' } });
}

async function avisar(bd: PrismaClient, o: OpcionesCobranza, r: FilaRenovacion, armar: (nombre: string) => Omit<Correo, 'para'>) {
  for (const a of await administradores(bd, r.organizacionId)) await o.enviar({ para: a.email, ...armar(a.nombre) });
}

/** El correo de cada intento (o del cobro de pruebas rechazado): el total, el enlace a «Pagar ahora» y la fecha de la suspensión. */
export function correoIntento(r: FilaRenovacion, nombre: string, enlace: string, motivo: string | null): Omit<Correo, 'para'> {
  const total = monto2(Number(r.total), moneda(r.moneda));
  const lineas = [
    `Hola, ${nombre}:`, '',
    motivo
      ? `No pudimos cobrar la renovación del plan ${r.plan.nombre} de ${r.organizacion.nombre}: ${motivo}.`
      : `El período del plan ${r.plan.nombre} de ${r.organizacion.nombre} terminó el ${fechaLarga(r.periodoInicio)}.`,
    `Total de la renovación: ${total} (incluye IGV de 18 %), por el período hasta el ${fechaLarga(r.periodoFin)}.`, '',
    'Paga ahora con este enlace:', enlace, '',
    `Si no recibimos el pago, el ${fechaLarga(fechaDelPaso(r.periodoInicio, DIAS_INTENTOS.length))} la cuenta queda en solo lectura: el equipo podrá ver y descargar lo entregado, pero no generar ni editar.`, '',
    'El equipo de Aptio SCORM',
  ];
  return { asunto: `Renueva tu plan de Aptio SCORM · ${total}`, texto: lineas.join('\n') };
}

export function correoSuspension(r: FilaRenovacion, nombre: string, enlace: string): Omit<Correo, 'para'> {
  const lineas = [
    `Hola, ${nombre}:`, '',
    `No recibimos el pago de la renovación del plan ${r.plan.nombre} y la cuenta de ${r.organizacion.nombre} quedó en solo lectura.`,
    'El equipo puede seguir ingresando, ver los proyectos y descargar lo exportado, pero no generar ni editar.', '',
    `Para reactivarla, paga ${monto2(Number(r.total), moneda(r.moneda))} (incluye IGV de 18 %) con este enlace:`, enlace, '',
    'Al confirmarse el pago, la cuenta vuelve a la normalidad y el período nuevo empieza ese día.', '',
    'El equipo de Aptio SCORM',
  ];
  return { asunto: 'Tu cuenta de Aptio SCORM está en solo lectura', texto: lineas.join('\n') };
}

/**
 * Crea la renovación del período vencido de una suscripción ACTIVA, con la bajada programada aplicada, y la deja en
 * PAGO_PENDIENTE. Con el cerrojo de la suscripción y la clave única (suscripción, período): repetirla no duplica nada.
 */
export async function crearRenovacion(bd: PrismaClient, suscripcionId: string, ahora: Date, precio: PrecioDe): Promise<string | null> {
  try {
    return await bd.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Suscripcion" WHERE "id" = ${suscripcionId}::uuid FOR UPDATE`;
      const s = await tx.suscripcion.findUnique({ where: { id: suscripcionId }, include: { planProgramado: true } });
      if (!s || s.estado !== 'ACTIVA' || s.cancelarAlFin || s.finPeriodo.getTime() > ahora.getTime()) return null;
      if (await tx.renovacion.findUnique({ where: { suscripcionId_periodoInicio: { suscripcionId: s.id, periodoInicio: s.finPeriodo } } })) return null;
      const mon = moneda(s.moneda);
      const programado = s.planProgramado
        ? { id: s.planProgramado.id, precioCiclo: await precio(s.planProgramado.slug, s.ciclo, mon) }
        : null;
      // HU-1709 · Con el cupón del alta y ciclos por delante (o permanente), el descuento sobre el precio de lista.
      const m = montoRenovacion({ planId: s.planId, precioPactadoSinIgv: s.precioPactadoSinIgv, moneda: mon }, programado, renuevaConDescuento(s) ? s.porcentajeDescuento : null);
      const periodo = periodoRenovado(s.finPeriodo, s.ciclo);
      const r = await tx.renovacion.create({
        data: {
          organizacionId: s.organizacionId, suscripcionId: s.id, planId: m.planId, periodoInicio: periodo.inicio, periodoFin: periodo.fin, montoSinIgv: m.montoSinIgv,
          igv: m.igv, total: m.total, moneda: m.moneda, pasarela: s.pasarela, proximoIntento: fechaDelPaso(s.finPeriodo, 0),
          ...(m.porcentajeDescuento ? { porcentajeDescuento: m.porcentajeDescuento, descuentoSinIgv: m.descuentoSinIgv } : {}),
        },
      });
      const bajada = m.planId !== s.planId;
      await tx.suscripcion.update({
        where: { id: s.id },
        data: { estado: 'PAGO_PENDIENTE', planProgramadoId: null, ...(bajada ? { planId: m.planId, precioPactadoSinIgv: Math.round(m.listaSinIgv) } : {}) },
      });
      await tx.auditoria.create({
        data: {
          organizacionId: s.organizacionId, usuarioId: null, accion: 'RENOVACION_CREADA', entidad: 'Renovacion', entidadId: r.id,
          datos: {
            suscripcionId: s.id, planId: m.planId, total: m.total, moneda: m.moneda, porcentajeDescuento: m.porcentajeDescuento, descuento: m.descuentoSinIgv, periodoInicio: periodo.inicio.toISOString(), periodoFin: periodo.fin.toISOString(),
            bajadaAplicada: bajada ? { planOrigenId: s.planId, planDestinoId: m.planId } : null, bajadaSinPrecio: programado && !bajada ? programado.id : null,
          },
        },
      });
      return r.id;
    });
  } catch (e) {
    // Dos corridas a la vez: la segunda choca con la clave única y no crea otra.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
    throw e;
  }
}

/**
 * Un intento de cobro. Con la pasarela de pruebas (solo en `pruebas`) cobra con la tarjeta guardada y resuelve el pago;
 * si no, o si el cobro se rechaza, envía el enlace a «Pagar ahora». Devuelve el cobro aprobado, si hubo.
 */
async function intentar(bd: PrismaClient, o: OpcionesCobranza, r: FilaRenovacion, numero: number | 'manual', ahora: Date): Promise<string | null> {
  const entorno = o.entorno ?? entornoSitio(process.env.SITIO_ENTORNO);
  let motivo: string | null = null;
  if (r.pasarela === PASARELA_PRUEBA && entorno === 'pruebas') {
    const aprueba = cobroPruebaAprueba(r.suscripcion.ultimos4Digitos);
    const res = await bd.$transaction((tx) => resolverPagoRenovacion(tx, r.id, {
      pasarela: PASARELA_PRUEBA, eventoId: `cobro-auto-${r.id}-${numero === 'manual' ? `m${ahora.getTime()}` : numero}`, resultado: aprueba ? 'aprobado' : 'rechazado',
      monto: Number(r.total), moneda: r.moneda, ultimos4: r.suscripcion.ultimos4Digitos, motivo: aprueba ? null : 'la tarjeta de prueba fue rechazada',
    }, ahora));
    if (res.cobroId) {
      await o.encolarComprobante(res.cobroId);
      if (res.desenlace === 'renovada' || res.desenlace === 'reactivada') return res.cobroId;
    }
    if (res.desenlace !== 'rechazada') return null;
    motivo = 'la tarjeta de prueba fue rechazada';
  }
  await avisar(bd, o, r, (nombre) => correoIntento(r, nombre, enlacePago(o, r), motivo));
  return null;
}

/** Suspende (día 10) la renovación que hizo sus 4 intentos sin pago. Condicional: una corrida repetida no hace nada. */
async function suspender(bd: PrismaClient, o: OpcionesCobranza, r: FilaRenovacion, ahora: Date): Promise<boolean> {
  const hecho = await bd.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Suscripcion" WHERE "id" = ${r.suscripcionId}::uuid FOR UPDATE`;
    const c = await tx.renovacion.updateMany({ where: { id: r.id, estado: 'PENDIENTE', intentos: DIAS_INTENTOS.length }, data: { estado: 'VENCIDA', proximoIntento: null, suspendidaEn: ahora } });
    if (c.count === 0) return false;
    const s = await tx.suscripcion.updateMany({ where: { id: r.suscripcionId, estado: 'PAGO_PENDIENTE' }, data: { estado: 'SUSPENDIDA' } });
    if (s.count === 0) return false;
    await tx.auditoria.create({
      data: { organizacionId: r.organizacionId, usuarioId: null, accion: 'SUSCRIPCION_SUSPENDIDA', entidad: 'Suscripcion', entidadId: r.suscripcionId, datos: { renovacionId: r.id, total: Number(r.total), moneda: r.moneda } },
    });
    return true;
  });
  if (hecho) await avisar(bd, o, r, (nombre) => correoSuspension(r, nombre, enlacePago(o, r)));
  return hecho;
}

/** El siguiente paso de una renovación pendiente, si ya toca: un intento (cuenta en el calendario) o la suspensión. */
export async function avanzarRenovacion(bd: PrismaClient, o: OpcionesCobranza, renovacionId: string, ahora: Date): Promise<'intento' | 'cobrada' | 'suspendida' | 'esperar' | 'omitido'> {
  const r = await bd.renovacion.findUnique({ where: { id: renovacionId }, include: CON_TODO });
  if (!r || r.estado !== 'PENDIENTE' || r.suscripcion.estado !== 'PAGO_PENDIENTE') return 'omitido';
  const paso = siguientePaso(r.periodoInicio, r.intentos, ahora);
  if (paso.tipo === 'esperar') return 'esperar';
  if (paso.tipo === 'suspender') return (await suspender(bd, o, r, ahora)) ? 'suspendida' : 'omitido';
  // Se reserva el intento antes de cobrar: dos corridas a la vez no cobran ni avisan dos veces.
  const reservado = await bd.renovacion.updateMany({
    where: { id: r.id, estado: 'PENDIENTE', intentos: paso.numero },
    data: { intentos: paso.numero + 1, proximoIntento: fechaDelPaso(r.periodoInicio, paso.numero + 1) },
  });
  if (reservado.count === 0) return 'omitido';
  await bd.auditoria.create({ data: { organizacionId: r.organizacionId, usuarioId: null, accion: 'RENOVACION_INTENTO', entidad: 'Renovacion', entidadId: r.id, datos: { numero: paso.numero, dia: DIAS_INTENTOS[paso.numero]!, pasarela: r.pasarela } } });
  return (await intentar(bd, o, { ...r, intentos: paso.numero + 1 }, paso.numero, ahora)) ? 'cobrada' : 'intento';
}

/** «Reintentar ahora» (superadmin): un intento fuera del calendario. No cambia los intentos ni la fecha del siguiente. */
export async function intentoManual(bd: PrismaClient, o: OpcionesCobranza, renovacionId: string, ahora = new Date()): Promise<'cobrada' | 'avisada' | 'omitido'> {
  const r = await bd.renovacion.findUnique({ where: { id: renovacionId }, include: CON_TODO });
  if (!r || r.estado === 'APROBADA' || (r.suscripcion.estado !== 'PAGO_PENDIENTE' && r.suscripcion.estado !== 'SUSPENDIDA')) return 'omitido';
  return (await intentar(bd, o, r, 'manual', ahora)) ? 'cobrada' : 'avisada';
}

/** La tarea periódica `renovar-suscripciones`. */
export async function renovarSuscripciones(bd: PrismaClient, o: OpcionesCobranza, ahora = new Date()): Promise<ResumenCobranza> {
  const entorno = o.entorno ?? entornoSitio(process.env.SITIO_ENTORNO);
  const resumen: ResumenCobranza = { canceladas: 0, creadas: 0, intentos: 0, cobradas: 0, suspendidas: 0 };
  const alcance = o.organizaciones ? { organizacionId: { in: [...o.organizaciones] } } : {};
  const vencidas = { ...alcance, cancelarAlFin: true, finPeriodo: { lte: ahora } };
  for (const s of await bd.suscripcion.findMany({ where: { ...vencidas, estado: { in: ['ACTIVA', 'PAGO_PENDIENTE', 'SUSPENDIDA'] } }, select: { id: true } })) {
    if ((await procesarVencimiento(bd, { suscripcionId: s.id }, ahora)).estado === 'cancelada') resumen.canceladas += 1;
  }
  for (const s of await bd.suscripcion.findMany({ where: { ...alcance, estado: 'ACTIVA', cancelarAlFin: false, finPeriodo: { lte: ahora } }, select: { id: true }, orderBy: { finPeriodo: 'asc' } })) {
    if (await crearRenovacion(bd, s.id, ahora, o.precio ?? ((slug, ciclo, mon) => precioPublicado(bd, slug, ciclo, mon, entorno)))) resumen.creadas += 1;
  }
  for (const r of await bd.renovacion.findMany({ where: { ...alcance, estado: 'PENDIENTE', proximoIntento: { lte: ahora } }, select: { id: true }, orderBy: { proximoIntento: 'asc' } })) {
    const hecho = await avanzarRenovacion(bd, { ...o, entorno }, r.id, ahora);
    if (hecho === 'intento' || hecho === 'cobrada') resumen.intentos += 1;
    if (hecho === 'cobrada') resumen.cobradas += 1;
    if (hecho === 'suspendida') resumen.suspendidas += 1;
  }
  return resumen;
}
