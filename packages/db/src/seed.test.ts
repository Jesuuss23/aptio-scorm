// CP-003 · Migración inicial: tras `pnpm db:migrate && pnpm db:seed` existen el cliente
// Minera Andina con su kit, los usuarios de prueba y el proyecto LOTO.
// Necesita una base migrada y con los datos de ejemplo; sin DATABASE_URL se omite.
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, Rol } from '@prisma/client';
import { verificarClave } from './clave.js';

const conBase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!conBase)('CP-003 · datos de ejemplo', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('crea Minera Andina con su kit dentro de AulasEducativas', async () => {
    const cliente = await prisma.cliente.findFirstOrThrow({
      where: { nombre: 'Minera Andina' },
      include: { kit: true, organizacion: true },
    });
    expect(cliente.organizacion.slug).toBe('aulas-educativas');
    expect(cliente.kit?.paleta).toMatchObject({ primario: '#0F2A44' });
  });

  it('crea un usuario por cada rol de la organización y el superadmin sin organización', async () => {
    const usuarios = await prisma.usuario.findMany();
    const roles = new Set(usuarios.filter((u) => u.organizacionId).map((u) => u.rol));
    expect(roles).toEqual(
      new Set([Rol.ADMINISTRADOR, Rol.DISENADOR_INSTRUCCIONAL, Rol.DISENADOR_GRAFICO, Rol.PRODUCTOR, Rol.REVISOR_CLIENTE]),
    );
    const superadmin = usuarios.find((u) => u.rol === Rol.SUPERADMIN);
    expect(superadmin?.organizacionId).toBeNull();
  });

  it('guarda las claves con argon2id, nunca en texto plano', async () => {
      const usuarios = await prisma.usuario.findMany({
        where: { hashClave: { not: null } },
      });
      expect(usuarios.length).toBeGreaterThan(0);

      for (const u of usuarios) {
        expect(u.hashClave!.startsWith('$argon2id$')).toBe(true);
      }

      // El administrador del seed por su correo: las pruebas e2e de la API corren a la vez (`pnpm -r test`) y crean
      // otros administradores con su propia clave.
      const admin = usuarios.find((u) => u.email === 'admin@aulaseducativas.test')!;
      expect(await verificarClave(admin.hashClave!, process.env.SEED_CLAVE!)).toBe(true);
    });

  it('vincula al revisor con su cliente', async () => {
    const revisor = await prisma.usuario.findFirstOrThrow({ where: { rol: Rol.REVISOR_CLIENTE }, include: { cliente: true } });
    expect(revisor.cliente?.nombre).toBe('Minera Andina');
  });

  it('crea el proyecto LOTO en la misma organización que su cliente', async () => {
    const proyecto = await prisma.proyecto.findFirstOrThrow({
      where: { nombre: 'Bloqueo y etiquetado' },
      include: { cliente: true },
    });
    expect(proyecto.organizacionId).toBe(proyecto.cliente.organizacionId);
    expect(proyecto.idiomas).toEqual(['es', 'en']);
  });
});
