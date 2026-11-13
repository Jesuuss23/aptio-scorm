import { describe, expect, it } from 'vitest';
import { calcularRentabilidad, type Medicion, normalizarParametros, PARAMETROS_EJEMPLO, promediosMedidos } from '../src/rentabilidad.js';

const cerca = (n: number, d = 4) => Number(n.toFixed(d));

describe('rentabilidad (HU-1303, RN-13-1)', () => {
  it('con los supuestos del prototipo da sus mismos números', () => {
    const r = calcularRentabilidad(PARAMETROS_EJEMPLO);
    expect(r).toMatchObject({ fuente: 'supuestos', horasHoy: 150, horasGenerador: 25.5, proyectosMedidos: { hoy: 0, generador: 0 }, respaldo: { hoy: 'supuestos', generador: 'supuestos' } });
    // Capacidad: 3 personas × 6 h × 22 días = 396 h al mes.
    expect(cerca(r.scormMesHoy)).toBe(2.64);
    expect(cerca(r.scormMesGenerador)).toBe(15.5294);
    // Hoy: 150 h × S/ 22 + S/ 900 ÷ 2,64. Generador: 25,5 h × 22 + US$ 7 × 3,75 + S/ 650 ÷ 15,53.
    expect(cerca(r.costoHoy, 2)).toBe(3640.91);
    expect(cerca(r.costoGenerador, 2)).toBe(629.11);
    expect(cerca(r.diasHoy)).toBe(14.3333);
    expect(cerca(r.diasGenerador)).toBe(3.4167);
    expect(cerca(r.margenCompetenciaHoy)).toBe(-1.4273);
    expect(cerca(r.margenCompetenciaGenerador)).toBe(0.5806);
    expect(cerca(r.margenPrecioNuevo)).toBe(0.6505);
    expect(r.etapas).toHaveLength(8);
    expect(r.etapas[0]).toEqual({ etapa: 'lectura-guion', nombre: 'Lectura del material y guion', horasHoy: 20, horasGenerador: 4 });
  });

  it('protege las divisiones entre cero', () => {
    const p = { ...PARAMETROS_EJEMPLO, personas: 0, precioCompetencia: 0, precioNuevo: 0, etapas: PARAMETROS_EJEMPLO.etapas.map((e) => ({ ...e, horasGenerador: 0 })) };
    const r = calcularRentabilidad(p);
    for (const v of [r.scormMesHoy, r.scormMesGenerador, r.diasHoy - 6, r.margenCompetenciaHoy, r.margenPrecioNuevo]) expect(v).toBe(0);
    // Sin SCORM al mes, las licencias cuentan enteras.
    expect(r.costoGenerador).toBe(7 * 3.75 + 650);
    expect(Object.values(r).every((v) => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
  });

  it('completa lo guardado con el ejemplo y deja las 8 etapas en orden', () => {
    const p = normalizarParametros({ tarifaHora: 30, personas: -2, precioHoy: 'mil', etapas: [{ etapa: 'boca', horasHoy: 10, horasGenerador: 1 }, { etapa: 'otra', horasHoy: 99, horasGenerador: 99 }] });
    expect(p.tarifaHora).toBe(30);
    expect(p.personas).toBe(3);
    expect(p.precioHoy).toBe(4500);
    expect(p.etapas.map((e) => e.etapa)).toEqual(['lectura-guion', 'diseno-grafico', 'animacion', 'audio', 'boca', 'ingles', 'correcciones', 'empaquetado']);
    expect(p.etapas[4]).toEqual({ etapa: 'boca', horasHoy: 10, horasGenerador: 1 });
  });

  it('CP-098 · con mediciones de 2 proyectos usa el promedio de cada etapa; un escenario sin mediciones usa los supuestos', () => {
    const m: Medicion[] = [
      { proyectoRef: 'Bloqueo y etiquetado', escenario: 'hoy', etapa: 'lectura-guion', horas: 18 },
      { proyectoRef: 'Bloqueo y etiquetado', escenario: 'hoy', etapa: 'diseno-grafico', horas: 50 },
      { proyectoRef: ' bloqueo  Y etiquetado ', escenario: 'hoy', etapa: 'diseno-grafico', horas: 10 },
      { proyectoRef: 'Trabajo en altura', escenario: 'hoy', etapa: 'lectura-guion', horas: 22 },
      { proyectoRef: 'Trabajo en altura', escenario: 'hoy', etapa: 'animacion', horas: 40 },
    ];
    const prom = promediosMedidos(m);
    expect(prom.generador).toBeNull();
    expect(prom.hoy!.proyectos).toBe(2);
    expect(prom.hoy!.horas).toMatchObject({ 'lectura-guion': 20, 'diseno-grafico': 30, animacion: 20, boca: 0 });

    const r = calcularRentabilidad(PARAMETROS_EJEMPLO, 'mediciones', m);
    expect(r).toMatchObject({ fuente: 'mediciones', horasHoy: 70, horasGenerador: 25.5, proyectosMedidos: { hoy: 2, generador: 0 }, respaldo: { hoy: 'mediciones', generador: 'supuestos' } });
    // 70 h × 22 + 900 ÷ (396 ÷ 70).
    expect(cerca(r.costoHoy, 2)).toBe(1699.09);
    expect(cerca(r.margenCompetenciaHoy)).toBe(cerca((1500 - r.costoHoy) / 1500));

    // Con «supuestos» las mediciones no cuentan.
    expect(calcularRentabilidad(PARAMETROS_EJEMPLO, 'supuestos', m).horasHoy).toBe(150);
  });
});
