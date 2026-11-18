-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "cadenaQr" TEXT,
ADD COLUMN     "dniReceptor" TEXT,
ADD COLUMN     "hashCpe" TEXT,
ADD COLUMN     "s3KeyCdr" TEXT;

-- AlterTable
ALTER TABLE "DatosFacturacionOrg" ADD COLUMN     "dniReceptor" TEXT;

-- AlterTable
ALTER TABLE "DatosFiscales" ADD COLUMN     "codigoAnexo" TEXT NOT NULL DEFAULT '0000',
ADD COLUMN     "codigoDetraccion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cuentaDetraccion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ubigeoEmisor" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SolicitudSuscripcion" ADD COLUMN     "dniReceptor" TEXT;

