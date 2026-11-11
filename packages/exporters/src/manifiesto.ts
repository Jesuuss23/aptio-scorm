// HU-1202 · imsmanifest.xml de SCORM 1.2 con un solo SCO (IMS Content Packaging 1.1.2 + ADL SCORM 1.2).
// Es el mismo para todos los perfiles de LMS (RN-12-1): solo usa elementos del estándar.

export interface DatosManifiesto {
  cursoId: string;
  titulo: string;
  /** Nota mínima para aprobar; solo se declara si el curso se aprueba por la evaluación sumativa. */
  masteryscore: number | null;
  /** Rutas relativas de todos los archivos del paquete, sin el propio manifiesto. */
  archivos: string[];
}

export const escaparXml = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Un identificador XML válido (xs:ID): empieza por letra y solo lleva letras, dígitos, guion, punto y guion bajo. */
export const identificador = (prefijo: string, valor: string): string => `${prefijo}-${valor.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function manifiestoScorm12(d: DatosManifiesto): string {
  const titulo = escaparXml(d.titulo);
  const org = identificador('ORG', d.cursoId);
  const recurso = identificador('RES', d.cursoId);
  const mastery = d.masteryscore === null ? '' : `\n        <adlcp:masteryscore>${Math.round(d.masteryscore)}</adlcp:masteryscore>`;
  const archivos = d.archivos.map((a) => `      <file href="${escaparXml(a)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${identificador('MANIFEST', d.cursoId)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${org}">
    <organization identifier="${org}">
      <title>${titulo}</title>
      <item identifier="${identificador('ITEM', d.cursoId)}" identifierref="${recurso}" isvisible="true">
        <title>${titulo}</title>${mastery}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${recurso}" type="webcontent" adlcp:scormtype="sco" href="index.html">
${archivos}
    </resource>
  </resources>
</manifest>
`;
}
