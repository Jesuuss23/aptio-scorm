import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigProveedor, Prisma } from '@aptio/db';
import { MODELO_ELEVENLABS, MODELO_POR_DEFECTO, probarAnthropic, sintetizarElevenLabs, sintetizarGoogle } from '@aptio/ai';
import {
  CONEXIONES, type DefinicionConexion, definicionConexion, inicioMesLima, type TareaConexion, tareaDeRuta, type VocesConexion,
} from '@aptio/schema/conexiones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { ConexionEntradaDto, ConexionesIADto, ConexionIADto, PruebaProveedorDto } from './conexiones.dto.js';

const modo = () => ((process.env.PROVEEDORES_MODO ?? 'simulado') === 'simulado' ? 'simulado' : 'real');
/** Variable de modelo del entorno por tarea de texto, como en los prompts. */
const VARIABLE_MODELO: Partial<Record<TareaConexion, string>> = {
  TEXTO: 'ANTHROPIC_MODEL_TEXTO', PANTALLAS: 'ANTHROPIC_MODEL_PANTALLAS', TRADUCCION: 'ANTHROPIC_MODEL_RAPIDO', CALIDAD: 'ANTHROPIC_MODEL_RAPIDO',
};
const VOZ_PRUEBA = { es: 'es-US-Neural2-A', en: 'en-US-Neural2-F' } as const;
const redondear = (usd: number) => Math.round(usd * 10_000) / 10_000;

/**
 * HU-1304 · Conexiones IA por organización (M13). Las claves viven solo en variables de entorno: aquí se informa si
 * existen, nunca su valor (RN-13-3). El worker lee estas filas en cada trabajo (CP-099) y aplica el límite (CP-100).
 */
@Injectable()
export class ConexionesService {
  private readonly registro = new Logger('ConexionesIA');
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private tarea(valor: string): TareaConexion {
    const t = tareaDeRuta(valor);
    if (!t) throw new NotFoundException({ codigo: 'TAREA_NO_EXISTE', mensaje: `La tarea ${valor} no es de la lista de Conexiones IA` });
    return t;
  }

  private claveConfigurada(d: DefinicionConexion, proveedor: string): boolean {
    const variable = d.opciones.find((o) => o.proveedor === proveedor)?.variableClave;
    return variable ? Boolean(process.env[variable]) : !d.opciones.find((o) => o.proveedor === proveedor)?.proximamente;
  }

  private aDto(d: DefinicionConexion, fila: ConfigProveedor | undefined, gasto: number): ConexionIADto {
    const proveedor = fila?.proveedor ?? d.proveedorPorDefecto;
    const variable = VARIABLE_MODELO[d.tarea];
    const modelo = fila?.modelo ?? (variable ? process.env[variable] || MODELO_POR_DEFECTO : d.modeloPorDefecto);
    const limite = fila?.limiteGastoMensualUsd == null ? null : Number(fila.limiteGastoMensualUsd);
    const voces = d.tarea === 'VOZ' ? (((fila?.parametros as { voces?: VocesConexion } | null)?.voces ?? {}) as VocesConexion) : null;
    return {
      tarea: d.tarea, nombre: d.nombre, proveedor, modelo,
      opciones: d.opciones.map((o) => ({ proveedor: o.proveedor, nombre: o.nombre, ...(o.proximamente ? { proximamente: true } : {}) })),
      modelos: d.modelos, fijo: d.fijo, voces, claveConfigurada: this.claveConfigurada(d, proveedor), costoEstimadoScormUsd: d.costoEstimadoScorm,
      gastoMesUsd: redondear(gasto), limiteGastoMensualUsd: limite, limiteAlcanzado: limite !== null && gasto >= limite,
      configurada: Boolean(fila), actualizadoEn: fila?.actualizadoEn.toISOString() ?? null,
    };
  }

  async listar(u: UsuarioSesion, ahora = new Date()): Promise<ConexionesIADto> {
    const organizacionId = organizacionDe(u);
    const desde = inicioMesLima(ahora);
    const [filas, gastos] = await Promise.all([
      this.bd.configProveedor.findMany({ where: { organizacionId } }),
      this.bd.trabajoIA.groupBy({ by: ['tipo'], where: { organizacionId, creadoEn: { gte: desde } }, _sum: { costoUsd: true } }),
    ]);
    const gastoDe = (t: TareaConexion) => Number(gastos.find((g) => g.tipo === t)?._sum.costoUsd ?? 0);
    const conexiones = CONEXIONES.map((d) => this.aDto(d, filas.find((f) => f.tarea === d.tarea), gastoDe(d.tarea)));
    const limites = conexiones.flatMap((c) => (c.limiteGastoMensualUsd === null ? [] : [c.limiteGastoMensualUsd]));
    const lima = new Date(desde.getTime());
    return {
      mes: `${lima.getUTCFullYear()}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}`, modo: modo(),
      gastoMesUsd: redondear(gastos.reduce((n, g) => n + Number(g._sum.costoUsd ?? 0), 0)),
      limiteTotalUsd: limites.length ? redondear(limites.reduce((a, b) => a + b, 0)) : null,
      conexiones,
    };
  }

