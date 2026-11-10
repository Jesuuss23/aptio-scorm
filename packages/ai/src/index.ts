export { leerSalidaSimulada, tareasSimuladas, validarSalida, type ResultadoSimulado } from './simulado.js';
export {
  type AudioVoz, costoVoz, duracionAudio, hashNarracion, idiomaDeVoz, MS_POR_CARACTER_SIMULADO, type PedidoVoz, type Sintetizador, sintetizadorDesdeEntorno, sintetizarGoogle,
  TARIFA_VOZ_USD_MILLON, textoHablado, VozNoDisponible, vozSimulada,
} from './voz.js';
export { materialParaPrompt, neutralizar, type PaginaMaterial, paginasParaPrompt, pareceInstruccion, textoSeguro } from './material.js';
export {
  armarPrompt, type Consumo, costoTexto, ejecutarTarea, INTENTOS_MAXIMOS, leerJson, type MensajeProveedor, type PromptArmado, type ProveedorTexto,
  proveedorSimulado, type RespuestaProveedor, type ResultadoTarea, SalidaNoValida, SIN_CONSUMO, TARIFAS,
} from './texto.js';
export { MODELO_POR_DEFECTO, proveedorAnthropic, proveedorDesdeEntorno } from './anthropic.js';
export {
  costoTranscripcion, type ProveedorTranscripcion, SEGUNDOS_POR_TRAMO, type SegmentoTranscripcion, TARIFA_TRANSCRIPCION_USD_MINUTO, TranscripcionNoDisponible,
  transcriptorDesdeEntorno, transcriptorGoogle, transcriptorSimulado, type TramoAudio,
} from './transcripcion.js';
