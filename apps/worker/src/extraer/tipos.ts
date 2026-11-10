/** Una página del material del cliente: texto real o reconocido por OCR (HU-0304, CP-033). */
export interface Pagina {
  n: number;
  texto: string;
  /** true si la página era una imagen y el texto salió del OCR. */
  escaneada: boolean;
}

/** Reconoce texto en una imagen PNG. Se inyecta para poder probar sin OCR. */
export type Ocr = (png: Uint8Array) => Promise<string>;
