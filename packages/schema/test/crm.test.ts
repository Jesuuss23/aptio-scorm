// HU-1602 · Integración con CRM (REQ-075, RN-17-2, CP-129, CP-130): mapeo, URL del webhook, motivo sin claves, resumen,
// firma HMAC-SHA256 y los clientes de HubSpot, Pipedrive, Zoho y el webhook contra respuestas simuladas.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAPEO_POR_DEFECTO, mapeoDe, motivoSeguro, propiedadesCrm, resumenCrm, validarMapeo, validarUrlWebhook, type LeadParaCrm } from '../src/crm.js';
import {
  CABECERA_ENTREGA, CABECERA_EVENTO, CABECERA_FIRMA, cuerpoWebhook, enviarACrm, ErrorCrm, firmar, generarSecreto, olvidarTokenZoho, probarCrm, verificarFirma,
} from '../src/crm-envio.js';

const LEAD: LeadParaCrm = {
  id: '00000000-0000-4000-9800-000000000001', correo: 'rmendoza@nuevohorizonte.example', nombre: 'Rocío Mendoza', empresa: 'Colegio Nuevo Horizonte', mensaje: null,
  origen: 'asistente_ia', via: 'popup', etapa: 'CONTACTADO', paginaEntrada: '/precios', paginaFormulario: '/', utmSource: 'linkedin', utmMedium: 'social', utmCampaign: null,
  utmTerm: null, utmContent: null, referente: null, idioma: 'es', totalContactos: 2, creadoEn: new Date('2026-11-10T15:00:00Z'), actualizadoEn: new Date('2026-11-11T15:00:00Z'),
};

