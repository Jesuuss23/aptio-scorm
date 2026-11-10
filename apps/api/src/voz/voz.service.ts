import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { type AudioVoz, sintetizarGoogle, VozNoDisponible, vozSimulada } from '@aptio/ai';
import { KIT_INICIAL } from '@aptio/schema/marca';
import { aplicarPronunciacion, type IdiomaVoz, type TerminoPronunciacion } from '@aptio/schema/voz';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { MuestraVozDto, MuestraVozResultadoDto } from './voz.dto.js';

type VozKit = { proveedor?: string; voz?: string; velocidad?: number };

const noDisponible = (mensaje: string) => new HttpException({ codigo: 'VOZ_NO_DISPONIBLE', mensaje }, HttpStatus.SERVICE_UNAVAILABLE);

/** Muestra de voz con el diccionario del cliente (HU-0205, CP-027). No se guarda en ningún curso. */
@Injectable()
export class VozService {
  private readonly registro = new Logger(VozService.name);

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async muestra(u: UsuarioSesion, dto: MuestraVozDto): Promise<MuestraVozResultadoDto> {
    const organizacionId = organizacionDe(u);
    let vozKit: VozKit | undefined;
    let diccionario: TerminoPronunciacion[] = [];
    if (dto.clienteId) {
      const c = await this.bd.cliente.findFirst({
        where: { id: dto.clienteId, organizacionId },
        select: { kit: { select: { voces: true } }, pronunciacion: { where: { idioma: dto.idioma } } },
      });
      if (!c) throw new NotFoundException('Cliente no encontrado');
      vozKit = (c.kit?.voces as Partial<Record<IdiomaVoz, VozKit>> | undefined)?.[dto.idioma];
      diccionario = c.pronunciacion.map((p) => ({ idioma: p.idioma as IdiomaVoz, escrito: p.escrito, pronunciado: p.pronunciado }));
    }
    const proveedor = vozKit?.proveedor ?? 'google';
    const voz = dto.voz ?? vozKit?.voz ?? (dto.idioma === 'es' ? KIT_INICIAL.voces.es.voz : undefined);
    if (!voz) throw new UnprocessableEntityException({ codigo: 'VOZ_SIN_DEFINIR', mensaje: 'Elige una voz para este idioma en el kit' });
    if (proveedor !== 'google') {
      throw new UnprocessableEntityException({ codigo: 'PROVEEDOR_NO_DISPONIBLE', mensaje: `La muestra con ${proveedor} llega con la voz completa (S4)` });
    }

    const { ssml, dicho, aplicados } = aplicarPronunciacion(dto.texto, diccionario, dto.idioma);
    const pedido = { ssml, idioma: dto.idioma, voz, velocidad: dto.velocidad ?? vozKit?.velocidad ?? 1 };
    const audio = await this.sintetizar(organizacionId, pedido);
    return {
      audioUrl: `data:${audio.mime};base64,${Buffer.from(audio.audio).toString('base64')}`,
      bocas: [], ssml, dicho, aplicados, proveedor: audio.proveedor, voz, simulada: audio.simulada,
    };
  }

  private async sintetizar(organizacionId: string, pedido: Parameters<typeof vozSimulada>[0]): Promise<AudioVoz> {
    if ((process.env.PROVEEDORES_MODO ?? 'simulado') === 'simulado') return vozSimulada(pedido);
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw noDisponible('La voz de Google no está configurada en este entorno');
    const inicio = Date.now();
    try {
      const audio = await sintetizarGoogle(pedido, { apiKey });
      // Consumo por organización (decisión 12). El costo se calcula con los precios de M13 (costos y rentabilidad).
      await this.bd.trabajoIA.create({
        data: {
          organizacionId, tarea: 'MUESTRA_VOZ', tipo: 'VOZ', proveedor: audio.proveedor, modelo: audio.modelo,
          caracteres: audio.caracteres, estado: 'COMPLETADO', intentos: 1, duracionMs: Date.now() - inicio,
        },
      });
      return audio;
    } catch (e) {
      if (!(e instanceof VozNoDisponible)) throw e;
      this.registro.warn(e.message);
      throw noDisponible('La voz de Google no respondió; intenta de nuevo');
    }
  }
}
