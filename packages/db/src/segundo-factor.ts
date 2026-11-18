// HU-1515 · Restablecer el segundo factor de un superadmin que perdió su teléfono y sus códigos de recuperación.
// Solo desde la consola (no hay recuperación por correo): borra el secreto y los códigos, cierra sus sesiones y deja
// constancia en la auditoría. En el siguiente ingreso vuelve a configurar la aplicación.
import type { PrismaClient } from '@prisma/client';

export type ResultadoRestablecimiento = 'restablecido' | 'no_existe' | 'no_es_superadmin';

export async function restablecerSegundoFactor(bd: PrismaClient, emailBruto: string, motivo: string): Promise<ResultadoRestablecimiento> {
  const email = emailBruto.trim().toLowerCase();
  const u = await bd.usuario.findUnique({ where: { email } });
  if (!u) return 'no_existe';
  if (u.rol !== 'SUPERADMIN') return 'no_es_superadmin';
  await bd.$transaction([
    bd.codigoRecuperacion.deleteMany({ where: { usuarioId: u.id } }),
    bd.usuario.update({
      where: { id: u.id },
      data: { totpSecretoCifrado: null, totpPendienteCifrado: null, totpActivoDesde: null, totpUltimoPaso: null, versionSesion: { increment: 1 } },
    }),
    bd.auditoria.create({
      data: { usuarioId: u.id, organizacionId: null, accion: 'SEGUNDO_FACTOR_RESTABLECIDO', entidad: 'Usuario', entidadId: u.id, datos: { motivo, via: 'consola' } },
    }),
  ]);
  return 'restablecido';
}