type Pedido = { url: string; init: RequestInit };
const simular = (...respuestas: (Response | Error)[]) => {
  const pedidos: Pedido[] = [];
  const obtener = async (url: string, init: RequestInit) => {
    pedidos.push({ url, init });
    const r = respuestas.shift();
    if (!r) throw new Error('sin respuesta simulada');
    if (r instanceof Error) throw r;
    return r;
  };
  return { pedidos, obtener };
};
const ok = (cuerpo: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const cuerpoDe = (p: Pedido) => JSON.parse(String(p.init.body)) as Record<string, unknown>;
const cabecera = (p: Pedido, n: string) => (p.init.headers as Record<string, string>)[n];

describe('mapeo de campos', () => {
  it('acepta el de por defecto, ignora los vacíos y exige el correo en su propiedad', () => {
    for (const t of ['hubspot', 'pipedrive', 'zoho'] as const) expect(validarMapeo(t, MAPEO_POR_DEFECTO[t])).toEqual({ ok: true, mapeo: MAPEO_POR_DEFECTO[t] });
    expect(validarMapeo('hubspot', { correo: 'email', nombre: ' firstname ', empresa: '', etapa: null })).toEqual({ ok: true, mapeo: { correo: 'email', nombre: 'firstname' } });
    expect(validarMapeo('hubspot', { nombre: 'firstname' })).toEqual({ ok: false, errores: [{ campo: 'mapeo.correo', mensaje: expect.stringContaining('«email»') }] });
  });
  it('rechaza campos fuera del catálogo, propiedades no válidas y repetidas', () => {
    const r = validarMapeo('hubspot', { correo: 'email', clave: 'x', nombre: 'first name', empresa: 'company', mensaje: 'Company' });
    expect(r).toEqual({ ok: false, errores: [expect.objectContaining({ campo: 'mapeo.clave' }), expect.objectContaining({ campo: 'mapeo.nombre' }), expect.objectContaining({ campo: 'mapeo.mensaje' })] });
    expect(validarMapeo('zoho', [])).toMatchObject({ ok: false });
  });
  it('un mapeo guardado roto vuelve al de por defecto; las propiedades llevan las etiquetas en español', () => {
    expect(mapeoDe('zoho', { correo: 'otro' })).toEqual(MAPEO_POR_DEFECTO.zoho);
    expect(propiedadesCrm(LEAD, { correo: 'email', nombre: 'firstname', mensaje: 'message', origen: 'hs_lead_source', etapa: 'aptio_etapa', utmSource: 'utm_source' }))
      .toEqual({ email: LEAD.correo, firstname: 'Rocío Mendoza', hs_lead_source: 'Asistente IA', aptio_etapa: 'Contactado', utm_source: 'linkedin' });
  });
});

describe('URL del webhook (SSRF)', () => {
  it('solo https:// con dominio público', () => {
    expect(validarUrlWebhook('https://hooks.ventas.pe/aptio?canal=web')).toEqual({ ok: true, url: 'https://hooks.ventas.pe/aptio?canal=web' });
    expect(validarUrlWebhook('')).toEqual({ ok: true, url: null });
    expect(validarUrlWebhook('http://hooks.ventas.pe/x')).toEqual({ ok: false, mensaje: 'La URL del webhook empieza con https://' });
    expect(validarUrlWebhook('https://127.0.0.1/x')).toEqual({ ok: false, mensaje: 'La URL del webhook no puede apuntar a la red interna' });
    expect(validarUrlWebhook('https://[::1]/x')).toEqual({ ok: false, mensaje: 'La URL del webhook no puede apuntar a la red interna' });
    expect(validarUrlWebhook('https://8.8.8.8/x')).toEqual({ ok: false, mensaje: 'La URL del webhook usa un dominio, no una dirección IP' });
    expect(validarUrlWebhook('https://localhost/x')).toMatchObject({ ok: false });
    expect(validarUrlWebhook('https://crm.interno.local/x')).toMatchObject({ ok: false });
    expect(validarUrlWebhook('https://user:clave@hooks.ventas.pe/')).toMatchObject({ ok: false });
    expect(validarUrlWebhook('https://hooks.ventas.pe:8443/')).toMatchObject({ ok: false });
  });
});

describe('motivo y resumen', () => {
  it('el motivo nunca lleva claves', () => {
    expect(motivoSeguro('Pipedrive respondió 401 con api_token=abc123def', ['abc123def'])).toBe('Pipedrive respondió 401 con api_token=***');
    expect(motivoSeguro('Authorization: Bearer pat-na1-xyz falló')).toBe('Authorization: *** falló');
    expect(motivoSeguro('x'.repeat(400))).toHaveLength(300);
  });
  it('un error manda, luego lo pendiente; todo enviado es «Sincronizado»', () => {
    expect(resumenCrm([])).toEqual({ estado: 'sin_envio', texto: 'Sin enviar' });
    expect(resumenCrm([{ tipo: 'hubspot', estado: 'enviado', motivo: null }, { tipo: 'webhook', estado: 'enviado', motivo: null }])).toEqual({ estado: 'sincronizado', texto: 'Sincronizado' });
    expect(resumenCrm([{ tipo: 'hubspot', estado: 'enviado', motivo: null }, { tipo: 'webhook', estado: 'pendiente', motivo: null }])).toEqual({ estado: 'pendiente', texto: 'Pendiente' });
    expect(resumenCrm([{ tipo: 'hubspot', estado: 'error', motivo: 'HubSpot respondió 500' }, { tipo: 'webhook', estado: 'pendiente', motivo: null }])).toEqual({ estado: 'error', texto: 'Error: HubSpot respondió 500' });
  });
});

describe('firma HMAC-SHA256 (CP-130)', () => {
  const secreto = generarSecreto();
  it('t=<unix>,v1=<hex> sobre `${t}.${cuerpo}`, verificable con la clave', () => {
    const cuerpo = '{"evento":"lead.prueba"}';
    const f = firmar(cuerpo, secreto, 1_763_330_000);
    expect(f).toBe(`t=1763330000,v1=${createHmac('sha256', secreto).update(`1763330000.${cuerpo}`).digest('hex')}`);
    expect(verificarFirma(f, cuerpo, secreto, 1_763_330_000 + 300)).toEqual({ ok: true });
    expect(verificarFirma(f, `${cuerpo} `, secreto, 1_763_330_000)).toEqual({ ok: false, motivo: 'no_coincide' });
    expect(verificarFirma(f, cuerpo, generarSecreto(), 1_763_330_000)).toEqual({ ok: false, motivo: 'no_coincide' });
    expect(verificarFirma('v1=abc', cuerpo, secreto)).toEqual({ ok: false, motivo: 'formato' });
  });
  it('rechaza una firma de más de 5 minutos', () => {
    const f = firmar('{}', secreto, 1_763_330_000);
    expect(verificarFirma(f, '{}', secreto, 1_763_330_000 + 301)).toEqual({ ok: false, motivo: 'vencida' });
    expect(verificarFirma(f, '{}', secreto, 1_763_330_000 - 301)).toEqual({ ok: false, motivo: 'vencida' });
  });
  it('genera claves distintas con prefijo', () => {
    expect(generarSecreto()).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generarSecreto()).not.toBe(generarSecreto());
  });
});

