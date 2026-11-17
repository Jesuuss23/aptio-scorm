import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import {
  CATALOGO_PASARELAS, type CodigoPasarela, completarPasarelas, type ConfigPasarela, elegirPasarela, esCodigoPasarela, type ErrorCampo, type ModoPasarela, monedasConPasarela,
  validarCambioPasarela, validarOrdenPasarelas,
} from '@aptio/schema/pasarelas';
import type { Moneda } from '@aptio/schema/suscripciones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { Pasarela } from './pasarelas/contrato.js';
import { PasarelaCulqi } from './pasarelas/culqi.js';
import { PasarelaPruebas } from './pasarelas/pruebas.js';
import { PasarelaStripe } from './pasarelas/stripe.js';
import type { CambioPasarelaDto, PasarelaDto, PasarelasDto } from './pasarelas.dto.js';

const noValido = (errores: ErrorCampo[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1704 · Pasarelas intercambiables (REQ-084, RN-18-9). Guarda cómo se ofrece cada una (nombre, mostrar/ocultar, orden
 * y modo) y elige la que cobra cada moneda: la primera visible y activa, en orden. «Activa» = sus variables de entorno
 * del modo están y el entorno la admite (la simulada solo con `SITIO_ENTORNO=pruebas`). Las llaves nunca van a la base.
 */
@Injectable()
export class PasarelasService {
  private readonly adaptadores = new Map<CodigoPasarela, Pasarela>([
    ['pruebas', new PasarelaPruebas()],
    ['culqi', new PasarelaCulqi()],
    ['stripe', new PasarelaStripe()],
  ]);

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  adaptador(codigo: CodigoPasarela): Pasarela {
    return this.adaptadores.get(codigo)!;
  }

  /** Cambia el adaptador de una pasarela (las pruebas lo hacen para no salir a internet). */
  reemplazar(p: Pasarela): void {
    this.adaptadores.set(p.codigo, p);
  }

  async configs(): Promise<ConfigPasarela[]> {
    const filas = await this.bd.pasarelaConfig.findMany();
    return completarPasarelas(filas.filter((f) => esCodigoPasarela(f.codigo)).map((f) => ({ codigo: f.codigo as CodigoPasarela, nombre: f.nombre, visible: f.visible, orden: f.orden, modo: f.modo })));
  }

  async config(codigo: string): Promise<ConfigPasarela | null> {
    return esCodigoPasarela(codigo) ? ((await this.configs()).find((c) => c.codigo === codigo) ?? null) : null;
  }

  faltantes(codigo: CodigoPasarela, modo: ModoPasarela): string[] {
    return this.adaptador(codigo).variablesFaltantes(modo);
  }

  /** ¿Puede cobrar en este entorno? (no mira si está visible: un pago en curso se confirma aunque se haya ocultado). */
  activa(c: Pick<ConfigPasarela, 'codigo' | 'modo'>): boolean {
    if (CATALOGO_PASARELAS[c.codigo].simulada && entornoActual() !== 'pruebas') return false;
    return this.faltantes(c.codigo, c.modo).length === 0;
  }

  private activaEn(configs: readonly ConfigPasarela[]) {
    return (codigo: CodigoPasarela) => this.activa(configs.find((c) => c.codigo === codigo)!);
  }

  /** La pasarela que cobra esa moneda ahora, con su modo. */
  async elegir(moneda: Moneda): Promise<ConfigPasarela | null> {
    const configs = await this.configs();
    const codigo = elegirPasarela(moneda, configs, this.activaEn(configs));
    return codigo ? configs.find((c) => c.codigo === codigo)! : null;
  }

  /** Las monedas que alguna pasarela visible y activa puede cobrar. */
  async monedas(): Promise<Moneda[]> {
    const configs = await this.configs();
    return monedasConPasarela(configs, this.activaEn(configs));
  }

  async listar(): Promise<PasarelasDto> {
    return { pasarelas: (await this.configs()).map((c) => this.aDto(c)) };
  }

  async cambiar(u: UsuarioSesion, codigo: string, dto: CambioPasarelaDto): Promise<PasarelaDto> {
    const actual = await this.config(codigo);
    if (!actual) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La pasarela no existe' });
    const cambios = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as CambioPasarelaDto;
    const errores = validarCambioPasarela(actual.codigo, cambios);
    if (errores.length) throw noValido(errores);
    const nueva: ConfigPasarela = { ...actual, ...(cambios.nombre !== undefined ? { nombre: cambios.nombre.trim() } : {}), ...(cambios.visible !== undefined ? { visible: cambios.visible } : {}), ...(cambios.modo !== undefined ? { modo: cambios.modo as ModoPasarela } : {}) };
    const datos = { nombre: nueva.nombre, visible: nueva.visible, orden: nueva.orden, modo: nueva.modo };
    await this.bd.pasarelaConfig.upsert({ where: { codigo: actual.codigo }, create: { codigo: actual.codigo, ...datos }, update: datos });
    await this.auditar(u, 'PASARELA_EDITADA', actual.codigo, { campos: Object.keys(cambios), antes: { nombre: actual.nombre, visible: actual.visible, modo: actual.modo }, despues: { nombre: nueva.nombre, visible: nueva.visible, modo: nueva.modo } });
    return this.aDto(nueva);
  }

  async ordenar(u: UsuarioSesion, codigos: string[]): Promise<PasarelasDto> {
    const errores = validarOrdenPasarelas(codigos);
    if (errores.length) throw new UnprocessableEntityException({ codigo: 'ORDEN_INCOMPLETO', mensaje: errores[0]!.mensaje, detalles: errores });
    const configs = await this.configs();
    await this.bd.$transaction(codigos.map((codigo, orden) => {
      const c = configs.find((x) => x.codigo === codigo)!;
      return this.bd.pasarelaConfig.upsert({ where: { codigo }, create: { codigo, nombre: c.nombre, visible: c.visible, modo: c.modo, orden }, update: { orden } });
    }));
    await this.auditar(u, 'PASARELAS_ORDEN_CAMBIADO', null, { codigos });
    return this.listar();
  }

  private aDto(c: ConfigPasarela): PasarelaDto {
    const f = CATALOGO_PASARELAS[c.codigo];
    return { ...c, monedas: [...f.monedas], flujo: f.flujo, simulada: f.simulada, activa: this.activa(c), variablesFaltantes: this.faltantes(c.codigo, c.modo) };
  }

  private async auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Prisma.InputJsonValue) {
    await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: u.id, accion, entidad: 'PasarelaConfig', entidadId, datos } });
  }
}
