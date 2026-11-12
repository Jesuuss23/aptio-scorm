// @aptio/exporters · paquetes de entrega (M12). HU-1202: SCORM 1.2 de un solo SCO. HU-1201: validar antes de exportar.
// HU-1203: HTML autocontenido. HU-1406: créditos de IA.
export { armarContenido, comprimir, construirScorm12, type ContenidoPaquete, FECHA_ZIP, indexHtml, INICIAR_JS, type EntradaScorm12, type PaqueteScorm12, type RecursoPaquete } from './scorm12.ts';
export { escaparXml, identificador, manifiestoScorm12, type DatosManifiesto } from './manifiesto.ts';
export { codigoReproductor } from './reproductor.ts';
export { ALTERNATIVAS_PESO, INTENTOS_PEOR_CASO, MB, type PesoRecurso, type RecursoPesado, type FormatoValidable, validarExportacion, validarScorm12, type ValidacionScorm12 } from './validar.ts';
export { construirHtml, type EntradaHtml, LEEME_HTML } from './html.ts';
export { armarCreditos, avisoCreditos, esDeIa, nombreProveedor, type ProcedenciaRecurso, PROVEEDOR_APTIO } from './creditos.ts';
export { cursoBilingue, IDIOMAS_BILINGUE, type ModoIdioma, pantallasSinVozIngles, textosEnIngles } from './bilingue.ts';
