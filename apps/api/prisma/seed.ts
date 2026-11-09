import { PrismaClient, Rol } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Inicializando datos multi-tenant...');

  // 1. Limpieza
  await prisma.proyecto.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.organizacion.deleteMany();

  // 2. Organización inicial (CP-140)
  const org = await prisma.organizacion.create({
    data: {
      nombre: 'AulasEducativas',
      slug: 'aulas-educativas',
      ruc: '20123456789',
    },
  });
  console.log(`✅ Organización creada: ${org.nombre}`);

  // 3. Usuario Superadmin global (HU-1501) y usuarios de la Organización
  await prisma.usuario.create({
    data: {
      nombre: 'Superadmin Plataforma',
      email: 'superadmin@aptio.com',
      password: 'password123',
      rol: Rol.SUPERADMIN,
    },
  });

  const usuariosOrg = [
    { nombre: 'Admin AulasEducativas', email: 'admin@aulas.com', rol: Rol.ADMINISTRADOR },
    { nombre: 'Diseñador Instruccional', email: 'instruccional@aulas.com', rol: Rol.DISENADOR_INSTRUCCIONAL },
    { nombre: 'Productor Multimedia', email: 'productor@aulas.com', rol: Rol.PRODUCTOR },
    { nombre: 'Revisor Externo', email: 'revisor@aulas.com', rol: Rol.REVISOR },
  ];

  for (const u of usuariosOrg) {
    await prisma.usuario.create({
      data: {
        ...u,
        password: 'password123',
        organizacionId: org.id,
      },
    });
  }
  console.log('✅ Usuarios creados y vinculados a la organización.');

  // 4. Cliente Minera Andina dentro de la Organización
  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Minera Andina',
      lmsHabitual: 'Moodle 4.5',
      idiomas: ['ES', 'EN'],
      organizacionId: org.id,
    },
  });
  console.log(`✅ Cliente creado: ${cliente.nombre}`);

  // 5. Proyecto LOTO
  const proyecto = await prisma.proyecto.create({
    data: {
      nombre: 'Procedimiento LOTO - Bloqueo de Energías Peligrosas',
      clienteId: cliente.id,
      organizacionId: org.id,
    },
  });
  console.log(`✅ Proyecto creado: ${proyecto.nombre}`);
  console.log('🚀 Base de datos Multi-tenant lista.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });