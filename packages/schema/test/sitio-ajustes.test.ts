// HU-1509 · Ajustes del sitio (REQ-073): validación y normalización de dominio, nombre, analítica, WhatsApp, correo de
// leads y mantenimiento; lo que entra en la versión; el enlace de WhatsApp y los archivos de marca.
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_POR_DEFECTO, ajustesPublicados, aplicarCambiosAjustes, enlaceWhatsapp, esArchivoMarca, esPng, leerAjustes, nombreArchivoMarca,
} from '../src/sitio-ajustes.js';
import { armarInstantanea, hayPendientes } from '../src/sitio-versiones.js';

const aplicar = (c: Parameters<typeof aplicarCambiosAjustes>[1]) => aplicarCambiosAjustes(AJUSTES_POR_DEFECTO, c, new Date('2026-11-13T15:00:00Z'));
const campos = (r: ReturnType<typeof aplicar>) => (r.ok ? [] : r.errores.map((e) => e.campo));

describe('ajustes del sitio (HU-1509)', () => {
  it('normaliza y acepta valores válidos; un texto vacío se guarda como null', () => {
    const r = aplicar({
      dominio: ' AptioScorm.com. ', nombre: '  Aptio SCORM Perú ', analitica: { ga4: 'g-ab12cd34ef', gtm: 'gtm-ab12cd3', metaPixel: '123456789012345' },
      whatsapp: { visible: true, numero: '+51 987 654 321', mensaje: 'Hola, quiero una demo' }, correoLeads: ' Ventas@AulasEducativas.com ',
    });
    expect(r.ok && r.ajustes).toMatchObject({
      dominio: 'aptioscorm.com', nombre: 'Aptio SCORM Perú', analitica: { ga4: 'G-AB12CD34EF', gtm: 'GTM-AB12CD3', metaPixel: '123456789012345' },
      whatsapp: { visible: true, numero: '+51987654321', mensaje: 'Hola, quiero una demo' }, correoLeads: 'ventas@aulaseducativas.com',
    });
    const vacios = aplicar({ dominio: '', correoLeads: '  ', analitica: { ga4: '' } });
    expect(vacios.ok && [vacios.ajustes.dominio, vacios.ajustes.correoLeads, vacios.ajustes.analitica.ga4]).toEqual([null, null, null]);
  });

  it('rechaza cada campo mal escrito con su mensaje', () => {
    expect(campos(aplicar({ dominio: 'https://aptioscorm.com/precios' }))).toEqual(['dominio']);
    expect(campos(aplicar({ dominio: 'localhost' }))).toEqual(['dominio']);
    expect(campos(aplicar({ nombre: '' }))).toEqual(['nombre']);
    expect(campos(aplicar({ nombre: '<b>Aptio</b>' }))).toEqual(['nombre']);
    expect(campos(aplicar({ nombre: 'x'.repeat(61) }))).toEqual(['nombre']);
    expect(campos(aplicar({ analitica: { ga4: 'UA-1234', gtm: 'GTM', metaPixel: 'abc' } }))).toEqual(['analitica.ga4', 'analitica.gtm', 'analitica.metaPixel']);
    expect(campos(aplicar({ whatsapp: { numero: '987654321' } }))).toEqual(['whatsapp.numero']);
    expect(campos(aplicar({ whatsapp: { visible: true } }))).toEqual(['whatsapp.numero']);
    expect(campos(aplicar({ whatsapp: { mensaje: '<script>x</script>' } }))).toEqual(['whatsapp.mensaje']);
    expect(campos(aplicar({ correoLeads: 'ventas@' }))).toEqual(['correoLeads']);
    expect(campos(aplicar({ mantenimiento: { mensaje: 'x'.repeat(281) } }))).toEqual(['mantenimiento.mensaje']);
  });

  it('al activar el mantenimiento anota desde cuándo; al desactivarlo lo borra', () => {
    const on = aplicar({ mantenimiento: { activo: true, mensaje: 'Volvemos a las 3 p. m.' } });
    expect(on.ok && on.ajustes.mantenimiento).toEqual({ activo: true, mensaje: 'Volvemos a las 3 p. m.', desde: '2026-11-13T15:00:00.000Z' });
    const off = on.ok ? aplicarCambiosAjustes(on.ajustes, { mantenimiento: { activo: false } }) : null;
    expect(off?.ok && off.ajustes.mantenimiento).toEqual({ activo: false, mensaje: 'Volvemos a las 3 p. m.', desde: null });
  });

  it('solo nombre, dominio, marca y WhatsApp visible entran en la versión; sin fila no cambia la instantánea', () => {
    const r = aplicar({ whatsapp: { numero: '+51987654321' }, correoLeads: 'a@b.pe', mantenimiento: { activo: true } });
    expect(r.ok && ajustesPublicados(r.ajustes)).toEqual({ nombre: 'Aptio SCORM', dominio: null, logo: null, favicon: null, whatsapp: null });
    const datos = { paginas: [], elementos: [], enlaces: [] };
    expect(armarInstantanea(datos, 'pruebas')).not.toHaveProperty('sitio');
    expect(hayPendientes(armarInstantanea({ ...datos, ajustes: AJUSTES_POR_DEFECTO }, 'pruebas'), armarInstantanea(datos, 'pruebas'))).toBe(true);
  });

  it('enlace de WhatsApp, nombres de marca, PNG y lectura tolerante', () => {
    expect(enlaceWhatsapp({ numero: '+51987654321', mensaje: 'Hola & demo' })).toBe('https://wa.me/51987654321?text=Hola%20%26%20demo');
    expect(enlaceWhatsapp({ numero: '+51987654321', mensaje: null })).toBe('https://wa.me/51987654321');
    expect(nombreArchivoMarca('logo', 'abcdef0123456789', 'image/png')).toBe('logo-abcdef01.png');
    expect([esArchivoMarca('favicon-abcdef01.svg'), esArchivoMarca('../x.svg'), esArchivoMarca('logo-ABCDEF01.svg')]).toEqual([true, false, false]);
    expect(esPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(esPng(new TextEncoder().encode('<svg/>'))).toBe(false);
    expect(leerAjustes({ nombre: '', logo: { archivo: '../../x', mime: 'image/png' }, whatsapp: { visible: true } })).toMatchObject({ nombre: 'Aptio SCORM', logo: null, whatsapp: { visible: true, numero: null } });
  });
});
