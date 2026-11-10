export { leerSalidaSimulada, tareasSimuladas, validarSalida, type ResultadoSimulado } from './simulado.js';
export { type AudioVoz, idiomaDeVoz, type PedidoVoz, sintetizarGoogle, VozNoDisponible, vozSimulada } from './voz.js';
export { materialParaPrompt, neutralizar, type PaginaMaterial, paginasParaPrompt, pareceInstruccion, textoSeguro } from './material.js';
export {
  armarPrompt, type Consumo, costoTexto, ejecutarTarea, INTENTOS_MAXIMOS, leerJson, type MensajeProveedor, type PromptArmado, type ProveedorTexto,
  proveedorSimulado, type RespuestaProveedor, type ResultadoTarea, SalidaNoValida, SIN_CONSUMO, TARIFAS,
} from './texto.js';
export { MODELO_POR_DEFECTO, proveedorAnthropic, proveedorDesdeEntorno } from './anthropic.js';
