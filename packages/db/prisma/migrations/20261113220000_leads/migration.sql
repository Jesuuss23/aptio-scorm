-- HU-1601 · Leads con origen y UTM (REQ-074, RN-17-1). Aditiva: solo crea la tabla Lead.
-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "empresa" TEXT,
    "mensaje" TEXT,
    "origen" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "paginaEntrada" TEXT NOT NULL,
    "paginaFormulario" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "referente" TEXT,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "etapa" TEXT NOT NULL DEFAULT 'NUEVO',
    "consentimiento" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "totalContactos" INTEGER NOT NULL DEFAULT 1,
    "historialContactos" JSONB NOT NULL DEFAULT '[]',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_correo_key" ON "Lead"("correo");

-- CreateIndex
CREATE INDEX "Lead_origen_creadoEn_idx" ON "Lead"("origen", "creadoEn");

-- CreateIndex
CREATE INDEX "Lead_etapa_creadoEn_idx" ON "Lead"("etapa", "creadoEn");

-- CreateIndex
CREATE INDEX "Lead_creadoEn_idx" ON "Lead"("creadoEn");

