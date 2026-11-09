import 'reflect-metadata';
import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsEmail, IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { BaseDatosService } from '../src/base-datos/base-datos.service.js';
import { GuardaRoles } from '../src/comun/guarda-roles.js';
import { Publico, Roles } from '../src/comun/roles.js';

let app: INestApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appConBase(disponible: boolean) {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BaseDatosService)
    .useValue({ disponible: async () => disponible, onModuleDestroy: async () => {} })
    .compile();
  app = configurarApp(modulo.createNestApplication());
  await app.init();
  return app;
}

describe('CP-001 · salud', () => {
  it('GET /api/v1/salud responde 200 con la base disponible', async () => {
    const res = await request((await appConBase(true)).getHttpServer()).get('/api/v1/salud');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'ok', baseDatos: 'ok', servicio: 'Aptio SCORM API' });
  });

  it('responde 503 si la base no responde', async () => {
    const res = await request((await appConBase(false)).getHttpServer()).get('/api/v1/salud');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ estado: 'degradado', baseDatos: 'error' });
  });

  it('publica la documentación OpenAPI generada', async () => {
    const res = await request((await appConBase(true)).getHttpServer()).get('/api/v1/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.paths).toHaveProperty('/api/v1/salud');
  });
});

// Controlador solo para pruebas: ejercita validación, errores y guardas.
class AltaDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(3) nombre!: string;
}

@Controller('prueba')
class PruebaController {
  @Post('publica') @Publico() alta(@Body() dto: AltaDto) {
    return dto;
  }
  @Get('privada') privada() {
    return { ok: true };
  }
  @Get('productor') @Roles('PRODUCTOR') soloProductor() {
    return { ok: true };
  }
}

@Module({ controllers: [PruebaController], providers: [{ provide: APP_GUARD, useClass: GuardaRoles }] })
class PruebaModule {}

async function appPrueba(rol?: string) {
  const modulo = await Test.createTestingModule({ imports: [PruebaModule] }).compile();
  app = modulo.createNestApplication();
  // Simula la sesión de HU-0104 colocando el usuario en la solicitud.
  if (rol) app.use((req: { usuario?: unknown }, _res: unknown, next: () => void) => {
    req.usuario = { id: 'u1', rol, organizacionId: 'o1', clienteId: null };
    next();
  });
  configurarApp(app);
  await app.init();
  return app.getHttpServer();
}

describe('validación y formato de errores', () => {
  it('rechaza datos inválidos con { codigo, mensaje, detalles }', async () => {
    const res = await request(await appPrueba()).post('/api/v1/prueba/publica').send({ email: 'no-es-correo', nombre: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.codigo).toBe('NO_VALIDO');
    expect(res.body.detalles).toHaveLength(2);
  });

  it('rechaza campos que no están en el DTO', async () => {
    const res = await request(await appPrueba())
      .post('/api/v1/prueba/publica')
      .send({ email: 'a@b.test', nombre: 'Ana', rol: 'SUPERADMIN' });
    expect(res.status).toBe(422);
  });

  it('acepta datos válidos', async () => {
    const res = await request(await appPrueba()).post('/api/v1/prueba/publica').send({ email: 'a@b.test', nombre: 'Ana' });
    expect(res.status).toBe(201);
  });

  it('una ruta inexistente responde NO_ENCONTRADO', async () => {
    const res = await request(await appPrueba()).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('guarda de roles (RN-01-2)', () => {
  it('sin sesión, una ruta no pública responde 401', async () => {
    const res = await request(await appPrueba()).get('/api/v1/prueba/privada');
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('con sesión, una ruta sin @Roles responde 200', async () => {
    const res = await request(await appPrueba('REVISOR_CLIENTE')).get('/api/v1/prueba/privada');
    expect(res.status).toBe(200);
  });

  it('un rol no permitido responde 403', async () => {
    const res = await request(await appPrueba('REVISOR_CLIENTE')).get('/api/v1/prueba/productor');
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('SIN_PERMISO');
  });

  it('el rol permitido pasa', async () => {
    const res = await request(await appPrueba('PRODUCTOR')).get('/api/v1/prueba/productor');
    expect(res.status).toBe(200);
  });
});
