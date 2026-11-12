-- HU-1406 · REQ-062: todo recurso GENERADO registra proveedor, modelo y licencia. Los subtítulos por letras y los
-- paquetes que se crearon antes solo guardaban la licencia: se completan con el proveedor `aptio` (SUP-64), igual que
-- los crea ahora el worker. Los demás recursos generados ya traen su proveedor y modelo (la voz).
UPDATE "Recurso"
SET "proveedor" = 'aptio',
    "modelo" = 'subtitulos-por-letras v1',
    "licencia" = COALESCE("licencia", 'Generado por Aptio SCORM desde el guion')
WHERE "origen" = 'GENERADO' AND "tipo" = 'SUBTITULO' AND "proveedor" IS NULL;

UPDATE "Recurso"
SET "proveedor" = 'aptio',
    "modelo" = CASE WHEN "nombre" LIKE '%-html-v%' THEN 'exportador-html v1' ELSE 'exportador-scorm12 v1' END,
    "licencia" = COALESCE("licencia", 'Paquete generado por Aptio SCORM')
WHERE "origen" = 'GENERADO' AND "tipo" = 'PAQUETE' AND "proveedor" IS NULL;
