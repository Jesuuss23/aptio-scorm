// HU-1601 · El formulario de contacto del sitio pre-renderizado: funciona sin JavaScript, lleva los campos de
// atribución que llena el script de captación y la CSP solo deja pasar scripts del mismo origen.
import { describe, expect, it } from 'vitest';
import { PARAMETROS_UTM } from '@aptio/schema/leads';
import { ARCHIVO_CAPTACION, CLAVE_SESION, SCRIPT_CAPTACION } from '../src/captacion.js';
import { instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizarErrorFormulario, renderizarPagina, renderizarSitio, sinJsonLd, sinScriptsOpcionales, tieneFormulario } from '../src/render.js';
import { cabecerasSitio, POLITICA_CONTENIDO, resolverPedido } from '../src/servir.js';

const op = { entorno: 'produccion' as const, sitioUrl: 'https://aptioscorm.com', base: '/s', anio: 2026 };
/** El control con `name` y el texto de su etiqueta `for`. */
const etiquetaDe = (html: string, name: string, tag = 'input') => {
  const control = new RegExp(`<${tag} [^>]*name="${name}"[^>]*>`).exec(html)![0];
  const id = /id="([^"]+)"/.exec(control)![1]!;
  return { tag: control, etiqueta: new RegExp(`<label for="${id}">(.*?)</label>`).exec(html)![1]!.replace(/<[^>]+>/g, '') };
};
const conFormulario = (ruta = '/', idioma = 'es') => {
  const inst = instantaneaDeEjemplo();
  inst.paginas.find((p) => p.ruta === ruta && p.idioma === idioma)!.bloques.push({ tipo: 'formulario_contacto', ajustes: null });
  return inst;
};

