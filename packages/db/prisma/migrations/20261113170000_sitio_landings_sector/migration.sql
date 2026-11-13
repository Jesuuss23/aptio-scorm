-- AlterTable
ALTER TABLE "SitioPagina" ADD COLUMN     "blogCategoriaInicial" TEXT,
ADD COLUMN     "metaTitulo" TEXT,
ADD COLUMN     "portada" JSONB,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'general';

