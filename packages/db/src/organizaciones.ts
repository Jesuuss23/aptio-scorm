/**
 * HU-1701 · Organizaciones (ADR-012, REQ-081, CP-139, CP-140).
 *
 * - `TABLAS_ORGANIZACION`: las tablas raíz con `organizacionId` (las hijas heredan el aislamiento por su padre).
 * - `verificarOrganizaciones`: filas por organización y reglas de integridad (huérfanas y cruces entre organizaciones).
 * - `organizacionDeIds`: a qué organización pertenece cada id (raíces e hijas), para auditar el acceso cruzado.
 *
 * Todo es SQL de solo lectura con nombres fijos de tablas y columnas (ninguno viene de la petición).
 */
import type { PrismaClient } from '@prisma/client';

export const SLUG_ORGANIZACION_BASE = 'aulas-educativas';
export const NOMBRE_ORGANIZACION_BASE = 'AulasEducativas';

/** Tablas raíz con `organizacionId`. `opcional`: puede ser null por diseño (plataforma). */
export const TABLAS_ORGANIZACION = [
  { tabla: 'Usuario', opcional: true },
  { tabla: 'Cliente', opcional: false },
  { tabla: 'Proyecto', opcional: false },
  { tabla: 'Curso', opcional: false },
  { tabla: 'Generacion', opcional: false },
  { tabla: 'TrabajoIA', opcional: true },
  { tabla: 'Recurso', opcional: false },
  { tabla: 'Subida', opcional: false },
  { tabla: 'Exportacion', opcional: false },
  { tabla: 'ConfigProveedor', opcional: true },
  { tabla: 'ParametrosNegocio', opcional: true },
  { tabla: 'MedicionProceso', opcional: false },
  { tabla: 'Auditoria', opcional: true },
  // HU-1703 · La suscripción de cada organización y el checkout (sin organización mientras no se paga).
  { tabla: 'Suscripcion', opcional: false },
  { tabla: 'SolicitudSuscripcion', opcional: true },
  // HU-1705 · Consumos de cápsulas (uno por proyecto) y compras de adicionales.
  { tabla: 'ConsumoCapsula', opcional: false },
  { tabla: 'CompraCapsulas', opcional: false },
  // HU-1706 · Subidas de plan prorrateadas.
  { tabla: 'CambioPlan', opcional: false },
  // HU-1707 · Comprobantes SUNAT (sin organización si el cobro no dio de alta una cuenta).
  { tabla: 'Comprobante', opcional: true },
  // HU-1708 · Renovaciones de cada período.
  { tabla: 'Renovacion', opcional: false },
  // HU-1711 · Datos de facturación del portal (uno por organización).
  { tabla: 'DatosFacturacionOrg', opcional: false },
] as const;
export type TablaOrganizacion = (typeof TABLAS_ORGANIZACION)[number]['tabla'];

/**
 * Reglas de integridad: cada una cuenta las filas que la incumplen (0 = íntegro).
 * Las huérfanas apuntan a una organización que no existe; los cruces son un hijo en otra organización que su padre.
 */
const REGLAS: { regla: string; sql: string }[] = [
  ...TABLAS_ORGANIZACION.map(({ tabla }) => ({
    regla: `${tabla}: organización inexistente`,
    sql: `SELECT count(*) FROM "${tabla}" t WHERE t."organizacionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Organizacion" o WHERE o."id" = t."organizacionId")`,
  })),
  { regla: 'Usuario: sin organización y no es superadmin', sql: `SELECT count(*) FROM "Usuario" WHERE "organizacionId" IS NULL AND "rol" <> 'SUPERADMIN'` },
  { regla: 'Usuario: superadmin dentro de una organización', sql: `SELECT count(*) FROM "Usuario" WHERE "organizacionId" IS NOT NULL AND "rol" = 'SUPERADMIN'` },
  { regla: 'Usuario: revisor de un cliente de otra organización', sql: `SELECT count(*) FROM "Usuario" u JOIN "Cliente" c ON c."id" = u."clienteId" WHERE u."organizacionId" IS DISTINCT FROM c."organizacionId"` },
  { regla: 'Proyecto: cliente de otra organización', sql: `SELECT count(*) FROM "Proyecto" p JOIN "Cliente" c ON c."id" = p."clienteId" WHERE p."organizacionId" <> c."organizacionId"` },
  { regla: 'Curso: proyecto de otra organización', sql: `SELECT count(*) FROM "Curso" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" <> p."organizacionId"` },
  { regla: 'Generacion: proyecto de otra organización', sql: `SELECT count(*) FROM "Generacion" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" <> p."organizacionId"` },
  { regla: 'Exportacion: curso de otra organización', sql: `SELECT count(*) FROM "Exportacion" x JOIN "Curso" c ON c."id" = x."cursoId" WHERE x."organizacionId" <> c."organizacionId"` },
  { regla: 'Recurso: cliente de otra organización', sql: `SELECT count(*) FROM "Recurso" x JOIN "Cliente" c ON c."id" = x."clienteId" WHERE x."organizacionId" <> c."organizacionId"` },
  { regla: 'Recurso: proyecto de otra organización', sql: `SELECT count(*) FROM "Recurso" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" <> p."organizacionId"` },
  { regla: 'TrabajoIA: proyecto de otra organización', sql: `SELECT count(*) FROM "TrabajoIA" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" IS DISTINCT FROM p."organizacionId"` },
  { regla: 'MedicionProceso: proyecto de otra organización', sql: `SELECT count(*) FROM "MedicionProceso" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" <> p."organizacionId"` },
  { regla: 'ConsumoCapsula: proyecto de otra organización', sql: `SELECT count(*) FROM "ConsumoCapsula" x JOIN "Proyecto" p ON p."id" = x."proyectoId" WHERE x."organizacionId" <> p."organizacionId"` },
  { regla: 'ConsumoCapsula: suscripción de otra organización', sql: `SELECT count(*) FROM "ConsumoCapsula" x JOIN "Suscripcion" s ON s."id" = x."suscripcionId" WHERE x."organizacionId" <> s."organizacionId"` },
  { regla: 'CompraCapsulas: suscripción de otra organización', sql: `SELECT count(*) FROM "CompraCapsulas" x JOIN "Suscripcion" s ON s."id" = x."suscripcionId" WHERE x."organizacionId" <> s."organizacionId"` },
  { regla: 'CambioPlan: suscripción de otra organización', sql: `SELECT count(*) FROM "CambioPlan" x JOIN "Suscripcion" s ON s."id" = x."suscripcionId" WHERE x."organizacionId" <> s."organizacionId"` },
  { regla: 'Renovacion: suscripción de otra organización', sql: `SELECT count(*) FROM "Renovacion" x JOIN "Suscripcion" s ON s."id" = x."suscripcionId" WHERE x."organizacionId" <> s."organizacionId"` },
  { regla: 'Comprobante: cobro de otra organización', sql: `SELECT count(*) FROM "Comprobante" x JOIN "Cobro" c ON c."id" = x."cobroId" JOIN "Suscripcion" s ON s."id" = c."suscripcionId" WHERE x."organizacionId" <> s."organizacionId"` },
];