describe('bloque Formulario de contacto', () => {
  it('es un formulario HTML que se envía sin JavaScript a {base}/_lead, con consentimiento, trampa y atribución', () => {
    const html = renderizarPagina(conFormulario('/funcionalidades/personaje'), '/funcionalidades/personaje', 'es', op)!;
    const form = /<form [^>]*>/.exec(html)![0];
    for (const at of ['class="fcontacto"', 'method="post"', 'action="/s/_lead"', 'data-captacion=""']) expect(form).toContain(at);
    // Cada campo con su etiqueta (el orden de los atributos lo decide React).
    for (const [nombre, etiqueta, attrs] of [
      ['nombre', 'Nombre', ['type="text"', 'required=""', 'maxLength="120"', 'autoComplete="name"']],
      ['correo', 'Correo de trabajo', ['type="email"', 'required=""', 'maxLength="254"', 'autoComplete="email"']],
      ['empresa', 'Empresa (opcional)', ['type="text"', 'maxLength="160"', 'autoComplete="organization"']],
    ] as const) {
      const control = etiquetaDe(html, nombre);
      expect(control.etiqueta).toBe(etiqueta);
      for (const a of attrs) expect(control.tag).toContain(a);
    }
    expect(etiquetaDe(html, 'mensaje', 'textarea')).toMatchObject({ etiqueta: 'Mensaje (opcional)' });
    // Ley 29733: la casilla es obligatoria.
    const acepto = etiquetaDe(html, 'consentimiento');
    for (const a of ['type="checkbox"', 'required=""', 'value="on"']) expect(acepto.tag).toContain(a);
    expect(acepto.etiqueta).toContain('(Ley 29733).');
    // El campo trampa no lo ve ni lo alcanza una persona.
    const trampa = etiquetaDe(html, 'website');
    expect(trampa.tag).toContain('tabindex="-1"');
    expect(html).toMatch(/<p class="fc-trampa" aria-hidden="true"><label for="[^"]+">No llenes este campo<\/label><input [^>]*name="website"/);
    expect(html).toContain('<input type="hidden" name="via" value="formulario"/>');
    expect(html).toContain('<input type="hidden" name="paginaFormulario" value="/funcionalidades/personaje"/>');
    for (const campo of ['paginaEntrada', 'referente', ...PARAMETROS_UTM]) expect(html).toContain(`<input type="hidden" name="${campo}" value=""/>`);
    expect(html).toContain('<button class="btn primary" type="submit">Enviar</button>');
    // Sigue con un solo h1 y sin manejadores en línea.
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('en inglés lleva sus textos, su idioma y su ruta pública', () => {
    const html = renderizarPagina(conFormulario('/', 'en'), '/', 'en', op)!;
    expect(html).toContain('<label for="b-');
    expect(html).toContain('Work email');
    expect(html).toContain('<input type="hidden" name="idioma" value="en"/>');
    expect(html).toContain('<input type="hidden" name="paginaFormulario" value="/en"/>');
  });

  it('la casilla enlaza la política de privacidad solo si está publicada en el mismo idioma', () => {
    const inst = conFormulario();
    expect(renderizarPagina(inst, '/', 'es', op)).toContain('(Ley 29733).</label>');
    inst.paginas.push({ ruta: '/privacidad', idioma: 'es', titulo: 'Privacidad', publicadaEn: '2026-11-01T00:00:00.000Z', bloques: [] });
    expect(renderizarPagina(inst, '/', 'es', op)).toContain('(Ley 29733). <a href="/s/privacidad">Política de privacidad</a></label>');
  });
});

describe('script de captación', () => {
  it('solo las versiones con formulario lo cargan, en todas sus páginas, del mismo origen y junto al de popups (HU-1603)', () => {
    const sin = instantaneaDeEjemplo();
    expect(tieneFormulario(sin)).toBe(false);
    expect(sinScriptsOpcionales(renderizarPagina(sin, '/', 'es', op)!)).not.toContain('<script');
    expect(renderizarSitio(sin, op).map((a) => a.archivo)).not.toContain(ARCHIVO_CAPTACION);

    const inst = conFormulario('/funcionalidades/personaje');
    expect(tieneFormulario(inst)).toBe(true);
    // También en el inicio, que no tiene el formulario: ahí llega la visita con su UTM.
    const inicio = sinJsonLd(renderizarPagina(inst, '/', 'es', op)!);
    expect(inicio.match(/<script[^>]*>/g)).toEqual(['<script src="/s/_captacion.js" defer="" data-base="/s">', '<script src="/s/_popups.js" defer="" data-base="/s">', '<script src="/s/_chat.js" defer="" data-base="/s">', '<script src="/s/_visita.js" defer="" data-base="/s">']);
    expect(inicio).not.toContain('fcontacto');
    const archivos = renderizarSitio(inst, op);
    expect(archivos.find((a) => a.archivo === ARCHIVO_CAPTACION)).toEqual({ archivo: '_captacion.js', contenido: SCRIPT_CAPTACION, mime: 'text/javascript; charset=utf-8' });
  });

  it('guarda la primera visita en sessionStorage, sin cookies ni llamadas a otros sitios', () => {
    expect(SCRIPT_CAPTACION).toContain('sessionStorage');
    expect(SCRIPT_CAPTACION).toContain(JSON.stringify(CLAVE_SESION));
    for (const p of PARAMETROS_UTM) expect(SCRIPT_CAPTACION).toContain(`"${p}"`);
    expect(SCRIPT_CAPTACION).not.toMatch(/document\.cookie|localStorage|fetch\(|XMLHttpRequest|https?:\/\/|eval\(|innerHTML/);
    expect(SCRIPT_CAPTACION.length).toBeLessThan(1500);
    // Es JavaScript válido.
    expect(() => new Function(SCRIPT_CAPTACION)).not.toThrow();
  });

  it('ejecutado, recuerda la entrada con sus UTM y la copia a los campos ocultos; la segunda página no la pisa', () => {
    const guardado = new Map<string, string>();
    const campos: Record<string, { value: string }> = Object.fromEntries(['paginaEntrada', 'referente', ...PARAMETROS_UTM].map((n) => [n, { value: '' }]));
    const correr = (pathname: string, search: string, referrer: string) => new Function('document', 'window', 'location', SCRIPT_CAPTACION)(
      { currentScript: { getAttribute: () => '/s' }, referrer, querySelectorAll: () => [{ elements: { namedItem: (n: string) => campos[n] ?? null } }] },
      { sessionStorage: { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => void guardado.set(k, v) } },
      { pathname, search, host: 'aptioscorm.com' },
    );
    correr('/s/precios', '?utm_source=linkedin&utm_medium=social&x=1', 'https://www.linkedin.com/feed/');
    expect(JSON.parse(guardado.get(CLAVE_SESION)!)).toEqual({ paginaEntrada: '/precios', referente: 'https://www.linkedin.com/feed/', utm_source: 'linkedin', utm_medium: 'social' });
    correr('/s/contacto', '?utm_source=otro', 'https://aptioscorm.com/s/precios');
    expect(campos.paginaEntrada!.value).toBe('/precios');
    expect(campos.utm_source!.value).toBe('linkedin');
    expect(campos.referente!.value).toBe('https://www.linkedin.com/feed/');
    expect(campos.utm_campaign!.value).toBe('');
  });

  it('si el navegador bloquea sessionStorage, no falla', () => {
    expect(() => new Function('document', 'window', 'location', SCRIPT_CAPTACION)({ currentScript: null }, { get sessionStorage(): never { throw new Error('bloqueado'); } }, {})).not.toThrow();
  });
});

describe('servir la captación', () => {
  it('la CSP permite solo scripts y envíos de formulario del mismo origen', () => {
    expect(POLITICA_CONTENIDO).toContain("default-src 'none'");
    expect(POLITICA_CONTENIDO).toContain("script-src 'self';");
    expect(POLITICA_CONTENIDO).toContain("form-action 'self';");
    expect(POLITICA_CONTENIDO).not.toMatch(/unsafe-eval|script-src[^;]*(unsafe-inline|https?:|\*)/);
  });

  it('el script y la página de gracias se piden bajo la base; otra ruta con guion bajo no existe', () => {
    expect(resolverPedido('/_captacion.js')).toEqual({ tipo: 'script', archivo: '_captacion.js' });
    expect(resolverPedido('/_gracias')).toEqual({ tipo: 'pagina', archivo: '_gracias.html', ruta: '/_gracias' });
    expect(resolverPedido('/en/_gracias')).toEqual({ tipo: 'pagina', archivo: 'en/_gracias.html', ruta: '/en/_gracias' });
    expect(resolverPedido('/_otro')).toBeNull();
    const cab = cabecerasSitio('script', SCRIPT_CAPTACION);
    expect(cab['Content-Type']).toBe('text/javascript; charset=utf-8');
    expect(cab['X-Content-Type-Options']).toBe('nosniff');
    expect(cab['Cache-Control']).toBe('public, max-age=0, s-maxage=60, must-revalidate');
  });

  it('la página de gracias va en la versión por idioma, sin indexar', () => {
    const archivos = renderizarSitio(conFormulario(), op);
    const gracias = archivos.find((a) => a.archivo === '_gracias.html')!;
    expect(gracias.contenido).toContain('<h1>Recibimos tus datos</h1><p role="status">');
    expect(gracias.contenido).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(archivos.find((a) => a.archivo === 'en/_gracias.html')!.contenido).toContain('<h1>We received your details</h1>');
    expect(archivos.find((a) => a.archivo === 'sitemap.xml')!.contenido).not.toContain('_gracias');
    expect(renderizarSitio(instantaneaDeEjemplo(), op).map((a) => a.archivo)).not.toContain('_gracias.html');
  });

  it('el aviso de error lista los mensajes escapados y vuelve al formulario', () => {
    const html = renderizarErrorFormulario(null, op, { errores: ['Escribe un correo válido', '<b>x</b>'], volverA: '/contacto' });
    expect(html).toContain('<h1>No pudimos enviar el formulario</h1><div role="alert">');
    expect(html).toContain('<li>Escribe un correo válido</li><li>&lt;b&gt;x&lt;/b&gt;</li>');
    expect(html).toContain('<a class="btn primary" href="/s/contacto#contacto">Volver al formulario</a>');
    expect(html).not.toContain('<script');
    const muchos = renderizarErrorFormulario(null, op, { errores: [], volverA: '/', demasiados: true }, 'en');
    expect(muchos).toContain('<p role="alert">We received several submissions in a row');
    expect(muchos).toContain('href="/s/#contacto"');
  });
});
