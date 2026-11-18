// HU-1515 · Ingreso de las pruebas: con la clave basta para los roles de organización; el superadmin además pasa el
// segundo factor (lo configura la primera vez). Devuelve la cookie `sesion=…` lista para `Cookie`.
import { prisma } from '@aptio/db';
import request from 'supertest';
import { CLAVE_TOTP_DESARROLLO } from '../src/auth/config-sesion.js';
import { claveCifrado, codigoDelPaso, descifrar, desdeBase32, pasoDe } from '../src/auth/totp.js';

type Servidor = Parameters<typeof request>[0];

const clave = () => claveCifrado(process.env.TOTP_CLAVE_CIFRADO ?? CLAVE_TOTP_DESARROLLO);

export const cookiesDe = (res: { headers: Record<string, unknown> }) => ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []);
export const cookieLlamada = (res: { headers: Record<string, unknown> }, nombre: string) =>
  cookiesDe(res).find((c) => c.startsWith(`${nombre}=`) && !c.startsWith(`${nombre}=;`))?.split(';')[0];

/** Código válido ahora para un secreto en base32. */
export const codigoActual = (secreto: string, desfasePasos = 0) => codigoDelPaso(desdeBase32(secreto), pasoDe(Date.now()) + desfasePasos);

/** Secreto TOTP activo de un usuario, descifrado (solo pruebas). */
export async function secretoDe(email: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  return descifrar(u.totpSecretoCifrado!, clave());
}

export async function ingresarCookie(servidor: Servidor, email: string, claveIngreso: string): Promise<string> {
  const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email, clave: claveIngreso });
  if (res.status !== 200) throw new Error(`No pudo ingresar ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const sesion = cookieLlamada(res, 'sesion');
  if (sesion) return sesion;
  const desafio = cookieLlamada(res, 'segundo_factor');
  if (!desafio) throw new Error(`Sin sesión ni desafío para ${email}`);

  let final;
  if (res.body.segundoFactor === 'configurar') {
    const c = await request(servidor).post('/api/v1/auth/segundo-factor/configurar').set('Cookie', desafio);
    final = await request(servidor).post('/api/v1/auth/segundo-factor/confirmar').set('Cookie', desafio).send({ codigo: codigoActual(c.body.secreto) });
  } else {
    // Varios ingresos en el mismo paso de 30 s: las pruebas liberan el paso para no chocar con la protección de repetición.
    await prisma.usuario.update({ where: { email }, data: { totpUltimoPaso: null } });
    final = await request(servidor).post('/api/v1/auth/segundo-factor').set('Cookie', desafio).send({ codigo: codigoActual(await secretoDe(email)) });
  }
  const cookie = cookieLlamada(final, 'sesion');
  if (final.status !== 200 || !cookie) throw new Error(`Segundo factor de ${email}: ${final.status} ${JSON.stringify(final.body)}`);
  return cookie;
}
