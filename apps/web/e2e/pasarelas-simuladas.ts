// HU-1704 · Ventas › Pasarelas y los cobros simulados, con las mismas reglas que la API (@aptio/schema/pasarelas):
// listar sin secretos, mostrar/ocultar, modo y orden; la pasarela que cobra cada moneda; los pagos aprobados sin cuenta y
// su reembolso. `stripe: true` simula que Stripe tiene sus variables (activa); la simulada solo existe en pruebas.
import {
  CATALOGO_PASARELAS, type CodigoPasarela, completarPasarelas, type ConfigPasarela, elegirPasarela, esCodigoPasarela, monedasConPasarela, validarCambioPasarela, validarOrdenPasarelas,
} from '@aptio/schema/pasarelas';
import type { Moneda } from '@aptio/schema/suscripciones';

type Respuesta = { status: number; body?: unknown };
export interface CobroSim {
  id: string; solicitudId: string; suscripcionId: string | null; razonSocial: string; correoAdmin: string; nombrePlan: string; monto: number; moneda: Moneda; pasarela: string;
  ultimos4Digitos: string | null; estado: 'APROBADO' | 'REEMBOLSADO'; motivoSinAlta: string | null; reembolsoId: string | null; reembolsadoEn: string | null; creadoEn: string;
}
export interface PasarelasSitioSim { stripe?: boolean; visibles?: Partial<Record<CodigoPasarela, boolean>>; cobros?: CobroSim[]; reembolsoFalla?: boolean }

export function crearPasarelasSim(inicial: PasarelasSitioSim = {}, entorno: () => 'pruebas' | 'produccion') {
  let configs: ConfigPasarela[] = completarPasarelas([]).map((c) => ({ ...c, visible: inicial.visibles?.[c.codigo] ?? c.visible }));
  const cobros: CobroSim[] = (inicial.cobros ?? []).map((c) => ({ ...c }));
  const faltan = (c: ConfigPasarela): string[] => {
    const s = c.modo === 'produccion' ? 'PRODUCCION' : 'PRUEBAS';
    if (c.codigo === 'pruebas') return [];
    if (c.codigo === 'stripe') return inicial.stripe && c.modo === 'pruebas' ? [] : [`STRIPE_LLAVE_SECRETA_${s}`, `STRIPE_SECRETO_WEBHOOK_${s}`];
    return [`CULQI_LLAVE_PUBLICA_${s}`, `CULQI_LLAVE_SECRETA_${s}`, `CULQI_SECRETO_WEBHOOK_${s}`];
  };
  const activa = (codigo: CodigoPasarela) => {
    const c = configs.find((x) => x.codigo === codigo)!;
    return !(CATALOGO_PASARELAS[codigo].simulada && entorno() !== 'pruebas') && faltan(c).length === 0;
  };
  const dto = (c: ConfigPasarela) => ({ ...c, monedas: [...CATALOGO_PASARELAS[c.codigo].monedas], flujo: CATALOGO_PASARELAS[c.codigo].flujo, simulada: CATALOGO_PASARELAS[c.codigo].simulada, activa: activa(c.codigo), variablesFaltantes: faltan(c) });
  const lista = (): Respuesta => ({ status: 200, body: { pasarelas: completarPasarelas(configs).map(dto) } });
  const cobroDto = (c: CobroSim) => ({ ...c, reembolsable: c.estado === 'APROBADO' && !c.suscripcionId });

  function panel(ruta: string, metodo: string, cuerpo: Record<string, unknown>, consulta: URLSearchParams): Respuesta | null {
    if (ruta === '/ventas/pasarelas' && metodo === 'GET') return lista();
    if (ruta === '/ventas/pasarelas/orden' && metodo === 'PUT') {
      const errores = validarOrdenPasarelas(cuerpo.codigos);
      if (errores.length) return { status: 422, body: { codigo: 'ORDEN_INCOMPLETO', mensaje: errores[0]!.mensaje } };
      configs = configs.map((c) => ({ ...c, orden: (cuerpo.codigos as string[]).indexOf(c.codigo) }));
      return lista();
    }
    const m = ruta.match(/^\/ventas\/pasarelas\/([a-z]+)$/);
    if (m && metodo === 'PATCH') {
      if (!esCodigoPasarela(m[1])) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela no existe' } };
      const errores = validarCambioPasarela(m[1], cuerpo);
      if (errores.length) return { status: 422, body: { codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores } };
      configs = configs.map((c) => (c.codigo === m[1] ? { ...c, ...(typeof cuerpo.nombre === 'string' ? { nombre: cuerpo.nombre.trim() } : {}), ...(typeof cuerpo.visible === 'boolean' ? { visible: cuerpo.visible } : {}), ...(cuerpo.modo ? { modo: cuerpo.modo as ConfigPasarela['modo'] } : {}) } : c));
      return { status: 200, body: dto(configs.find((c) => c.codigo === m[1])!) };
    }
    if (ruta === '/ventas/cobros' && metodo === 'GET') {
      const sinAlta = consulta.get('sinAlta');
      return { status: 200, body: { cobros: cobros.filter((c) => sinAlta === null || (sinAlta === 'true') === !c.suscripcionId).map(cobroDto) } };
    }
    const r = ruta.match(/^\/ventas\/cobros\/([0-9a-f-]{36})\/reembolsar$/);
    if (r && metodo === 'POST') {
      const c = cobros.find((x) => x.id === r[1]);
      if (!c) return { status: 404, body: { codigo: 'NO_ENCONTRADO', mensaje: 'El cobro no existe' } };
      if (c.suscripcionId) return { status: 409, body: { codigo: 'COBRO_CON_SUSCRIPCION', mensaje: 'Este cobro creó una suscripción: se devuelve al cancelarla, no desde aquí' } };
      if (c.estado === 'REEMBOLSADO') return { status: 409, body: { codigo: 'COBRO_YA_REEMBOLSADO', mensaje: 'Este cobro ya se reembolsó' } };
      if (inicial.reembolsoFalla) { inicial.reembolsoFalla = false; return { status: 502, body: { codigo: 'PASARELA_NO_RESPONDE', mensaje: 'La pasarela no completó el reembolso: intenta de nuevo en unos minutos' } }; }
      Object.assign(c, { estado: 'REEMBOLSADO', reembolsoId: `re_sim_${c.id.slice(-4)}`, reembolsadoEn: new Date().toISOString() });
      return { status: 200, body: cobroDto(c) };
    }
    return null;
  }

  return {
    panel,
    elegir: (moneda: Moneda) => elegirPasarela(moneda, configs, activa),
    monedas: () => monedasConPasarela(configs, activa),
    cobros,
  };
}
