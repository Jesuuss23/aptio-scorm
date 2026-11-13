// HU-1512 · Reglas del SEO técnico: límites 60/160 y texto plano, canonical, datos estructurados, redirecciones sin
// cadenas, bucles ni colisiones, robots.txt línea por línea, la revisión de problemas (PNT-29) y la instantánea (CP-125).
import { describe, expect, it } from 'vitest';
import {
  analizarSeo, aplicarCambiosSeo, leerSeo, normalizarRuta, redireccionDe, type Redireccion, SEO_POR_DEFECTO, seoPublicado, tituloDePagina, validarCanonical,
  validarRedireccion, validarRobotsExtra,
} from '../src/sitio-seo.js';
import { alternasDe, armarInstantanea, hayPendientes, type FilaPagina } from '../src/sitio-versiones.js';

const campos = (r: { ok: boolean; errores?: { campo: string }[] }) => (r.ok ? [] : (r.errores ?? []).map((e) => e.campo));

describe('SEO de una página', () => {
  it('meta título hasta 60 y meta descripción hasta 160, en texto plano; vacío se guarda null', () => {
    const ok = aplicarCambiosSeo(SEO_POR_DEFECTO, { metaTitulo: ` ${'t'.repeat(60)} `, metaDescripcion: 'd'.repeat(160), indexar: false, datosEstructurados: 'FAQPage' });
    expect(ok).toEqual({ ok: true, datos: { metaTitulo: 't'.repeat(60), metaDescripcion: 'd'.repeat(160), canonical: null, indexar: false, datosEstructurados: 'FAQPage' } });
    expect(campos(aplicarCambiosSeo(SEO_POR_DEFECTO, { metaTitulo: 't'.repeat(61), metaDescripcion: 'd'.repeat(161) }))).toEqual(['metaTitulo', 'metaDescripcion']);
    expect(campos(aplicarCambiosSeo(SEO_POR_DEFECTO, { metaTitulo: '<b>Hola</b>', metaDescripcion: 'a <script>x</script>', datosEstructurados: 'Article' }))).toEqual(['metaTitulo', 'metaDescripcion', 'datosEstructurados']);
    expect(aplicarCambiosSeo({ ...SEO_POR_DEFECTO, metaTitulo: 'Antes' }, { metaTitulo: '   ' })).toMatchObject({ ok: true, datos: { metaTitulo: null } });
  });

  it('canonical: ruta interna o https:// con dominio', () => {
    expect(validarCanonical('/precios/')).toEqual({ ok: true, canonical: '/precios' });
    expect(validarCanonical('https://Otro.pe/precios')).toEqual({ ok: true, canonical: 'https://otro.pe/precios' });
    expect(validarCanonical('')).toEqual({ ok: true, canonical: null });
    for (const mal of ['http://otro.pe', 'javascript:alert(1)', '//otro.pe', 'https://a:b@otro.pe', 'https://otro.pe:8443/x', 'https://intranet', '/Precios']) expect(validarCanonical(mal).ok).toBe(false);
  });

  it('las filas de antes leen los valores por defecto y la instantánea solo guarda lo que no es por defecto', () => {
    expect(leerSeo({})).toEqual(SEO_POR_DEFECTO);
    expect(leerSeo({ datosEstructurados: 'Raro', indexar: null })).toEqual(SEO_POR_DEFECTO);
    expect(seoPublicado({}, false)).toBeUndefined();
    expect(seoPublicado({ metaTitulo: 'T', metaDescripcion: 'D', canonical: '/x', indexar: false, datosEstructurados: 'Product' }, false)).toEqual({ titulo: 'T', descripcion: 'D', canonical: '/x', indexar: false, datos: 'Product' });
    // En una landing el meta título ya viaja en su sector.
    expect(seoPublicado({ metaTitulo: 'T' }, true)).toBeUndefined();
  });

  it('el título: el meta título o el de la página con el nombre del sitio', () => {
    expect(tituloDePagina({ ruta: '/', titulo: 'Inicio' }, 'Aptio SCORM')).toBe('Aptio SCORM · Inicio');
    expect(tituloDePagina({ ruta: '/precios', titulo: 'Precios' }, 'Aptio SCORM')).toBe('Precios · Aptio SCORM');
    expect(tituloDePagina({ ruta: '/precios', titulo: 'Precios', metaTitulo: 'Planes y precios' }, 'Aptio SCORM')).toBe('Planes y precios');
  });
});

