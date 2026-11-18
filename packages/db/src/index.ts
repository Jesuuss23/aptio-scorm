import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { hashearClave, verificarClave } from './clave.js';

// Una sola instancia por proceso (API o worker).
const global = globalThis as unknown as { __aptioPrisma?: PrismaClient };
export const prisma: PrismaClient = global.__aptioPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__aptioPrisma = prisma;
export { recalcularReglas } from './observaciones.js';
export { armarInstantaneaActual, crearVersion, ID_AJUSTES, ID_PLANES_AJUSTES, ID_SEO, leerAjustesSitio, type NuevaVersion, publicarProgramadas, RUTA_SITIO, rutaSitioValida, ultimaVersion } from './sitio.js';
export { ID_BLOG, leerBlogPublico, leerConexionBlog } from './blog.js';
export { esUuid, type IdConOrganizacion, NOMBRE_ORGANIZACION_BASE, organizacionDeIds, SLUG_ORGANIZACION_BASE, TABLAS_ORGANIZACION, verificarOrganizaciones } from './organizaciones.js';
export { type DesenlacePago, type PagoRenovacion, precioPublicado, resolverPagoRenovacion, type ResultadoPagoRenovacion } from './renovaciones.js';
export { restablecerSegundoFactor, type ResultadoRestablecimiento } from './segundo-factor.js';
