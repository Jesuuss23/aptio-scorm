/**
 * Seguridad de la semilla (revisión de seguridad para la nube, A1). La semilla borra y vuelve a crear los datos de
 * ejemplo con una clave conocida: sirve en local y en pruebas, pero en producción solo se permite sobre una base vacía
 * y con una clave propia (`SEED_CLAVE`) larga, que nunca se escribe en el registro.
 */

/** Clave pública de los usuarios de ejemplo en local. No es un secreto: está en el repositorio. */
export const CLAVE_DESARROLLO = 'Aptio-local-2026';
/** Largo mínimo de `SEED_CLAVE` en producción. */
export const LARGO_MINIMO_CLAVE_SEMILLA = 16;

export interface EntornoSemilla {
  produccion: boolean;
  /** `SEED_CLAVE`, si se definió. */
  clave?: string | undefined;
  /** Ya hay usuarios u organizaciones en la base. */
  hayDatos: boolean;
}

export interface PermisoSemilla {
  clave: string;
  /** Lo que la semilla puede escribir en el registro sobre la clave (nunca una clave propia). */
  avisoClave: string;
}

/** Decide si la semilla puede correr y con qué clave; lanza un Error con el motivo si no. */
export function permisoSemilla(e: EntornoSemilla): PermisoSemilla {
  const clave = e.clave?.trim() ? e.clave : undefined;
  if (e.produccion) {
    if (!clave) throw new Error('En producción la semilla exige SEED_CLAVE (no se usa la clave de desarrollo)');
    if (clave.length < LARGO_MINIMO_CLAVE_SEMILLA) throw new Error(`SEED_CLAVE debe tener al menos ${LARGO_MINIMO_CLAVE_SEMILLA} caracteres en producción`);
    if (clave === CLAVE_DESARROLLO) throw new Error('SEED_CLAVE no puede ser la clave de desarrollo');
    if (e.hayDatos) throw new Error('En producción la semilla solo corre sobre una base vacía: ya hay usuarios u organizaciones');
  }
  return clave
    ? { clave, avisoClave: 'la de SEED_CLAVE (no se muestra)' }
    : { clave: CLAVE_DESARROLLO, avisoClave: `de desarrollo: ${CLAVE_DESARROLLO}` };
}
