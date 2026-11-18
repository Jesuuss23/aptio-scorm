// HU-1405 · Detrás de CloudFront y el balanceador, la API toma la IP del visitante de X-Forwarded-For (SUP-169): así
// los límites por IP de /publico/* y /s/* no se reparten entre todos los visitantes.
import 'reflect-metadata';
import { Controller, Get, type INestApplication, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarApp, saltosProxy } from '../src/app.js';

@Controller('ip')
class IpControlador {
  @Get()
  ip(@Req() req: { ip?: string }) {
    return { ip: req.ip };
  }
}
@Module({ controllers: [IpControlador] })
class IpModulo {}

describe('HU-1405 · trust proxy', () => {
  let app: INestApplication | undefined;
  const original = process.env.TRUST_PROXY;
  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (original === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = original;
  });

  const levantar = async () => {
    const modulo = await Test.createTestingModule({ imports: [IpModulo] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    return app;
  };

  it('lee TRUST_PROXY como un entero de 0 a 5 y descarta lo demás', () => {
    expect(saltosProxy({})).toBe(0);
    expect(saltosProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(saltosProxy({ TRUST_PROXY: 'true' })).toBe(0);
    expect(saltosProxy({ TRUST_PROXY: '-1' })).toBe(0);
    expect(saltosProxy({ TRUST_PROXY: '9' })).toBe(0);
  });

  it('con 2 saltos (CloudFront y el balanceador) req.ip es el visitante, aunque mande una IP falsa delante', async () => {
    process.env.TRUST_PROXY = '2';
    const a = await levantar();
    const r = await request(a.getHttpServer()).get('/api/v1/ip').set('X-Forwarded-For', '6.6.6.6, 190.12.34.56, 130.176.1.1');
    expect(r.body.ip).toBe('190.12.34.56');
  });

  it('sin la variable no confía en X-Forwarded-For', async () => {
    delete process.env.TRUST_PROXY;
    const a = await levantar();
    const r = await request(a.getHttpServer()).get('/api/v1/ip').set('X-Forwarded-For', '190.12.34.56');
    expect(r.body.ip).not.toBe('190.12.34.56');
  });
});
