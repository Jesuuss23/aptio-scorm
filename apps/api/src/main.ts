import 'reflect-metadata';
import { crearApp } from './app.js';

const app = await crearApp();
const puerto = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
await app.listen(puerto);
console.log(`API de Aptio SCORM en http://localhost:${puerto}/api/v1 · documentación en /api/v1/docs`);
