// pnpm almacen:preparar · deja LocalStack listo para desarrollar (bucket cifrado con KMS y CORS para la web).
import { Almacen, prepararAlmacen } from '../src/index.js';

const almacen = new Almacen();
const origenes = (process.env.WEB_URL ?? 'http://localhost:5173').split(',');
const { claveKms } = await prepararAlmacen(almacen, origenes);
console.log(`Bucket ${almacen.config.bucket} cifrado con ${claveKms} · CORS para ${origenes.join(', ')}`);
