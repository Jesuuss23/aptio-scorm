import { type EntornoSitio, entornoSitio } from '@aptio/schema/sitio-ficticios';

/**
 * HU-1505 · Entorno del sitio (`SITIO_ENTORNO`): `pruebas` o, si falta o trae otro valor, `produccion`. Se lee en cada
 * uso para que un cambio de configuración (o una prueba) no dependa del arranque.
 */
export const entornoActual = (): EntornoSitio => entornoSitio(process.env.SITIO_ENTORNO);
