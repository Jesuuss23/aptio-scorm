-- HU-1607 · Visitas anónimas del sitio por día, ruta e idioma (REQ-080, PNT-24): sin IP, cookies ni identificadores. Solo agrega.
-- CreateTable
CREATE TABLE "SitioVisitaDia" (
    "id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "ruta" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "visitas" INTEGER NOT NULL DEFAULT 0,
    "paginasVistas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SitioVisitaDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioVisitaDia_dia_idx" ON "SitioVisitaDia"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "SitioVisitaDia_dia_ruta_idioma_key" ON "SitioVisitaDia"("dia", "ruta", "idioma");

