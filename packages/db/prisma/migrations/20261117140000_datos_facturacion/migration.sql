-- HU-1711 · Portal de facturación de la organización (REQ-091, CP-153, PNT-40). Aditiva.
-- CreateTable
CREATE TABLE "DatosFacturacionOrg" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "ruc" TEXT,
    "direccion" TEXT,
    "correoFacturacion" TEXT NOT NULL,
    "tipoComprobantePreferido" "TipoComprobante" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatosFacturacionOrg_pkey" PRIMARY KEY ("id"),
    -- La factura exige un RUC de 11 dígitos; la regla del dígito verificador vive en @aptio/schema/facturacion-org.
    CONSTRAINT "DatosFacturacionOrg_ruc_check" CHECK ("ruc" IS NULL OR "ruc" ~ '^[0-9]{11}$'),
    CONSTRAINT "DatosFacturacionOrg_factura_check" CHECK ("tipoComprobantePreferido" <> 'FACTURA' OR "ruc" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "DatosFacturacionOrg_organizacionId_key" ON "DatosFacturacionOrg"("organizacionId");

-- AddForeignKey
ALTER TABLE "DatosFacturacionOrg" ADD CONSTRAINT "DatosFacturacionOrg_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
