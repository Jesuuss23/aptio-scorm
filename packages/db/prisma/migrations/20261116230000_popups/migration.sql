-- CreateTable
CREATE TABLE "SitioPopup" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "disparador" TEXT NOT NULL,
    "valorDisparador" INTEGER,
    "paginas" JSONB NOT NULL DEFAULT '["*"]',
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "boton" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "enlaceDestino" TEXT,
    "frecuenciaDias" INTEGER NOT NULL DEFAULT 7,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "ficticio" BOOLEAN NOT NULL DEFAULT false,
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "conversiones" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioPopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitioPopup_visible_idioma_orden_idx" ON "SitioPopup"("visible", "idioma", "orden");

