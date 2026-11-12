-- HU-0803 · RN-08-3: un texto en Desborde guarda la versión corta que propone la IA (IA-10 con su límite). El inglés
-- del curso no cambia hasta que una persona la usa.
ALTER TABLE "Traduccion" ADD COLUMN "propuesta" TEXT;
