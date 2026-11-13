import { describe, expect, it } from 'vitest';
import { rangoPeriodo } from './costos-periodo';

describe('periodos del resumen de costos (HU-1302)', () => {
  it('este mes y el anterior, en días de Lima', () => {
    expect(rangoPeriodo('mes', new Date('2026-11-13T15:00:00Z'))).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(rangoPeriodo('anterior', new Date('2026-11-13T15:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    // El 1/12 a las 03:00 UTC todavía es 30/11 en Lima.
    expect(rangoPeriodo('mes', new Date('2026-12-01T03:00:00Z'))).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
  });

  it('enero vuelve a diciembre del año anterior, febrero bisiesto y «Todo» sin filtro', () => {
    expect(rangoPeriodo('anterior', new Date('2027-01-10T15:00:00Z'))).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
    expect(rangoPeriodo('mes', new Date('2028-02-10T15:00:00Z'))).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoPeriodo('todo', new Date())).toEqual({});
  });
});
