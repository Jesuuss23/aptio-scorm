-- HU-1709 · Cupones y convenios (REQ-089, CP-151, PNT-37). Aditiva: la tabla Cupon y el cupón aplicado en la solicitud,
-- en la suscripción (porcentaje y ciclos que quedan) y en cada renovación.

-- CreateEnum
CREATE TYPE "TipoCupon" AS ENUM ('CAMPANA', 'CONVENIO');

-- AlterTable
ALTER TABLE "Renovacion" ADD COLUMN     "descuentoSinIgv" DECIMAL(10,2),
ADD COLUMN     "porcentajeDescuento" INTEGER;

-- AlterTable
ALTER TABLE "SolicitudSuscripcion" ADD COLUMN     "cuponId" UUID,
ADD COLUMN     "descuentoSinIgv" DECIMAL(10,2),
ADD COLUMN     "porcentajeDescuento" INTEGER,
ADD COLUMN     "subtotalListaSinIgv" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Suscripcion" ADD COLUMN     "ciclosDescuentoRestantes" INTEGER,
ADD COLUMN     "cuponId" UUID,
ADD COLUMN     "porcentajeDescuento" INTEGER;

-- CreateTable
CREATE TABLE "Cupon" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCupon" NOT NULL DEFAULT 'CAMPANA',
    "porcentaje" INTEGER NOT NULL,
    "ciclosDescuento" INTEGER,
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "limiteUsos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "planesPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dominiosCorreo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cupon_codigo_key" ON "Cupon"("codigo");

-- CreateIndex
CREATE INDEX "SolicitudSuscripcion_cuponId_idx" ON "SolicitudSuscripcion"("cuponId");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_cuponId_fkey" FOREIGN KEY ("cuponId") REFERENCES "Cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudSuscripcion" ADD CONSTRAINT "SolicitudSuscripcion_cuponId_fkey" FOREIGN KEY ("cuponId") REFERENCES "Cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas del cupón. Los usos pueden pasar el límite si dos pagos aprobados concurren en el último cupo (se respetan).
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_porcentaje_check" CHECK ("porcentaje" BETWEEN 1 AND 100);
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_ciclos_check" CHECK ("ciclosDescuento" IS NULL OR "ciclosDescuento" >= 1);
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_limite_check" CHECK ("limiteUsos" IS NULL OR "limiteUsos" >= 1);
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_usos_check" CHECK ("usos" >= 0);
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_codigo_check" CHECK ("codigo" = upper("codigo") AND "codigo" ~ '^[A-Z0-9][A-Z0-9-]{2,29}$');
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_vigencia_check" CHECK ("vigenciaDesde" IS NULL OR "vigenciaHasta" IS NULL OR "vigenciaHasta" > "vigenciaDesde");
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_descuento_check" CHECK (("porcentajeDescuento" IS NULL OR "porcentajeDescuento" BETWEEN 1 AND 100) AND ("ciclosDescuentoRestantes" IS NULL OR "ciclosDescuentoRestantes" >= 0));