describe('clientes de CRM con respuestas simuladas', () => {
  const ahora = () => new Date('2026-11-16T22:00:00Z');
  const resolver = async () => ['93.184.216.34'];

  it('CP-130 · el webhook va firmado, con el evento y la entrega, sin seguir redirecciones', async () => {
    const s = simular(ok({ recibido: true }, 202));
    const secreto = generarSecreto();
    const r = await enviarACrm({ tipo: 'webhook', evento: 'lead.creado', entrega: 'ent-1', lead: LEAD, url: 'https://hooks.ventas.pe/aptio', secreto }, { obtener: s.obtener, resolver, ahora });
    expect(r).toEqual({ idExterno: null, estado: 202 });
    const [p] = s.pedidos;
    expect(p!.init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect([cabecera(p!, CABECERA_EVENTO), cabecera(p!, CABECERA_ENTREGA)]).toEqual(['lead.creado', 'ent-1']);
    const cuerpo = String(p!.init.body);
    expect(cuerpo).toBe(cuerpoWebhook('lead.creado', 'ent-1', LEAD, ahora()));
    expect(verificarFirma(cabecera(p!, CABECERA_FIRMA), cuerpo, secreto, Math.floor(ahora().getTime() / 1000))).toEqual({ ok: true });
    expect(JSON.parse(cuerpo)).toMatchObject({ version: 1, evento: 'lead.creado', lead: { correo: LEAD.correo, origen: 'asistente_ia', utm: { source: 'linkedin' } } });
  });
  it('el webhook no se envía a un dominio que resuelve a la red interna ni sigue una redirección', async () => {
    const s = simular(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    const pedido = { tipo: 'webhook' as const, evento: 'lead.creado' as const, entrega: 'e', lead: LEAD, url: 'https://hooks.ventas.pe/aptio', secreto: 'whsec_x' };
    await expect(enviarACrm(pedido, { obtener: s.obtener, resolver: async () => ['10.0.0.5'] })).rejects.toMatchObject({ message: 'El dominio hooks.ventas.pe apunta a una red interna', reintentable: false });
    expect(s.pedidos).toHaveLength(0);
    await expect(enviarACrm(pedido, { obtener: s.obtener, resolver })).rejects.toMatchObject({ message: 'Webhook respondió 302 con una redirección, que no se sigue', reintentable: false });
  });
  it('HubSpot: alta o actualización por correo con el mapeo; un 500 se reintenta y un 400 no', async () => {
    const entorno = { HUBSPOT_TOKEN: 'pat-na1-secreto' };
    const s = simular(ok({ results: [{ id: '901' }] }), ok({ message: 'Internal error' }, 500), ok({ message: 'Property "aptio_etapa" does not exist' }, 400));
    expect(await enviarACrm({ tipo: 'hubspot', evento: 'lead.creado', entrega: 'e', lead: LEAD, mapeo: { ...MAPEO_POR_DEFECTO.hubspot, etapa: 'aptio_etapa' } }, { obtener: s.obtener, entorno })).toEqual({ idExterno: '901', estado: 200 });
    expect(s.pedidos[0]!.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert');
    expect(cabecera(s.pedidos[0]!, 'authorization')).toBe('Bearer pat-na1-secreto');
    expect(cuerpoDe(s.pedidos[0]!)).toEqual({ inputs: [{ idProperty: 'email', id: LEAD.correo, properties: { email: LEAD.correo, firstname: 'Rocío Mendoza', company: 'Colegio Nuevo Horizonte', aptio_etapa: 'Contactado' } }] });
    await expect(enviarACrm({ tipo: 'hubspot', evento: 'lead.creado', entrega: 'e', lead: LEAD }, { obtener: s.obtener, entorno })).rejects.toMatchObject({ message: 'HubSpot respondió 500: Internal error', reintentable: true });
    await expect(enviarACrm({ tipo: 'hubspot', evento: 'lead.creado', entrega: 'e', lead: LEAD }, { obtener: s.obtener, entorno })).rejects.toMatchObject({ reintentable: false });
  });
  it('sin la clave no llama al CRM y lo dice', async () => {
    const s = simular();
    const e = await enviarACrm({ tipo: 'zoho', evento: 'lead.creado', entrega: 'e', lead: LEAD }, { obtener: s.obtener, entorno: { ZOHO_CLIENT_ID: 'id' } }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorCrm);
    expect(e).toMatchObject({ message: 'Falta la clave: define ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN en el entorno del servidor', reintentable: false });
    expect(s.pedidos).toHaveLength(0);
  });
  it('Pipedrive: busca la persona por correo y la actualiza; el motivo no lleva el api_token', async () => {
    const entorno = { PIPEDRIVE_TOKEN: 'pd-token-123' };
    const s = simular(ok({ data: { items: [{ item: { id: 77 } }] } }), ok({ data: { id: 77 } }), ok({ data: { items: [] } }), ok({ error: 'Bad token pd-token-123' }, 401));
    expect(await enviarACrm({ tipo: 'pipedrive', evento: 'lead.actualizado', entrega: 'e', lead: LEAD, mapeo: MAPEO_POR_DEFECTO.pipedrive }, { obtener: s.obtener, entorno })).toEqual({ idExterno: '77', estado: 200 });
    expect(s.pedidos[0]!.url).toContain('/persons/search?term=rmendoza%40nuevohorizonte.example&fields=email&exact_match=true');
    expect(s.pedidos[1]!).toMatchObject({ url: 'https://api.pipedrive.com/v1/persons/77?api_token=pd-token-123', init: { method: 'PUT' } });
    expect(cuerpoDe(s.pedidos[1]!)).toEqual({ name: 'Rocío Mendoza', email: [{ value: LEAD.correo, primary: true }] });
    const e = await enviarACrm({ tipo: 'pipedrive', evento: 'lead.creado', entrega: 'e', lead: LEAD }, { obtener: s.obtener, entorno }).catch((x: Error) => x);
    expect((e as Error).message).toBe('Pipedrive respondió 401: Bad token ***');
  });
  it('Zoho: pide el acceso con el refresh token del centro de datos y hace upsert por Email', async () => {
    olvidarTokenZoho();
    const entorno = { ZOHO_CLIENT_ID: 'cid', ZOHO_CLIENT_SECRET: 'csec', ZOHO_REFRESH_TOKEN: 'rtok', ZOHO_DOMINIO: 'eu' };
    const s = simular(ok({ access_token: 'acc-1', expires_in: 3600 }), ok({ data: [{ status: 'success', details: { id: 'z-5' } }] }), ok({ data: [{ status: 'success', details: { id: 'z-6' } }] }));
    const lead = { ...LEAD, nombre: '' };
    expect(await enviarACrm({ tipo: 'zoho', evento: 'lead.creado', entrega: 'e', lead, mapeo: MAPEO_POR_DEFECTO.zoho }, { obtener: s.obtener, entorno, ahora })).toEqual({ idExterno: 'z-5', estado: 200 });
    expect(s.pedidos[0]!.url).toBe('https://accounts.zoho.eu/oauth/v2/token');
    expect(String(s.pedidos[0]!.init.body)).toBe('refresh_token=rtok&client_id=cid&client_secret=csec&grant_type=refresh_token');
    expect(s.pedidos[1]!.url).toBe('https://www.zohoapis.eu/crm/v2/Leads/upsert');
    expect(cabecera(s.pedidos[1]!, 'authorization')).toBe('Zoho-oauthtoken acc-1');
    expect(cuerpoDe(s.pedidos[1]!)).toEqual({ data: [{ Email: LEAD.correo, Company: 'Colegio Nuevo Horizonte', Last_Name: LEAD.correo }], duplicate_check_fields: ['Email'] });
    // El acceso se reutiliza mientras no venza.
    await enviarACrm({ tipo: 'zoho', evento: 'lead.creado', entrega: 'e', lead, mapeo: MAPEO_POR_DEFECTO.zoho }, { obtener: s.obtener, entorno, ahora });
    expect(s.pedidos).toHaveLength(3);
  });
  it('un CRM que no responde en 10 s se reintenta; «Enviar prueba» del webhook manda lead.prueba firmado', async () => {
    const lento = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const s = simular(lento, ok({}, 204));
    await expect(enviarACrm({ tipo: 'hubspot', evento: 'lead.creado', entrega: 'e', lead: LEAD }, { obtener: s.obtener, entorno: { HUBSPOT_TOKEN: 't' } })).rejects.toMatchObject({ message: 'HubSpot no respondió en 10 s', reintentable: true });
    const secreto = generarSecreto();
    const r = await probarCrm({ tipo: 'webhook', url: 'https://hooks.ventas.pe/aptio', secreto }, { obtener: s.obtener, resolver });
    expect(r).toMatchObject({ ok: true, detalle: expect.stringMatching(/^El webhook respondió 204 a la entrega [0-9a-f-]{36}$/) });
    const p = s.pedidos[1]!;
    expect(cabecera(p, CABECERA_EVENTO)).toBe('lead.prueba');
    expect(verificarFirma(cabecera(p, CABECERA_FIRMA), String(p.init.body), secreto)).toEqual({ ok: true });
  });
});
