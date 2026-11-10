import { describe, expect, it } from 'vitest';
import { avanceDe, estimar, perfilPropuesto } from '../src/proyecto.js';

describe('proyectos', () => {
  it('CP-032: 48 h, 50 % en SCORM y 30 pantallas por SCORM → 1.200 pantallas y 40 SCORM', () => {
    expect(estimar({ horas: 48, porcentajeScorm: 50, pantallasPorScorm: 30 })).toEqual({ pantallas: 1200, scorm: 40, meses: null });
  });

  it('los supuestos son editables y los meses salen solo con la capacidad del equipo', () => {
    expect(estimar({ horas: 48, porcentajeScorm: 50, minutosPorPantalla: 1.5, pantallasPorScorm: 20, scormPorMes: 8 })).toEqual({ pantallas: 960, scorm: 48, meses: 6 });
    expect(estimar({ horas: 0, porcentajeScorm: 50 })).toBeNull();
    expect(estimar({ horas: 10, porcentajeScorm: 50, minutosPorPantalla: 0 })).toBeNull();
  });

  it('CP-031: sin LMS el perfil propuesto es Genérico', () => {
    expect(perfilPropuesto(null)).toBe('GENERICO');
    expect(perfilPropuesto({})).toBe('GENERICO');
    expect(perfilPropuesto({ lms: 'Aún no se sabe' })).toBe('GENERICO');
    expect(perfilPropuesto({ lms: 'Otro LMS' })).toBe('GENERICO');
    expect(perfilPropuesto({ lms: 'Moodle 4.5 o superior' })).toBe('MOODLE');
    expect(perfilPropuesto({ lms: 'canvas' })).toBe('CANVAS');
  });

  it('el avance cuenta las pantallas aprobadas del curso', () => {
    const doc = { modulos: [{ capsulas: [{ pantallas: [{ estado: 'aprobado' }, { estado: 'borrador' }] }, { pantallas: [{ estado: 'aprobado' }] }] }] };
    expect(avanceDe(doc)).toEqual({ aprobadas: 2, total: 3 });
    expect(avanceDe(null)).toEqual({ aprobadas: 0, total: 0 });
  });
});
