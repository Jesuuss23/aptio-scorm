-- CreateTable
CREATE TABLE "Subida" (
    "id" UUID NOT NULL,
    "organizacionId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "clienteId" UUID,
    "proyectoId" UUID,
    "origen" "OrigenRecurso" NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "claveS3" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "recursoId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subida_claveS3_key" ON "Subida"("claveS3");

-- CreateIndex
CREATE INDEX "Subida_organizacionId_usuarioId_idx" ON "Subida"("organizacionId", "usuarioId");

-- CreateIndex
CREATE INDEX "Recurso_eliminarEn_idx" ON "Recurso"("eliminarEn");

-- AddForeignKey
ALTER TABLE "Subida" ADD CONSTRAINT "Subida_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
