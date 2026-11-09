// Datos de ejemplo (HU-0103, CP-003): organización AulasEducativas, cliente Minera Andina
// con su kit, un usuario por rol, el superadmin de plataforma y el proyecto LOTO.
// Se puede ejecutar varias veces: borra y vuelve a crear solo estos datos.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Rol } from '@prisma/client';
import { hashearClave } from '../src/clave.js';

const prisma = new PrismaClient();
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const caso = (archivo: string) =>
  JSON.parse(readFileSync(join(repo, 'packages/ai/casos/loto/entrada', archivo), 'utf8'));

// Clave de desarrollo para todos los usuarios de ejemplo. No es un secreto real:
// en la nube los usuarios se crean por invitación (HU-0109).
const CLAVE = process.env.SEED_CLAVE ?? 'Aptio-local-2026';
const SLUG_ORG = 'aulas-educativas';
const CORREO_SUPERADMIN = 'superadmin@aptio.test';

async function main() {
  const kitCaso = caso('kit.json');
  const proyectoCaso = caso('proyecto.json');

  // 1. Limpieza de los datos de ejemplo (la organización arrastra todo lo suyo en cascada)
  await prisma.organizacion.deleteMany({ where: { slug: SLUG_ORG } });
  await prisma.usuario.deleteMany({ where: { email: CORREO_SUPERADMIN } });

  const hashClave = await hashearClave(CLAVE);

  // 2. Organización inicial (ADR-012: los datos actuales pasan a AulasEducativas)
  const org = await prisma.organizacion.create({
    data: { nombre: 'AulasEducativas', slug: SLUG_ORG },
  });

  // 3. Superadmin de plataforma, sin organización (ADR-011)
  await prisma.usuario.create({
    data: {
      nombre: 'Superadmin Plataforma',
      email: CORREO_SUPERADMIN,
      hashClave,
      emailVerificado: true,
      rol: Rol.SUPERADMIN,
    },
  });

  // 4. Cliente Minera Andina con su kit (caso de referencia LOTO)
  const cliente = await prisma.cliente.create({
    data: {
      organizacionId: org.id,
      nombre: 'Minera Andina',
      lmsHabitual: 'Moodle 4.5',
      idiomas: proyectoCaso.idiomas,
      notas: 'Cliente ficticio del caso de referencia LOTO',
      kit: {
        create: {
          estilo: 'Industrial',
          paleta: kitCaso.paleta,
          tipografias: kitCaso.tipografias,
          personaje: { nombre: kitCaso.personaje.nombre, poses: kitCaso.personaje.poses },
          // La voz concreta se elige al configurar el kit (HU-0202); Google TTS por defecto (ADR-008).
          voces: {
            es: { proveedor: 'google', voz: null, velocidad: 1 },
            en: { proveedor: 'google', voz: null, velocidad: 1 },
          },
        },
      },
    },
  });

  // 5. Un usuario por rol de la organización
  const usuarios: { nombre: string; email: string; rol: Rol; clienteId?: string }[] = [
    { nombre: 'Administración AulasEducativas', email: 'admin@aulaseducativas.test', rol: Rol.ADMINISTRADOR },
    { nombre: 'Diseño instruccional', email: 'instruccional@aulaseducativas.test', rol: Rol.DISENADOR_INSTRUCCIONAL },
    { nombre: 'Diseño gráfico', email: 'grafico@aulaseducativas.test', rol: Rol.DISENADOR_GRAFICO },
    { nombre: 'Producción', email: 'productor@aulaseducativas.test', rol: Rol.PRODUCTOR },
    { nombre: 'Revisión Minera Andina', email: 'revisor@mineraandina.test', rol: Rol.REVISOR_CLIENTE, clienteId: cliente.id },
  ];
  for (const u of usuarios) {
    await prisma.usuario.create({
      data: { ...u, organizacionId: org.id, hashClave, emailVerificado: true },
    });
  }
  const instruccional = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'instruccional@aulaseducativas.test' },
  });

  // 6. Proyecto LOTO
  const proyecto = await prisma.proyecto.create({
    data: {
      organizacionId: org.id,
      clienteId: cliente.id,
      creadoPorId: instruccional.id,
      nombre: proyectoCaso.titulo,
      idiomas: proyectoCaso.idiomas,
      modoIdioma: proyectoCaso.modoIdioma,
      publico: proyectoCaso.publico,
      tono: proyectoCaso.tono,
      pantallasObjetivo: proyectoCaso.pantallasMeta,
    },
  });

  console.log(`Organización: ${org.nombre}`);
  console.log(`Cliente: ${cliente.nombre} (con kit)`);
  console.log(`Usuarios: ${usuarios.length} de la organización + superadmin · clave de desarrollo: ${CLAVE}`);
  console.log(`Proyecto: ${proyecto.nombre}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