  async guardar(u: UsuarioSesion, valor: string, dto: ConexionEntradaDto): Promise<ConexionIADto> {
    const organizacionId = organizacionDe(u);
    const tarea = this.tarea(valor);
    const d = definicionConexion(tarea);
    const actual = await this.bd.configProveedor.findUnique({ where: { organizacionId_tarea: { organizacionId, tarea } } });
    const proveedor = dto.proveedor ?? actual?.proveedor ?? d.proveedorPorDefecto;
    const opcion = d.opciones.find((o) => o.proveedor === proveedor);
    if (!opcion || (opcion.proximamente && proveedor !== d.proveedorPorDefecto)) {
      throw new UnprocessableEntityException({ codigo: 'PROVEEDOR_NO_VALIDO', mensaje: opcion ? `${opcion.nombre} llega próximamente` : `${proveedor} no es un proveedor de ${d.nombre}` });
    }
    const cambiaProveedor = proveedor !== (actual?.proveedor ?? d.proveedorPorDefecto);
    const porDefecto = proveedor === 'elevenlabs' ? MODELO_ELEVENLABS : this.aDto(d, undefined, 0).modelo;
    const modelo = dto.modelo ?? (cambiaProveedor ? porDefecto : actual?.modelo ?? porDefecto);
    // Los modelos de texto deben tener tarifa registrada: sin ella el worker no puede calcular el costo.
    if (d.modelos.length && !d.modelos.includes(modelo)) {
      throw new UnprocessableEntityException({ codigo: 'MODELO_NO_VALIDO', mensaje: `${modelo} no tiene tarifa registrada; elige ${d.modelos.join(', ')}` });
    }
    const vocesAntes = ((actual?.parametros as { voces?: VocesConexion } | null)?.voces ?? {}) as VocesConexion;
    const voces: VocesConexion = { ...vocesAntes, ...(dto.voces?.es ? { es: dto.voces.es.trim() } : {}), ...(dto.voces?.en ? { en: dto.voces.en.trim() } : {}) };
    if (tarea !== 'VOZ' && dto.voces) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: 'Solo la voz tiene voces por idioma' });
    const limite = dto.limiteGastoMensualUsd === undefined ? (actual?.limiteGastoMensualUsd ?? null) : dto.limiteGastoMensualUsd;
    const datos = {
      proveedor, modelo, limiteGastoMensualUsd: limite,
      ...(tarea === 'VOZ' ? { parametros: { voces } as Prisma.InputJsonValue } : {}),
    };
    const fila = await this.bd.configProveedor.upsert({
      where: { organizacionId_tarea: { organizacionId, tarea } },
      create: { organizacionId, tarea, ...datos },
      update: datos,
    });
    await this.bd.auditoria.create({
      data: {
        organizacionId, usuarioId: u.id, accion: 'CONEXION_IA_GUARDADA', entidad: 'ConfigProveedor', entidadId: fila.id,
        datos: {
          tarea, proveedor, modelo, limiteGastoMensualUsd: limite === null ? null : Number(limite),
          ...(actual ? { antes: { proveedor: actual.proveedor, modelo: actual.modelo, limiteGastoMensualUsd: actual.limiteGastoMensualUsd === null ? null : Number(actual.limiteGastoMensualUsd) } } : {}),
        },
      },
    });
    const gasto = await this.bd.trabajoIA.aggregate({ where: { organizacionId, tipo: tarea, creadoEn: { gte: inicioMesLima(new Date()) } }, _sum: { costoUsd: true } });
    return this.aDto(d, fila, Number(gasto._sum.costoUsd ?? 0));
  }

  /** Llamada mínima al proveedor activo; no se registra en TrabajoIA ni cuesta en modo simulado. */
  async probar(u: UsuarioSesion, valor: string): Promise<PruebaProveedorDto> {
    const organizacionId = organizacionDe(u);
    const tarea = this.tarea(valor);
    const d = definicionConexion(tarea);
    const fila = await this.bd.configProveedor.findUnique({ where: { organizacionId_tarea: { organizacionId, tarea } } });
    const c = this.aDto(d, fila ?? undefined, 0);
    const inicio = Date.now();
    const fin = (ok: boolean, mensaje: string, m: 'simulado' | 'real' = 'real'): PruebaProveedorDto => ({ ok, modo: m, proveedor: c.proveedor, modelo: c.modelo, mensaje, latenciaMs: Date.now() - inicio });
    if (modo() === 'simulado') return fin(true, 'simulado, OK', 'simulado');
    const variable = d.opciones.find((o) => o.proveedor === c.proveedor)?.variableClave;
    const clave = variable ? process.env[variable] : undefined;
    if (variable && !clave) return fin(false, `Falta la clave: define ${variable} en el entorno del servidor`);
    try {
      if (d.opciones[0]?.proveedor === 'anthropic') {
        const r = await probarAnthropic({ apiKey: clave!, modelo: c.modelo });
        return fin(true, `Claude respondió con ${r.modelo}`);
      }
      if (tarea === 'VOZ') {
        const pedido = { ssml: 'Hola', idioma: 'es' as const, voz: c.voces?.es ?? VOZ_PRUEBA.es, modelo: c.modelo };
        const audio = c.proveedor === 'elevenlabs'
          ? await sintetizarElevenLabs({ ...pedido, voz: c.voces?.es ?? '' }, { apiKey: clave! })
          : await sintetizarGoogle(pedido, { apiKey: clave! });
        return fin(true, `${c.opciones.find((o) => o.proveedor === c.proveedor)?.nombre} respondió (${audio.audio.byteLength} bytes de audio)`);
      }
      return fin(c.claveConfigurada, c.claveConfigurada ? 'Sin llamada de prueba para esta tarea: está configurada' : 'Esta tarea todavía no tiene proveedor');
    } catch (e) {
      // El mensaje de los clientes solo trae el estado HTTP: nunca la clave.
      const mensaje = e instanceof Error ? e.message : 'El proveedor no respondió';
      this.registro.warn(`Prueba de ${tarea} con ${c.proveedor} falló: ${mensaje}`);
      return fin(false, mensaje);
    }
  }
}
