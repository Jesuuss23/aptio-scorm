import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { FiltroErrores } from './comun/filtro-errores.js';

export const PREFIJO = 'api/v1';

/** Configuración común a la app real y a las pruebas: prefijo, validación, errores y OpenAPI. */
export function configurarApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(PREFIJO);
  app.enableCors({ origin: process.env.WEB_URL ?? 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
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
