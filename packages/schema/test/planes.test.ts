// HU-1702 · Reglas de los planes (REQ-082, CP-141, CP-142, RN-18-5).
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_PLANES_POR_DEFECTO, ahorroAnualDe, apagarOtrosDestacados, conIgv, igvDe, PLANES_DE_EJEMPLO, planesPublicos, type PlanGuardado, precioAnualDe, soles,
  validarAjustesPlanes, validarPlan, validarPlanCompleto,
} from '../src/planes.js';

const guardados = (): PlanGuardado[] => PLANES_DE_EJEMPLO.map((p, i) => ({ ...p, id: `id-${i}`, ficticio: true }));

describe('precios', () => {
  it('anual con el descuento global: S/ 490 → S/ 4,704, y S/ 1,290 → S/ 12,384', () => {
    expect(precioAnualDe({ precioMes: 490, precioAnual: null }, 20)).toBe(4704);
    expect(precioAnualDe({ precioMes: 1290, precioAnual: null }, 20)).toBe(12384);
    expect(ahorroAnualDe({ precioMes: 490, precioAnual: null }, 20)).toBe(1176);
  });

  it('el precio anual propio manda; a medida no tiene precio', () => {
    expect(precioAnualDe({ precioMes: 490, precioAnual: 5000 }, 20)).toBe(5000);
    expect(ahorroAnualDe({ precioMes: 490, precioAnual: 5000 }, 20)).toBe(880);
    expect(ahorroAnualDe({ precioMes: 490, precioAnual: 6000 }, 20)).toBe(0);
    expect(precioAnualDe({ precioMes: null, precioAnual: null }, 20)).toBeNull();
    expect(ahorroAnualDe({ precioMes: null, precioAnual: null }, 20)).toBeNull();
  });

  it('IGV de 18 % con dos decimales', () => {
    expect(igvDe(490)).toBe(88.2);
    expect(conIgv(490)).toBe(578.2);
    expect(conIgv(1390)).toBe(1640.2);
    expect(soles(1390)).toBe('S/ 1,390');
    expect(soles(578.2)).toBe('S/ 578.20');
  });
});

describe('destacado', () => {
  it('al destacar uno, se apagan los otros', () => {
    const p = guardados();
    expect(apagarOtrosDestacados(p, 'id-0')).toEqual(['id-1']);
    expect(apagarOtrosDestacados(p, 'id-1')).toEqual([]);
  });
});

describe('proyección pública (CP-142)', () => {
  it('solo los visibles, en orden, con sus características visibles', () => {
    const p = guardados();
    p[0]!.visible = false;
    p[1]!.caracteristicas[1]!.visible = false;
    p[2]!.orden = -1;
    const r = planesPublicos(p, AJUSTES_PLANES_POR_DEFECTO);
    expect(r.map((x) => x.slug)).toEqual(['empresa', 'productora']);
    expect(r[1]!.caracteristicas).not.toContain('Español e inglés');
    expect(r[1]).toMatchObject({ precioMes: 1290, precioAnual: 12384, ahorroAnual: 3096, precioMesConIgv: 1522.2, destacado: true, enlace: '/agendar-demo?plan=productora' });
    expect(r[0]).toMatchObject({ aMedida: true, precioMes: null, precioAnual: null, capsulaAdicional: null, textoBoton: 'Hablar con ventas' });
  });
});

describe('validación', () => {
  it('los planes de ejemplo son válidos', () => {
    for (const p of PLANES_DE_EJEMPLO) expect(validarPlanCompleto(p)).toEqual([]);
  });

  it('rechaza slug, textos, precios y características fuera de rango', () => {
    const malos = validarPlan({ slug: 'Con Espacios', nombre: '', precioMes: 0, capsulasMes: 1.5, destacado: 'si', caracteristicas: [{ texto: '', visible: true }] });
    expect(malos.map((e) => e.campo)).toEqual(expect.arrayContaining(['slug', 'nombre', 'precioMes', 'capsulasMes', 'destacado', 'caracteristicas[0]']));
    expect(validarPlan({ caracteristicas: Array.from({ length: 13 }, () => ({ texto: 'x', visible: true })) }, { parcial: true }).map((e) => e.campo)).toEqual(['caracteristicas']);
  });

  it('parcial: solo lo que viene; a medida sin anual ni adicional', () => {
    expect(validarPlan({ precioMes: 1390 }, { parcial: true })).toEqual([]);
    expect(validarPlanCompleto({ ...PLANES_DE_EJEMPLO[2]!, precioAnual: 100 }).map((e) => e.campo)).toEqual(['precioAnual']);
  });

  it('ajustes de la página de precios', () => {
    expect(validarAjustesPlanes(AJUSTES_PLANES_POR_DEFECTO)).toEqual([]);
    expect(validarAjustesPlanes({ mostrarAnual: 1, descuentoAnual: 95, conIgv: true }).map((e) => e.campo)).toEqual(['mostrarAnual', 'descuentoAnual']);
  });
});
