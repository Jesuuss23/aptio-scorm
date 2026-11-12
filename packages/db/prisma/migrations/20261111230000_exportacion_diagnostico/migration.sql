-- HU-1204: el modo diagnóstico va en el paquete salvo que se pida lo contrario.
ALTER TABLE "Exportacion" ADD COLUMN "incluirDiagnostico" BOOLEAN NOT NULL DEFAULT true;
