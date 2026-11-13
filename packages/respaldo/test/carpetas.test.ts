// HU-1403 · Reglas puras de las copias: carpeta por copia, día de Lima, retención de 14 días, elección de la copia a
// restaurar y los resguardos para no restaurar sobre la base o el bucket en uso.
import { describe, expect, it } from 'vitest';
import { carpetaDe, diaLima, elegirCarpeta, entornoPg, fechaDeCarpeta, limiteRetencion, mismaBase } from '../src/carpetas.js';
import { ErrorRestauracion, validarDestino } from '../src/restaurar.js';

describe('carpetas de las copias', () => {
  it('la carpeta se lee de vuelta como la fecha de inicio', () => {
    const f = new Date('2026-11-13T08:00:01.234Z');
    expect(carpetaDe(f)).toBe('2026-11-13T08-00-01-234Z');
    expect(fechaDeCarpeta(`${carpetaDe(f)}/`)).toEqual(f);
    expect(fechaDeCarpeta('otra-cosa/')).toBeNull();
  });

  it('el día de Lima cambia a las 05:00 UTC', () => {
    expect(diaLima(new Date('2026-11-13T04:59:59Z'))).toBe('2026-11-12');
    expect(diaLima(new Date('2026-11-13T05:00:00Z'))).toBe('2026-11-13');
  });

  it('retención de 14 días', () => {
    expect(limiteRetencion(new Date('2026-11-15T08:00:00Z')).toISOString()).toBe('2026-11-01T08:00:00.000Z');
  });

  it('elige la última copia del día de Lima, o la carpeta exacta', () => {
    const cs = ['2026-11-12T08-00-00-000Z/', '2026-11-13T04-30-00-000Z/', '2026-11-13T08-00-00-000Z/', '2026-11-13T15-10-00-000Z/', 'basura/'];
    expect(elegirCarpeta(cs, '2026-11-13')).toBe('2026-11-13T15-10-00-000Z');
    // 04:30 UTC es aún el 12 en Lima.
    expect(elegirCarpeta(cs, '2026-11-12')).toBe('2026-11-13T04-30-00-000Z');
    expect(elegirCarpeta(cs, '2026-11-13T08-00-00-000Z')).toBe('2026-11-13T08-00-00-000Z');
    expect(elegirCarpeta(cs, '2026-11-20')).toBeNull();
    expect(elegirCarpeta(cs, 'basura')).toBeNull();
  });
});

describe('conexión y resguardos del destino', () => {
  it('la clave va por PGPASSWORD y no en los argumentos', () => {
    expect(entornoPg('postgresql://yo:cl%40ve@db.local:6543/aptio?schema=public')).toEqual({
      PGHOST: 'db.local', PGPORT: '6543', PGDATABASE: 'aptio', PGUSER: 'yo', PGPASSWORD: 'cl@ve',
    });
    expect(() => entornoPg('mysql://x@y/z')).toThrow('postgresql://');
  });

  it('misma base sin importar usuario, clave ni parámetros', () => {
    expect(mismaBase('postgresql://a:1@localhost:5432/aptio?schema=public', 'postgresql://b:2@127.0.0.1:5432/aptio')).toBe(true);
    expect(mismaBase('postgresql://a@localhost:5432/aptio', 'postgresql://a@localhost:5432/aptio_restaurada')).toBe(false);
  });

  const enUso = { databaseUrl: 'postgresql://p:x@localhost:5432/aptio_scorm?schema=public', bucket: 'aptio-scorm-assets' };
  it('nunca restaura sobre lo que está en uso ni sin destino explícito', () => {
    const v = (destino: { databaseUrl?: string; bucket?: string }) => () => validarDestino({ destino, enUso, bucketRespaldos: 'aptio-scorm-respaldos' });
    expect(v({ bucket: 'nuevo' })).toThrow(ErrorRestauracion);
    expect(v({ databaseUrl: 'postgresql://p@localhost:5432/nueva' })).toThrow(/bucket de destino/);
    expect(v({ databaseUrl: 'postgresql://otro@127.0.0.1:5432/aptio_scorm', bucket: 'nuevo' })).toThrow(/en uso/);
    expect(v({ databaseUrl: 'postgresql://p@localhost:5432/nueva', bucket: 'aptio-scorm-assets' })).toThrow(/en uso/);
    expect(v({ databaseUrl: 'postgresql://p@localhost:5432/nueva', bucket: 'aptio-scorm-respaldos' })).toThrow(/respaldos/);
    expect(v({ databaseUrl: 'postgresql://p@localhost:5432/nueva', bucket: 'nuevo' })()).toEqual({ databaseUrl: 'postgresql://p@localhost:5432/nueva', bucket: 'nuevo' });
  });
});