describe('redirecciones 301', () => {
  const otras: Redireccion[] = [
    { id: '1', desde: '/precios-2025', hacia: '/precios', activa: true },
    { id: '2', desde: '/viejo', hacia: '/nuevo', activa: false },
  ];
  const publicadas = ['/', '/precios', '/en/pricing'];
  const codigo = (desde: string, hacia: string, activa = true) => {
    const r = validarRedireccion({ desde, hacia, activa }, otras, publicadas);
    return r.ok ? 'ok' : r.codigo;
  };

  it('normaliza las rutas internas y rechaza lo que no lo es', () => {
    expect(normalizarRuta(' /promo/ ')).toBe('/promo');
    expect(normalizarRuta('/')).toBe('/');
    for (const mal of ['promo', '/Promo', '/promo.html', 'https://x.pe/promo', '/a b', '//x']) expect(normalizarRuta(mal)).toBeNull();
    expect(validarRedireccion({ desde: ' /promo/ ', hacia: '/precios' }, otras, publicadas)).toEqual({ ok: true, redireccion: { desde: '/promo', hacia: '/precios', activa: true } });
    expect(codigo('/', '/precios')).toBe('REDIRECCION_INVALIDA');
    expect(codigo('/promo', 'https://otro.pe')).toBe('REDIRECCION_INVALIDA');
  });

  it('rechaza ir a sí misma, repetir el origen, bucles, cadenas y pisar una página publicada', () => {
    expect(codigo('/promo', '/promo')).toBe('REDIRECCION_A_SI_MISMA');
    expect(codigo('/precios-2025', '/inicio')).toBe('REDIRECCION_REPETIDA');
    expect(codigo('/precios', '/precios-2025')).toBe('REDIRECCION_PISA_PAGINA');
    expect(codigo('/en/pricing', '/en')).toBe('REDIRECCION_PISA_PAGINA');
    // Bucle: /precios-2025 → /precios ya existe; /a → /b y /b → /a.
    expect(validarRedireccion({ desde: '/b', hacia: '/a' }, [{ desde: '/a', hacia: '/b', activa: true }], [])).toMatchObject({ ok: false, codigo: 'REDIRECCION_EN_BUCLE' });
    // Cadena hacia adelante (A → B y B → C) y hacia atrás (C → A y A → B).
    expect(codigo('/promo', '/precios-2025')).toBe('REDIRECCION_EN_CADENA');
    expect(validarRedireccion({ desde: '/precios', hacia: '/planes' }, otras, [])).toMatchObject({ ok: false, codigo: 'REDIRECCION_EN_CADENA', errores: [{ campo: 'desde' }] });
    // Las inactivas no cuentan para cadenas ni bucles, y una inactiva no se compara con las páginas.
    expect(codigo('/nuevo', '/otra')).toBe('ok');
    expect(codigo('/promo', '/precios-2025', false)).toBe('ok');
    expect(codigo('/precios', '/x', false)).toBe('ok');
  });

  it('la redirección de una ruta pedida', () => {
    const r = [{ desde: '/precios-2025', hacia: '/precios' }];
    expect(redireccionDe(r, '/precios-2025/?utm=x')).toBe('/precios');
    expect(redireccionDe(r, '/precios')).toBeNull();
    expect(redireccionDe(undefined, '/precios-2025')).toBeNull();
  });
});

describe('robots.txt', () => {
  it('acepta Allow, Disallow y comentarios, y normaliza la directiva', () => {
    expect(validarRobotsExtra('# Panel interno\r\ndisallow:/panel\nAllow: /panel/ayuda\n\n\n')).toEqual({ ok: true, robotsExtra: '# Panel interno\nDisallow: /panel\nAllow: /panel/ayuda' });
    expect(validarRobotsExtra('')).toEqual({ ok: true, robotsExtra: '' });
    expect(validarRobotsExtra(null)).toEqual({ ok: true, robotsExtra: '' });
  });

  it('rechaza HTML, otras directivas, rutas sin / y bloquear el sitio entero, con el número de línea', () => {
    const r = validarRobotsExtra('Disallow: /ok\n<script>x</script>\nUser-agent: GPTBot\nSitemap: https://x.pe/s.xml\nDisallow: panel\nDisallow: /\nDisallow: /*\nDisallow:');
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['robotsExtra.2', 'robotsExtra.3', 'robotsExtra.4', 'robotsExtra.5', 'robotsExtra.6', 'robotsExtra.7', 'robotsExtra.8']);
    expect(r.ok ? '' : r.errores[0]!.mensaje).toBe('Línea 2: solo texto, sin etiquetas HTML');
    expect(validarRobotsExtra('Disallow: /x\n'.repeat(51)).ok).toBe(false);
  });
});

