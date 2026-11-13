-- CreateTable
CREATE TABLE "SitioBlog" (
    "id" TEXT NOT NULL DEFAULT 'blog',
    "url" TEXT,
    "frecuenciaMin" INTEGER NOT NULL DEFAULT 15,
    "porPagina" INTEGER NOT NULL DEFAULT 6,
    "mostrarImagen" BOOLEAN NOT NULL DEFAULT true,
    "mostrarAutor" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEn" TIMESTAMP(3),
    "intentoEn" TIMESTAMP(3),
    "error" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitioBlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WpCategoria" (
    "id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WpArticulo" (
    "id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "extracto" TEXT NOT NULL,
    "categorias" INTEGER[],
    "autor" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "imagen" TEXT,
    "imagenOrigen" TEXT,
    "imagenAncho" INTEGER,
    "imagenAlto" INTEGER,
    "enlace" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sincronizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpArticulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WpCategoria_orden_idx" ON "WpCategoria"("orden");

-- CreateIndex
CREATE INDEX "WpArticulo_fecha_idx" ON "WpArticulo"("fecha");

