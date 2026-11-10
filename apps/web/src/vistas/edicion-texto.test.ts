// HU-0601 · CP-056: el cuerpo que se guarda al terminar de escribir en el lienzo.
import type { PantallaDoc } from '@aptio/schema/revision';
import { describe, expect, it } from 'vitest';
import { edicionDe, esEditable, esTituloDePantalla } from './edicion-texto';

const pantalla: PantallaDoc = {
  id: 'p01', titulo: { es: 'Bloqueo y etiquetado', en: 'Lockout and tagout' }, tipo: 'portada', estado: 'aprobado', obligatoria: true,
  bloques: [
    { id: 'p01-titulo', tipo: 'texto', rol: 'titulo', contenido: { es: 'Bloqueo y etiquetado', en: 'Lockout and tagout' } },
    { id: 'p01-subtitulo', tipo: 'texto', rol: 'subtitulo', contenido: { es: 'Cápsula de seguridad' } },
    { id: 'p01-numero', tipo: 'texto', rol: 'titulo', contenido: { es: '01' } },
    { id: 'p01-ana', tipo: 'personaje' },
  ],
};

describe('edición en el lugar', () => {
  it('el título de la pantalla se guarda como título y conserva el inglés', () => {
    expect(edicionDe(pantalla, 'p01-titulo', '  Bloqueo   y etiquetado seguro ')).toEqual({
      tipo: 'cambio', cambio: { titulo: { es: 'Bloqueo y etiquetado seguro', en: 'Lockout and tagout' } },
    });
  });

  it('otro texto se guarda en textos con su bloque', () => {
    expect(edicionDe(pantalla, 'p01-subtitulo', 'Cápsula de 15 minutos')).toEqual({
      tipo: 'cambio', cambio: { textos: { 'p01-subtitulo': { es: 'Cápsula de 15 minutos' } } },
    });
    // Solo el primer texto con rol título es el de la pantalla.
    expect(esTituloDePantalla(pantalla, 'p01-numero')).toBe(false);
    expect(edicionDe(pantalla, 'p01-numero', '02')).toEqual({ tipo: 'cambio', cambio: { textos: { 'p01-numero': { es: '02' } } } });
  });

  it('un texto vacío no se guarda y uno igual no crea una versión', () => {
    expect(edicionDe(pantalla, 'p01-subtitulo', ' \n ')).toEqual({ tipo: 'vacio' });
    expect(edicionDe(pantalla, 'p01-titulo', 'Bloqueo y\netiquetado')).toEqual({ tipo: 'sin-cambios' });
  });

  it('solo los bloques de texto se editan', () => {
    expect(esEditable(pantalla, 'p01-subtitulo')).toBe(true);
    expect(esEditable(pantalla, 'p01-ana')).toBe(false);
    expect(() => edicionDe(pantalla, 'p01-ana', 'Ana')).toThrow(/no tiene el texto/);
  });
});
