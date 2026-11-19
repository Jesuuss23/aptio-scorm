// Los límites por IP cuentan en Redis, compartido por todas las instancias: cada archivo de prueba usa su propio prefijo
// para que las peticiones de un archivo no cuenten en la ventana de otro que corre a la vez.
import { randomUUID } from 'node:crypto';

process.env.LIMITES_PREFIJO = `prueba:limite:${randomUUID()}`;
