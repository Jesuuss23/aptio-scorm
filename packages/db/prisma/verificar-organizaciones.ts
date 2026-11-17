// HU-1701 · `pnpm --filter @aptio/db verificar-organizaciones` (CP-140): filas de cada tabla raíz por organización y
// reglas de integridad (huérfanas y cruces entre organizaciones). Sale con 0 si todo está íntegro y con 1 si no.
import { PrismaClient } from '@prisma/client';
import { verificarOrganizaciones } from '../src/organizaciones.js';

const bd = new PrismaClient();
try {
  const { conteos, inconsistencias, integra } = await verificarOrganizaciones(bd);
  console.log('Filas por organización (— = plataforma):');
  console.table(conteos.map((c) => ({ tabla: c.tabla, organizacion: c.slug ?? (c.organizacionId ? `${c.organizacionId} (no existe)` : '—'), filas: c.filas })));
  if (integra) console.log('Íntegro: 0 filas huérfanas y 0 cruces entre organizaciones.');
  else {
    console.error('Inconsistencias:');
    for (const i of inconsistencias) console.error(`- ${i.regla}: ${i.filas}`);
  }
  process.exitCode = integra ? 0 : 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 2;
} finally {
  await bd.$disconnect();
}
