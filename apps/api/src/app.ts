import { HttpStatus, type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { BaseDatosService } from './base-datos/base-datos.service.js';
import { AuditorAccesoCruzado } from './comun/acceso-cruzado.js';
import { FiltroErrores } from './comun/filtro-errores.js';

export const PREFIJO = 'api/v1';

/** Configuración común a la app real y a las pruebas: prefijo, validación, errores y OpenAPI. */
export function configurarApp(app: INestApplication): INestApplication {
  // HU-1508 · El sitio público pre-renderizado queda fuera del prefijo de la API.
  app.setGlobalPrefix(PREFIJO, {
    // HU-1601 · También el envío del formulario de contacto (`POST /s/_lead`), que funciona sin JavaScript.
    // HU-1603 · Y los eventos de los popups (`POST /s/_popup`). HU-1607 · Y las visitas anónimas (`POST /s/_visita`).
    exclude: [
      { path: 's', method: RequestMethod.GET }, { path: 's/{*ruta}', method: RequestMethod.GET }, { path: 's/_lead', method: RequestMethod.POST }, { path: 's/_popup', method: RequestMethod.POST },
      { path: 's/_cita', method: RequestMethod.POST }, { path: 's/_visita', method: RequestMethod.POST },
    ],
  });
  app.use(cookieParser());
  // HU-1509 · El logo y el favicon llegan como el archivo mismo (SVG o PNG), hasta 200 KB; más, 413 DEMASIADO_GRANDE.
  (app as NestExpressApplication).useBodyParser('raw', { type: ['image/svg+xml', 'image/png'], limit: '200kb' });
  app.enableCors({ origin: process.env.WEB_URL ?? 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(
    // 422 para datos no válidos, como define docs/api/openapi.yaml (respuesta NoValido).
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  // HU-1701 · El 404 de un recurso de otra organización queda en la auditoría de plataforma (CP-139).
  // Una app de prueba sin base de datos (o con la base simulada) queda sin auditor.
  let bd: BaseDatosService | undefined;
  try {
    bd = app.get(BaseDatosService, { strict: false });
  } catch {
    bd = undefined;
  }
  app.useGlobalFilters(new FiltroErrores(bd?.cliente && bd.enSegundoPlano ? new AuditorAccesoCruzado(bd.cliente, (t) => bd.enSegundoPlano(t)) : undefined));

  const config = new DocumentBuilder()
    .setTitle('Aptio SCORM · API')
    .setDescription('Generado desde el código. El contrato de referencia es docs/api/openapi.yaml.')
    .setVersion('0.2.0')
    .addCookieAuth('sesion')
    .build();
  SwaggerModule.setup(`${PREFIJO}/docs`, app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: `${PREFIJO}/docs-json`,
  });
  return app;
}

export async function crearApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  return configurarApp(app);
}
