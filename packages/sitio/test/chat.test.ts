// HU-1604 · El script del chat del sitio (REQ-077, RN-17-4): va en toda versión y en todas las páginas, es del mismo
// origen, no usa cookies ni sitios de afuera y pone los textos como texto. Su comportamiento lo recorre Playwright.
import { describe, expect, it } from 'vitest';
import { LIMITES_CHAT } from '@aptio/schema/chatbot';
import { ARCHIVO_CHAT, ARCHIVO_CHATBOT_JSON, CLAVE_CHAT, CSS_CHAT, RUTA_CHAT_API, SCRIPT_CHAT, TEXTOS_CHAT_SITIO } from '../src/chat.js';
import { chatbotDeEjemplo, instantaneaDeEjemplo } from '../src/ejemplo.js';
import { renderizar404, renderizarPagina, renderizarSitio, sinScriptsOpcionales } from '../src/render.js';
import { resolverPedido } from '../src/servir.js';

const op = { base: '/s', sitioUrl: 'https://aptioscorm.com', entorno: 'produccion' as const };

describe('script del chat', () => {
  it('va en toda versión y en cada página (también en inglés), pero no en la 404', () => {
    const inst = instantaneaDeEjemplo();
    expect(renderizarSitio(inst, op).find((a) => a.archivo === ARCHIVO_CHAT)).toEqual({ archivo: '_chat.js', contenido: SCRIPT_CHAT, mime: 'text/javascript; charset=utf-8' });
    expect(renderizarPagina(inst, '/', 'en', op)).toContain('<script src="/s/_chat.js" defer="" data-base="/s"></script>');
    expect(renderizarPagina(inst, '/', 'es', { ...op, base: '' })).toContain('<script src="/_chat.js" defer="" data-base=""></script>');
    expect(renderizar404(inst, op)).not.toContain('_chat.js');
    expect(resolverPedido('/_chat.js')).toEqual({ tipo: 'script', archivo: '_chat.js' });
    expect(sinScriptsOpcionales(renderizarPagina(inst, '/', 'es', op)!)).not.toContain('_chat.js');
  });

  it('es válido, no usa cookies ni otros sitios y lee el chatbot en vivo', () => {
    expect(() => new Function(SCRIPT_CHAT)).not.toThrow();
    expect(SCRIPT_CHAT).not.toMatch(/document\.cookie|https?:\/\/|eval\(|localStorage/);
    expect(SCRIPT_CHAT).toContain(`/${ARCHIVO_CHATBOT_JSON}?idioma=`);
    expect(SCRIPT_CHAT).toContain(JSON.stringify(RUTA_CHAT_API));
    expect(SCRIPT_CHAT).toContain(JSON.stringify(CLAVE_CHAT));
    expect(SCRIPT_CHAT).toContain(`MAX=${LIMITES_CHAT.mensaje}`);
    // Los mensajes van con textContent: el único innerHTML es el ícono fijo del botón.
    expect(SCRIPT_CHAT.match(/innerHTML/g)).toHaveLength(1);
    expect(SCRIPT_CHAT).toContain("credentials:'omit'");
  });

  it('el diálogo es accesible y no aparece en el pago', () => {
    for (const t of ["role:'dialog'", "'aria-modal':'true'", "role:'log'", "'aria-live':'polite'", "e.key==='Escape'", "e.key==='Tab'", "'aria-expanded'"]) expect(SCRIPT_CHAT).toContain(t);
    expect(SCRIPT_CHAT).toContain('if(ruta.indexOf("/pago")===0)return;');
    expect(CSS_CHAT).toContain('prefers-reduced-motion:no-preference');
    expect(CSS_CHAT).toMatch(/\.ch-abrir\{position:fixed/);
  });

  it('textos en los dos idiomas con las mismas claves', () => {
    expect(Object.keys(TEXTOS_CHAT_SITIO.en).sort()).toEqual(Object.keys(TEXTOS_CHAT_SITIO.es).sort());
  });

  it('el chatbot de ejemplo está visible, con saludo, respuestas y horario', () => {
    const c = chatbotDeEjemplo('es', new Date('2026-11-17T15:00:00Z'));
    expect(c).toMatchObject({ visible: true, nombre: 'Ana', enHorario: true, horario: 'Lun a vie, 9:00 a 18:00' });
    expect(c.rapidas.map((r) => r.accion)).toEqual(['consulta_ia', 'agendar_demo', 'hablar_persona']);
    expect(chatbotDeEjemplo('en').rapidas[0]!.texto).toBe('Does it work in Moodle?');
  });
});
