// SUP-359 · Límites por IP en Redis: dos instancias de la API comparten la ventana; sin Redis, cada una cuenta en memoria.
import { HttpException } from '@nestjs/common';
import { afterAll, describe, expect, it } from 'vitest';
import { LimitadorService } from './limitador.js';

const abiertos: LimitadorService[] = [];
afterAll(() => abiertos.forEach((l) => l.onModuleDestroy()));

/** Una instancia lista: espera a que conecte con Redis (o a que falle y quede en memoria). */
async function instancia(): Promise<LimitadorService> {
  const l = new LimitadorService();
  abiertos.push(l);
  for (let i = 0; i < 50 && l.almacen !== 'redis'; i++) await new Promise((r) => setTimeout(r, 20));
  return l;
}

const hayRedis = await (async () => {
  const l = await instancia();
  return l.almacen === 'redis';
})();

describe.skipIf(!hayRedis && !process.env.CI)('límites por IP en Redis', () => {
  it('dos instancias cuentan en la misma ventana y la sexta petición responde 429 con los segundos que faltan', async () => {
    const [a, b] = [await instancia(), await instancia()];
    expect(a.almacen).toBe('redis');
    const limite = { envios: 5, ventanaMs: 10 * 60_000 };
    for (let i = 0; i < 5; i++) await (i % 2 ? a : b).exigir('leads', '203.0.113.7', limite, 'Espera');
    const error = await a.exigir('leads', '203.0.113.7', limite, 'Espera').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    const cuerpo = (error as HttpException).getResponse() as { codigo: string; reintentarEn: number };
    expect(cuerpo.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(cuerpo.reintentarEn).toBeGreaterThan(590);
    expect(cuerpo.reintentarEn).toBeLessThanOrEqual(600);
    // Otra IP y otro grupo tienen su propia cuenta.
    await expect(b.exigir('leads', '203.0.113.8', limite, 'Espera')).resolves.toBeUndefined();
    await expect(b.exigir('chatbot', '203.0.113.7', limite, 'Espera')).resolves.toBeUndefined();
  });

  it('la ventana vence sola y reiniciar empieza de cero solo ese grupo', async () => {
    const l = await instancia();
    const corto = { envios: 1, ventanaMs: 150 };
    expect((await l.contar('visitas', '198.51.100.1', corto)).cuenta).toBe(1);
    expect((await l.contar('visitas', '198.51.100.1', corto)).cuenta).toBe(2);
    await new Promise((r) => setTimeout(r, 220));
    expect((await l.contar('visitas', '198.51.100.1', corto)).cuenta).toBe(1);

    const largo = { envios: 1, ventanaMs: 60_000 };
    await l.contar('pago', '198.51.100.2', largo);
    await l.contar('cupones', '198.51.100.2', largo);
    l.reiniciar('pago');
    expect((await l.contar('pago', '198.51.100.2', largo)).cuenta).toBe(1);
    expect((await l.contar('cupones', '198.51.100.2', largo)).cuenta).toBe(2);
  });
});

describe('sin Redis', () => {
  it('cuenta en la memoria de la instancia con el mismo límite', async () => {
    const antes = process.env.LIMITES_EN_MEMORIA;
    process.env.LIMITES_EN_MEMORIA = 'true';
    const l = new LimitadorService();
    process.env.LIMITES_EN_MEMORIA = antes;
    expect(l.almacen).toBe('memoria');
    const limite = { envios: 2, ventanaMs: 60_000 };
    await l.exigir('popups', '192.0.2.1', limite, 'Espera');
    await l.exigir('popups', '192.0.2.1', limite, 'Espera');
    await expect(l.exigir('popups', '192.0.2.1', limite, 'Espera')).rejects.toMatchObject({ status: 429 });
    l.reiniciar('popups');
    await expect(l.exigir('popups', '192.0.2.1', limite, 'Espera')).resolves.toBeUndefined();
  });

  it('si Redis no está, no espera: cuenta en memoria', async () => {
    const antes = process.env.REDIS_PORT;
    process.env.REDIS_PORT = '1';
    const l = new LimitadorService();
    abiertos.push(l);
    process.env.REDIS_PORT = antes;
    const inicio = Date.now();
    expect((await l.contar('ingreso', '192.0.2.9', { envios: 20, ventanaMs: 60_000 })).cuenta).toBe(1);
    expect(Date.now() - inicio).toBeLessThan(500);
    expect(l.almacen).toBe('memoria');
  });
});
