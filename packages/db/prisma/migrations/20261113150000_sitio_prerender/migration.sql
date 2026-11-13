-- AlterTable
ALTER TABLE "SitioVersion" ADD COLUMN     "prerenderEn" TIMESTAMP(3),
ADD COLUMN     "prerenderError" TEXT,
ADD COLUMN     "prerenderEstado" TEXT NOT NULL DEFAULT 'en_curso';

