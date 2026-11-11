// HU-1201 · CP-090 · Validar antes de exportar: errores de esquema, peso estimado contra el límite del destino (nunca
// bloquea, advierte con alternativas), recursos más pesados, peor caso de suspend_data y pantallas sin aprobar.
import { describe, expect, it } from 'vitest';
import { codigoReproductor } from '../src/reproductor.ts';
import { construirScorm12 } from '../src/scorm12.ts';
import { ALTERNATIVAS_PESO, MB, type PesoRecurso, validarScorm12 } from '../src/validar.ts';
import { cursoLoto, recursosLoto } from './loto.ts';

const tamano = (d: Uint8Array | string) => (typeof d === 'string' ? Buffer.byteLength(d) : d.byteLength);
/** Los pesos de los recursos de prueba de LOTO, tal como los guarda la base de datos. */
const pesosLoto = (cambios: Record<string, number | null> = {}): PesoRecurso[] =>
  recursosLoto().map((r) => ({ id: r.id, nombre: r.nombre, bytes: r.id in cambios ? cambios[r.id]! : tamano(r.datos) }));

describe('validar SCORM 1.2 (HU-1201)', () => {
  it('CP-090 · un paquete de 300 MB advierte con las 5 alternativas y no da errores: se puede exportar igual', () => {
    const curso = cursoLoto();
    const v = validarScorm12(curso, pesosLoto({ 'vid-procedimiento': 300 * MB }), 50_000, 100);
    expect(v.errores).toEqual([]);
    expect(v.superaLimite).toBe(true);
    expect(v.pesoEstimadoMb).toBeGreaterThanOrEqual(300);
    expect(v.pesoEstimadoMb).toBeLessThan(301);
    expect(v.alternativas).toEqual([...ALTERNATIVAS_PESO]);
    expect(v.alternativas).toHaveLength(5);
    expect(v.advertencias[0]).toMatch(/^El paquete pesaría unos 300(\.\d)? MB y el límite de subida del destino es 100 MB \(valor de referencia/);
    expect(v.recursosPesados[0]).toEqual({ id: 'vid-procedimiento', nombre: expect.any(String), bytes: 300 * MB });
    expect(v.recursosPesados).toHaveLength(5);
    expect(v.recursosPesados.map((r) => r.bytes)).toEqual([...v.recursosPesados.map((r) => r.bytes)].sort((a, b) => b - a));
  });

  it('con la ficha del cliente lo dice; por debajo del límite no advierte por peso', () => {
    const curso = cursoLoto();
    expect(validarScorm12(curso, pesosLoto({ 'vid-procedimiento': 300 * MB }), 50_000, 250, { origenLimite: 'ficha' }).advertencias[0]).toContain('según la ficha de compatibilidad del cliente');
    const bajo = validarScorm12(curso, pesosLoto(), 50_000, 100);
    expect(bajo.superaLimite).toBe(false);
    expect(bajo.alternativas).toEqual([]);
    expect(bajo.advertencias.some((a) => a.includes('pesaría'))).toBe(false);
  });

  it('el peso estimado queda cerca del ZIP real (los recursos casi no se comprimen)', async () => {
    const curso = cursoLoto();
    const reproductor = await codigoReproductor();
    const real = (await construirScorm12({ curso, recursos: recursosLoto(), reproductor })).zip.byteLength;
    const v = validarScorm12(curso, pesosLoto(), Buffer.byteLength(reproductor), 100);
    // Con recursos de prueba diminutos pesa sobre todo el texto, que sí se comprime: la estimación queda por encima.
    expect(v.pesoEstimadoBytes).toBeGreaterThan(real);
    expect(v.pesoEstimadoBytes).toBeLessThan(real * 6);
  }, 30_000);

  it('el material del cliente no cuenta, y lo que no tiene archivo se avisa una vez con sus nombres', () => {
    const curso = cursoLoto();
    const conDoc = validarScorm12(curso, pesosLoto({ 'doc-pets-seg-014': 500 * MB }), 0, 100);
    expect(conDoc.superaLimite).toBe(false);
    const sinAudio = validarScorm12(curso, pesosLoto().filter((r) => !r.nombre.endsWith('.mp3')), 0, 100);
    expect(sinAudio.recursosFaltantes).toHaveLength(30);
    expect(sinAudio.advertencias.filter((a) => a.startsWith('Faltan'))).toEqual([expect.stringMatching(/^Faltan 30 archivos: «p01-es\.mp3», .* y 25 más\. El paquete muestra su texto alternativo\.$/)]);
  });

  it('cuenta las pantallas sin aprobar (RN-12-3) y no las cuenta si están aprobadas', () => {
    const curso = cursoLoto();
    expect(validarScorm12(curso, pesosLoto(), 0, 100)).toMatchObject({ pantallasTotal: 30, pantallasSinAprobar: 30 });
    for (const m of curso.modulos) for (const c of m.capsulas) for (const p of c.pantallas) (p as { estado?: string }).estado = 'aprobado';
    const v = validarScorm12(curso, pesosLoto(), 0, 100);
    expect(v.pantallasSinAprobar).toBe(0);
    expect(v.advertencias).toEqual([]);
  });

  it('el peor caso de suspend_data de LOTO cabe en 4096; uno enorme advierte sin ser error', () => {
    const curso = cursoLoto();
    const v = validarScorm12(curso, pesosLoto(), 0, 100);
    expect(v.suspendDataCaracteres).toBeGreaterThan(20);
    expect(v.suspendDataCaracteres).toBeLessThanOrEqual(4096);

    // 600 pantallas con actividad, cada una en su cápsula: los resultados no caben.
    const base = curso.modulos[0]!.capsulas[0]!;
    const p07 = base.pantallas.find((p) => p.id === 'p07')!;
    curso.modulos = [{ ...curso.modulos[0]!, capsulas: [{ ...base, pantallas: Array.from({ length: 600 }, (_, i) => ({ ...p07, id: `x${i}` })) }] }];
    const enorme = validarScorm12(curso, pesosLoto(), 0, 100);
    expect(enorme.suspendDataCaracteres).toBeGreaterThan(4096);
    expect(enorme.advertencias.some((a) => a.includes('suspend_data') && a.includes('4096'))).toBe(true);
  });

  it('un curso que no cumple el esquema da errores; sin la forma básica no lanza', () => {
    const roto = cursoLoto() as unknown as Record<string, unknown>;
    delete roto.seguimiento;
    expect(validarScorm12(roto, pesosLoto(), 0, 100).errores.length).toBeGreaterThan(0);
    const nada = validarScorm12({ hola: 1 }, [], 0, 100);
    expect(nada.errores.length).toBeGreaterThan(0);
    expect(nada.pantallasTotal).toBe(0);
  });
});
