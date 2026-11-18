// HU-1515 · `pnpm --filter @aptio/db restablecer-segundo-factor -- <correo> "<motivo>"`: borra el segundo factor de un
// superadmin (secreto y códigos de recuperación) y cierra sus sesiones. Sale con 0 si lo hizo y con 1 si no.
import { PrismaClient } from '@prisma/client';
import { restablecerSegundoFactor } from '../src/segundo-factor.js';

const [email, ...resto] = process.argv.slice(2).filter((a) => a !== '--');
const motivo = resto.join(' ').trim();
if (!email || !motivo) {
  console.error('Uso: pnpm --filter @aptio/db restablecer-segundo-factor -- <correo> "<motivo>"');
  process.exit(1);
}

const bd = new PrismaClient();
try {
  const r = await restablecerSegundoFactor(bd, email, motivo);
  const mensajes = {
    restablecido: `Listo: ${email} configurará su aplicación autenticadora en el siguiente ingreso. Sus sesiones se cerraron.`,
    no_existe: `No hay ningún usuario con el correo ${email}.`,
    no_es_superadmin: `${email} no es superadmin: el segundo factor es solo del superadmin.`,
  } as const;
  (r === 'restablecido' ? console.log : console.error)(mensajes[r]);
  process.exitCode = r === 'restablecido' ? 0 : 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 2;
} finally {
  await bd.$disconnect();
}
