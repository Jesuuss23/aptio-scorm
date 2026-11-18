// HU-1515 · Restablecer el segundo factor desde la consola (CP-161, recuperación sin teléfono ni códigos).
// Contra la base de desarrollo; sin DATABASE_URL se omite. Crea sus usuarios y los borra al terminar.
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { restablecerSegundoFactor } from './segundo-factor.js';

const ejecutar = promisify(execFile);
const PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..');
const conBase = Boolean(process.env.DATABASE_URL);
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (n: string) => `${n}-${sufijo}@segundo-factor.test`;

describe.skipIf(!conBase)('restablecer el segundo factor del superadmin', () => {
  const bd = new PrismaClient();

  afterAll(async () => {
    const ids = (await bd.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@segundo-factor.test` } } })).map((u) => u.id);
    await bd.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
    await bd.usuario.deleteMany({ where: { id: { in: ids } } });
    await bd.$disconnect();
  });

  const superConFactor = (n: string) =>
    bd.usuario.create({
      data: {
        nombre: 'Super', email: correo(n), rol: 'SUPERADMIN', totpSecretoCifrado: 'v1.a.b.c', totpActivoDesde: new Date(), totpUltimoPaso: 123,
        codigosRecuperacion: { create: [{ hash: `h1-${n}-${sufijo}` }, { hash: `h2-${n}-${sufijo}`, usadoEn: new Date() }] },
      },
    });

  it('borra el secreto y los códigos, cierra las sesiones y lo audita', async () => {
    const u = await superConFactor('super');
    expect(await restablecerSegundoFactor(bd, ` ${correo('super').toUpperCase()} `, 'perdió el teléfono')).toBe('restablecido');
    const despues = await bd.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(despues).toMatchObject({ totpSecretoCifrado: null, totpPendienteCifrado: null, totpActivoDesde: null, totpUltimoPaso: null, versionSesion: u.versionSesion + 1 });
    expect(await bd.codigoRecuperacion.count({ where: { usuarioId: u.id } })).toBe(0);
    const a = await bd.auditoria.findFirstOrThrow({ where: { usuarioId: u.id, accion: 'SEGUNDO_FACTOR_RESTABLECIDO' } });
    expect(a.datos).toEqual({ motivo: 'perdió el teléfono', via: 'consola' });
  });

  it('no toca a quien no es superadmin ni inventa usuarios', async () => {
    await bd.usuario.create({ data: { nombre: 'Admin', email: correo('admin'), rol: 'ADMINISTRADOR' } });
    expect(await restablecerSegundoFactor(bd, correo('admin'), 'x')).toBe('no_es_superadmin');
    expect(await restablecerSegundoFactor(bd, correo('nadie'), 'x')).toBe('no_existe');
  });

  it('el comando de consola pide correo y motivo, y sale con 0 o 1', async () => {
    await superConFactor('consola');
    const tsx = join(PAQUETE, 'node_modules', '.bin', 'tsx');
    const script = join(PAQUETE, 'prisma', 'restablecer-segundo-factor.ts');
    const ok = await ejecutar(tsx, [script, '--', correo('consola'), 'cambio', 'de', 'teléfono'], { cwd: PAQUETE });
    expect(ok.stdout).toContain('configurará su aplicación autenticadora');
    await expect(ejecutar(tsx, [script, correo('nadie'), 'motivo'], { cwd: PAQUETE })).rejects.toMatchObject({ code: 1 });
    await expect(ejecutar(tsx, [script, correo('consola')], { cwd: PAQUETE })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Uso:') });
    const a = await bd.auditoria.findFirstOrThrow({ where: { usuario: { email: correo('consola') }, accion: 'SEGUNDO_FACTOR_RESTABLECIDO' } });
    expect(a.datos).toMatchObject({ motivo: 'cambio de teléfono' });
  });
});
