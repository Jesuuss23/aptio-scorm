import { HttpStatus, type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { FiltroErrores } from './comun/filtro-errores.js';

export const PREFIJO = 'api/v1';

/** Configuración común a la app real y a las pruebas: prefijo, validación, errores y OpenAPI. */
export function configurarApp(app: INestApplication): INestApplication {
  // HU-1508 · El sitio público pre-renderizado queda fuera del prefijo de la API.
  app.setGlobalPrefix(PREFIJO, {
    exclude: [{ path: 's', method: RequestMethod.GET }, { path: 's/{*ruta}', method: RequestMethod.GET }],
  });
  app.use(cookieParser());
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
  app.useGlobalFilters(new FiltroErrores());

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
