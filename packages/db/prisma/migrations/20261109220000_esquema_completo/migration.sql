-- HU-0103 · Esquema completo de docs/12-modelo-datos.md con multi-organización (ADR-012).
--
-- La migración inicial (init_multitenant) usaba ids TEXT y una columna `password` en texto plano.
-- Este cambio pasa los ids a UUID y la clave a `hashClave` (argon2id), lo que obliga a recrear
-- esas columnas. Antes de producción solo existen los datos de ejemplo, así que se vacían las
-- 4 tablas iniciales y se vuelven a cargar con `pnpm db:seed`.
TRUNCATE TABLE "Proyecto", "Cliente", "Usuario", "Organizacion";

-- CreateEnum
CREATE TYPE "EstadoOrganizacion" AS ENUM ('ACTIVA', 'SOLO_LECTURA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('BORRADOR', 'GENERANDO', 'REVISION', 'ENTREGADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('PDF', 'WORD', 'POWERPOINT', 'VIDEO', 'AUDIO', 'IMAGEN', 'TEMA');

-- CreateEnum
CREATE TYPE "EstadoTrabajo" AS ENUM ('EN_COLA', 'EN_CURSO', 'COMPLETADO', 'ERROR', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EtapaGeneracion" AS ENUM ('RESUMEN_MATERIAL', 'OBJETIVOS_ESTRUCTURA', 'STORYBOARD_GUION', 'PANTALLAS', 'ILUSTRACIONES', 'VOZ_ES', 'BOCA', 'SUBTITULOS', 'VERSION_EN', 'CONTROL_CALIDAD', 'PAQUETE');

-- CreateEnum
CREATE TYPE "TareaProveedor" AS ENUM ('TEXTO', 'PANTALLAS', 'IMAGEN', 'VOZ', 'BOCA', 'TRADUCCION', 'TRANSCRIPCION', 'CALIDAD');

-- CreateEnum
CREATE TYPE "EstadoPropuesta" AS ENUM ('PENDIENTE', 'APLICADA', 'DESCARTADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoObservacion" AS ENUM ('CALIDAD', 'ALINEACION', 'IDIOMA', 'ACCESIBILIDAD', 'MATERIAL_FALTANTE');

-- CreateEnum
CREATE TYPE "TipoRecurso" AS ENUM ('IMAGEN', 'SVG', 'AUDIO', 'VIDEO', 'DOCUMENTO', 'FUENTE', 'SUBTITULO', 'PAQUETE');

-- CreateEnum
CREATE TYPE "OrigenRecurso" AS ENUM ('BIBLIOTECA', 'GENERADO', 'SUBIDO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "EstadoNarracion" AS ENUM ('ACTUALIZADA', 'DESACTUALIZADA', 'GENERANDO', 'ERROR');

-- CreateEnum
CREATE TYPE "EstadoTraduccion" AS ENUM ('PENDIENTE', 'TRADUCIDA_IA', 'REVISADA', 'DESBORDE');

-- CreateEnum
CREATE TYPE "FormatoExportacion" AS ENUM ('SCORM12', 'SCORM2004', 'CMI5', 'HTML', 'JSON', 'KIT_GAMIFICACION');

-- AlterEnum
BEGIN;
CREATE TYPE "Rol_new" AS ENUM ('SUPERADMIN', 'ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO', 'PRODUCTOR', 'REVISOR_CLIENTE');
ALTER TABLE "public"."Usuario" ALTER COLUMN "rol" DROP DEFAULT;
ALTER TABLE "Usuario" ALTER COLUMN "rol" TYPE "Rol_new" USING ("rol"::text::"Rol_new");
ALTER TYPE "Rol" RENAME TO "Rol_old";
ALTER TYPE "Rol_new" RENAME TO "Rol";
DROP TYPE "public"."Rol_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Proyecto" DROP CONSTRAINT "Proyecto_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Proyecto" DROP CONSTRAINT "Proyecto_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Usuario" DROP CONSTRAINT "Usuario_organizacionId_fkey";

-- AlterTable
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_pkey",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "retencionDocumentosDias" INTEGER NOT NULL DEFAULT 180,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "idiomas" SET DEFAULT ARRAY['es']::TEXT[],
DROP COLUMN "organizacionId",
ADD COLUMN     "organizacionId" UUID NOT NULL,
ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Organizacion" DROP CONSTRAINT "Organizacion_pkey",
DROP COLUMN "activo",
ADD COLUMN     "estado" "EstadoOrganizacion" NOT NULL DEFAULT 'ACTIVA',
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Organizacion_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Proyecto" DROP CONSTRAINT "Proyecto_pkey",
ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creadoPorId" UUID NOT NULL,
ADD COLUMN     "datosTecnicos" JSONB,
ADD COLUMN     "estado" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "idiomas" TEXT[] DEFAULT ARRAY['es']::TEXT[],
ADD COLUMN     "modoIdioma" TEXT NOT NULL DEFAULT 'unico',
ADD COLUMN     "pantallasObjetivo" INTEGER,
ADD COLUMN     "porcentajeActividades" INTEGER,
ADD COLUMN     "publico" TEXT,
ADD COLUMN     "tono" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "organizacionId",
ADD COLUMN     "organizacionId" UUID NOT NULL,
DROP COLUMN "clienteId",
ADD COLUMN     "clienteId" UUID NOT NULL,
ADD CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Usuario" DROP CONSTRAINT "Usuario_pkey",
DROP COLUMN "actualizadoEn",
DROP COLUMN "intentos",
DROP COLUMN "password",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "clienteId" UUID,
ADD COLUMN     "emailVerificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "hashClave" TEXT,
ADD COLUMN     "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoIngreso" TIMESTAMP(3),
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "rol" DROP DEFAULT,
DROP COLUMN "organizacionId",
ADD COLUMN     "organizacionId" UUID,
ADD CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "KitMarca" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "estilo" TEXT NOT NULL,
    "paleta" JSONB NOT NULL,
    "tipografias" JSONB NOT NULL,
    "logoRecursoId" UUID,
    "personaje" JSONB,
    "voces" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantallaModelo" (
    "id" UUID NOT NULL,
    "kitId" UUID NOT NULL,
    "disposicion" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "definicion" JSONB NOT NULL,
    "miniaturaRecursoId" UUID,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PantallaModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlosarioTermino" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "termino" TEXT NOT NULL,
    "traduccion" TEXT,
    "noTraducir" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GlosarioTermino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PronunciacionTermino" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "idioma" TEXT NOT NULL,
    "escrito" TEXT NOT NULL,
    "pronunciado" TEXT NOT NULL,

    CONSTRAINT "PronunciacionTermino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaCompatibilidad" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "lmsNombre" TEXT NOT NULL,
    "lmsVersion" TEXT,
    "limiteSubidaMb" INTEGER,
    "notas" TEXT,
    "resultadoDiagnostico" JSONB,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaCompatibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFuente" (
    "id" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "tipo" "TipoMaterial" NOT NULL,
    "recursoId" UUID,
    "tema" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "paginas" JSONB,
    "transcripcion" JSONB,
    "mapaTemas" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialFuente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "versionEsquema" TEXT NOT NULL,
    "documento" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "actualizadoPorId" UUID,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CursoVersion" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "documento" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "creadoPorId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CursoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generacion" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'EN_COLA',
    "parametros" JSONB NOT NULL,
    "costoUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "iniciadoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEn" TIMESTAMP(3),

    CONSTRAINT "Generacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneracionEtapa" (
    "id" UUID NOT NULL,
    "generacionId" UUID NOT NULL,
    "etapa" "EtapaGeneracion" NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'EN_COLA',
    "detalle" JSONB,
    "inicio" TIMESTAMP(3),
    "fin" TIMESTAMP(3),
    "costoUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "GeneracionEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrabajoIA" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "proyectoId" UUID,
    "generacionId" UUID,
    "tarea" TEXT NOT NULL,
    "tipo" "TareaProveedor" NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "versionPrompt" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSalida" INTEGER,
    "caracteres" INTEGER,
    "imagenes" INTEGER,
    "segundosAudio" INTEGER,
    "costoUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'EN_COLA',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "duracionMs" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrabajoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Propuesta" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "pantallaId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cambios" JSONB NOT NULL,
    "versionBase" INTEGER NOT NULL,
    "estado" "EstadoPropuesta" NOT NULL DEFAULT 'PENDIENTE',
    "trabajoIAId" UUID,
    "resueltoPorId" UUID,
    "resueltoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Propuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observacion" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "pantallaId" TEXT,
    "tipo" "TipoObservacion" NOT NULL,
    "severidad" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recurso" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "clienteId" UUID,
    "proyectoId" UUID,
    "tipo" "TipoRecurso" NOT NULL,
    "origen" "OrigenRecurso" NOT NULL,
    "claveS3" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "ancho" INTEGER,
    "alto" INTEGER,
    "duracionMs" INTEGER,
    "hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alt" JSONB,
    "licencia" TEXT,
    "proveedor" TEXT,
    "modelo" TEXT,
    "eliminarEn" TIMESTAMP(3),
    "metadatos" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Narracion" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "pantallaId" TEXT NOT NULL,
    "idioma" TEXT NOT NULL,
    "textoHash" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "voz" TEXT,
    "velocidad" DECIMAL(3,2),
    "audioRecursoId" UUID,
    "subtituloRecursoId" UUID,
    "bocas" JSONB,
    "estado" "EstadoNarracion" NOT NULL DEFAULT 'DESACTUALIZADA',
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Narracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traduccion" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "ruta" TEXT NOT NULL,
    "idioma" TEXT NOT NULL,
    "textoOrigenHash" TEXT NOT NULL,
    "estado" "EstadoTraduccion" NOT NULL DEFAULT 'PENDIENTE',
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traduccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "pantallaId" TEXT NOT NULL,
    "autorId" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exportacion" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "cursoId" UUID NOT NULL,
    "versionCurso" INTEGER NOT NULL,
    "formato" "FormatoExportacion" NOT NULL,
    "perfilLms" TEXT NOT NULL DEFAULT 'generico',
    "modoIdioma" TEXT NOT NULL,
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'EN_COLA',
    "bytes" BIGINT,
    "informe" JSONB,
    "recursoId" UUID,
    "creadoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exportacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigProveedor" (
    "id" UUID NOT NULL,
    "tarea" "TareaProveedor" NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "parametros" JSONB,
    "costoUnitario" JSONB,
    "limiteGastoMensualUsd" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametrosNegocio" (
    "id" TEXT NOT NULL DEFAULT 'unico',
    "datos" JSONB NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametrosNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicionProceso" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "proyectoRef" TEXT NOT NULL,
    "escenario" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "horas" DECIMAL(6,2) NOT NULL,
    "notas" TEXT,
    "registradoPor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicionProceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "organizacionId" UUID,
    "usuarioId" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "datos" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAcceso" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "hashToken" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitMarca_clienteId_key" ON "KitMarca"("clienteId");

-- CreateIndex
CREATE INDEX "PantallaModelo_kitId_disposicion_idx" ON "PantallaModelo"("kitId", "disposicion");

-- CreateIndex
CREATE UNIQUE INDEX "GlosarioTermino_clienteId_termino_key" ON "GlosarioTermino"("clienteId", "termino");

-- CreateIndex
CREATE UNIQUE INDEX "PronunciacionTermino_clienteId_idioma_escrito_key" ON "PronunciacionTermino"("clienteId", "idioma", "escrito");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_proyectoId_key" ON "Curso"("proyectoId");

-- CreateIndex
CREATE UNIQUE INDEX "CursoVersion_cursoId_version_key" ON "CursoVersion"("cursoId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GeneracionEtapa_generacionId_etapa_key" ON "GeneracionEtapa"("generacionId", "etapa");

-- CreateIndex
CREATE INDEX "TrabajoIA_proyectoId_creadoEn_idx" ON "TrabajoIA"("proyectoId", "creadoEn");

-- CreateIndex
CREATE INDEX "TrabajoIA_tipo_creadoEn_idx" ON "TrabajoIA"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "TrabajoIA_organizacionId_creadoEn_idx" ON "TrabajoIA"("organizacionId", "creadoEn");

-- CreateIndex
CREATE INDEX "Propuesta_cursoId_estado_idx" ON "Propuesta"("cursoId", "estado");

-- CreateIndex
CREATE INDEX "Observacion_cursoId_resuelta_idx" ON "Observacion"("cursoId", "resuelta");

-- CreateIndex
CREATE UNIQUE INDEX "Recurso_claveS3_key" ON "Recurso"("claveS3");

-- CreateIndex
CREATE INDEX "Recurso_clienteId_tipo_idx" ON "Recurso"("clienteId", "tipo");

-- CreateIndex
CREATE INDEX "Recurso_organizacionId_tipo_idx" ON "Recurso"("organizacionId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Narracion_cursoId_pantallaId_idioma_key" ON "Narracion"("cursoId", "pantallaId", "idioma");

-- CreateIndex
CREATE UNIQUE INDEX "Traduccion_cursoId_ruta_idioma_key" ON "Traduccion"("cursoId", "ruta", "idioma");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigProveedor_tarea_key" ON "ConfigProveedor"("tarea");

-- CreateIndex
CREATE INDEX "MedicionProceso_proyectoRef_escenario_idx" ON "MedicionProceso"("proyectoRef", "escenario");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenAcceso_hashToken_key" ON "TokenAcceso"("hashToken");

-- CreateIndex
CREATE INDEX "TokenAcceso_usuarioId_tipo_idx" ON "TokenAcceso"("usuarioId", "tipo");

-- CreateIndex
CREATE INDEX "Cliente_organizacionId_idx" ON "Cliente"("organizacionId");

-- CreateIndex
CREATE INDEX "Proyecto_clienteId_estado_idx" ON "Proyecto"("clienteId", "estado");

-- CreateIndex
CREATE INDEX "Proyecto_organizacionId_estado_idx" ON "Proyecto"("organizacionId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_googleSub_key" ON "Usuario"("googleSub");

-- CreateIndex
CREATE INDEX "Usuario_organizacionId_idx" ON "Usuario"("organizacionId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitMarca" ADD CONSTRAINT "KitMarca_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantallaModelo" ADD CONSTRAINT "PantallaModelo_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "KitMarca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlosarioTermino" ADD CONSTRAINT "GlosarioTermino_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciacionTermino" ADD CONSTRAINT "PronunciacionTermino_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaCompatibilidad" ADD CONSTRAINT "FichaCompatibilidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFuente" ADD CONSTRAINT "MaterialFuente_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoVersion" ADD CONSTRAINT "CursoVersion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generacion" ADD CONSTRAINT "Generacion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generacion" ADD CONSTRAINT "Generacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneracionEtapa" ADD CONSTRAINT "GeneracionEtapa_generacionId_fkey" FOREIGN KEY ("generacionId") REFERENCES "Generacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabajoIA" ADD CONSTRAINT "TrabajoIA_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabajoIA" ADD CONSTRAINT "TrabajoIA_generacionId_fkey" FOREIGN KEY ("generacionId") REFERENCES "Generacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabajoIA" ADD CONSTRAINT "TrabajoIA_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propuesta" ADD CONSTRAINT "Propuesta_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propuesta" ADD CONSTRAINT "Propuesta_trabajoIAId_fkey" FOREIGN KEY ("trabajoIAId") REFERENCES "TrabajoIA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propuesta" ADD CONSTRAINT "Propuesta_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurso" ADD CONSTRAINT "Recurso_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurso" ADD CONSTRAINT "Recurso_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurso" ADD CONSTRAINT "Recurso_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Narracion" ADD CONSTRAINT "Narracion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traduccion" ADD CONSTRAINT "Traduccion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exportacion" ADD CONSTRAINT "Exportacion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exportacion" ADD CONSTRAINT "Exportacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exportacion" ADD CONSTRAINT "Exportacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicionProceso" ADD CONSTRAINT "MedicionProceso_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAcceso" ADD CONSTRAINT "TokenAcceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