describe('revisión de problemas (PNT-29)', () => {
  const pagina = (id: string, extra: Record<string, unknown> = {}) => ({ id, ruta: `/${id}`, idioma: 'es', titulo: id, estado: 'PUBLICADA', metaTitulo: null, metaDescripcion: 'Una descripción.', indexar: true, ...extra });

  it('encuentra descripciones faltantes o largas, títulos largos, páginas sin indexar y redirecciones rotas, de más a menos grave', () => {
    const problemas = analizarSeo({
      nombreSitio: 'Aptio SCORM',
      paginas: [
        pagina('bien'),
        pagina('sin', { metaDescripcion: null }),
        pagina('larga', { metaDescripcion: 'd'.repeat(161), metaTitulo: 't'.repeat(61) }),
        pagina('titulo-de-pagina-muy-largo-sin-meta-titulo-que-pasa-de-sesenta', { metaDescripcion: 'ok' }),
        pagina('oculta', { indexar: false }),
        pagina('borrador', { estado: 'BORRADOR' }),
      ],
      redirecciones: [
        { id: 'r1', desde: '/vieja', hacia: '/bien', activa: true },
        { id: 'r2', desde: '/rota', hacia: '/no-existe', activa: true },
        { id: 'r3', desde: '/a-borrador', hacia: '/borrador', activa: true },
        { id: 'r4', desde: '/bien', hacia: '/', activa: true },
        { id: 'r5', desde: '/inactiva', hacia: '/no-existe', activa: false },
      ],
    });
    expect(problemas.map((p) => [p.severidad, p.tipo, p.paginaId ?? p.redireccionId])).toEqual([
      ['alta', 'sin-descripcion', 'sin'],
      ['alta', 'redireccion-sin-destino', 'r2'],
      ['media', 'descripcion-larga', 'larga'],
      ['media', 'titulo-largo', 'larga'],
      ['media', 'titulo-largo', 'titulo-de-pagina-muy-largo-sin-meta-titulo-que-pasa-de-sesenta'],
      ['media', 'redireccion-sin-destino', 'r3'],
      ['baja', 'sin-indexar', 'oculta'],
      ['baja', 'redireccion-tapada', 'r4'],
    ]);
    expect(problemas[0]!.detalle).toBe('sin (/sin): los buscadores muestran el texto general del sitio.');
  });
});

describe('el SEO en la instantánea', () => {
  const fila = (ruta: string, idioma: string, extra: Partial<FilaPagina> = {}): FilaPagina => ({ ruta, idioma, titulo: ruta, estado: 'PUBLICADA', publicadaEn: null, bloques: [], ...extra });

  it('guarda el SEO de cada página, las redirecciones activas y las reglas extra; sin ellos, igual que antes', () => {
    const antes = armarInstantanea({ paginas: [fila('/', 'es')], elementos: [], enlaces: [] }, 'produccion');
    expect(antes).toEqual({ formato: 1, paginas: [{ ruta: '/', idioma: 'es', titulo: '/', publicadaEn: null, bloques: [] }], navegacion: { menu: [], pie: [] } });
    expect(hayPendientes(armarInstantanea({ paginas: [fila('/', 'es', { indexar: true, datosEstructurados: 'WebPage' })], elementos: [], enlaces: [], redirecciones: [], robotsExtra: '' }, 'produccion'), antes)).toBe(false);
    const con = armarInstantanea({
      paginas: [fila('/', 'es', { metaDescripcion: 'Hola', indexar: false })], elementos: [], enlaces: [],
      redirecciones: [{ desde: '/z', hacia: '/', activa: true }, { desde: '/a', hacia: '/', activa: true }, { desde: '/off', hacia: '/', activa: false }], robotsExtra: 'Disallow: /panel',
    }, 'produccion');
    expect(con.paginas[0]!.seo).toEqual({ descripcion: 'Hola', indexar: false });
    expect(con.redirecciones).toEqual([{ desde: '/a', hacia: '/' }, { desde: '/z', hacia: '/' }]);
    expect(con.robotsExtra).toBe('Disallow: /panel');
    expect(hayPendientes(con, antes)).toBe(true);
  });

  it('CP-125: una página sin indexar no tiene alternas hreflang ni es alterna de la otra', () => {
    const ambas = armarInstantanea({ paginas: [fila('/precios', 'es'), fila('/precios', 'en')], elementos: [], enlaces: [] }, 'produccion');
    expect(alternasDe(ambas, '/precios')).toHaveLength(2);
    const sinEn = armarInstantanea({ paginas: [fila('/precios', 'es'), fila('/precios', 'en', { indexar: false })], elementos: [], enlaces: [] }, 'produccion');
    expect(alternasDe(sinEn, '/precios')).toEqual([]);
  });
});