export interface ConteoOrganizacion { organizacionId: string | null; slug: string | null; tabla: TablaOrganizacion; filas: number }
export interface Inconsistencia { regla: string; filas: number }
export interface VerificacionOrganizaciones { conteos: ConteoOrganizacion[]; inconsistencias: Inconsistencia[]; integra: boolean }

/** Filas de cada tabla raíz por organización (null = plataforma) y las reglas que no se cumplen. */
export async function verificarOrganizaciones(bd: PrismaClient): Promise<VerificacionOrganizaciones> {
  const conteos: ConteoOrganizacion[] = [];
  for (const { tabla } of TABLAS_ORGANIZACION) {
    const filas = await bd.$queryRawUnsafe<{ organizacionId: string | null; slug: string | null; filas: bigint }[]>(
      `SELECT t."organizacionId"::text AS "organizacionId", o."slug", count(*) AS filas FROM "${tabla}" t LEFT JOIN "Organizacion" o ON o."id" = t."organizacionId" GROUP BY 1, 2 ORDER BY 2 NULLS FIRST`,
    );
    for (const f of filas) conteos.push({ organizacionId: f.organizacionId, slug: f.slug, tabla, filas: Number(f.filas) });
  }
  const inconsistencias: Inconsistencia[] = [];
  for (const { regla, sql } of REGLAS) {
    const [fila] = await bd.$queryRawUnsafe<{ count: bigint }[]>(sql);
    const filas = Number(fila?.count ?? 0);
    if (filas > 0) inconsistencias.push({ regla, filas });
  }
  return { conteos, inconsistencias, integra: inconsistencias.length === 0 };
}

/**
 * Tablas en las que se busca un id para saber su organización: las raíces y las hijas que llegan por ruta, unidas a
 * su padre. Cada fila es `SELECT id, organizacionId` de esa tabla.
 */
const ORIGENES_ID: { entidad: string; sql: string }[] = [
  ...(['Cliente', 'Proyecto', 'Curso', 'Generacion', 'Recurso', 'Subida', 'Exportacion', 'MedicionProceso', 'Usuario', 'TrabajoIA'] as const).map((t) => ({
    entidad: t, sql: `SELECT "id", "organizacionId" FROM "${t}"`,
  })),
  { entidad: 'KitMarca', sql: `SELECT k."id", c."organizacionId" FROM "KitMarca" k JOIN "Cliente" c ON c."id" = k."clienteId"` },
  ...(['GlosarioTermino', 'PronunciacionTermino', 'FichaCompatibilidad'] as const).map((t) => ({
    entidad: t, sql: `SELECT x."id", c."organizacionId" FROM "${t}" x JOIN "Cliente" c ON c."id" = x."clienteId"`,
  })),
  { entidad: 'PantallaModelo', sql: `SELECT x."id", c."organizacionId" FROM "PantallaModelo" x JOIN "KitMarca" k ON k."id" = x."kitId" JOIN "Cliente" c ON c."id" = k."clienteId"` },
  { entidad: 'MaterialFuente', sql: `SELECT x."id", p."organizacionId" FROM "MaterialFuente" x JOIN "Proyecto" p ON p."id" = x."proyectoId"` },
  ...(['CursoVersion', 'Propuesta', 'Observacion', 'Narracion', 'Traduccion', 'Comentario'] as const).map((t) => ({
    entidad: t, sql: `SELECT x."id", c."organizacionId" FROM "${t}" x JOIN "Curso" c ON c."id" = x."cursoId"`,
  })),
];

export interface IdConOrganizacion { id: string; entidad: string; organizacionId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** La entidad y la organización de cada id que exista en una tabla de organización (los que no son UUID se ignoran). */
export async function organizacionDeIds(bd: PrismaClient, ids: readonly string[]): Promise<IdConOrganizacion[]> {
  const validos = [...new Set(ids.filter(esUuid).map((i) => i.toLowerCase()))];
  if (validos.length === 0) return [];
  const union = ORIGENES_ID.map((o) => `SELECT q."id"::text AS id, '${o.entidad}' AS entidad, q."organizacionId"::text AS "organizacionId" FROM (${o.sql}) q WHERE q."id" = ANY($1::uuid[]) AND q."organizacionId" IS NOT NULL`).join(' UNION ALL ');
  return bd.$queryRawUnsafe<IdConOrganizacion[]>(union, validos);
}

