// HU-0802 · Traducción con glosario (M08, RN-08-1, RN-08-2). Las filas de Traduccion se ponen al día con los textos del
// curso al listar y al pedir la traducción (huella del español: si cambió, vuelve a Pendiente aunque estuviera revisada).
// «Traducir pendientes» encola IA-10 en la cola ia; editar el inglés guarda una versión del curso y lo deja Revisado.
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { type EstadoTraduccion, huellaTexto, sincronizarFilas, TAREA_TRADUCIR, type TextoCurso, textosDe } from '@aptio/schema/traduccion';
import { resolverPuntero } from '@aptio/schema/voz';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CursosService } from '../cursos/cursos.service.js';
import type { Trabajo202Dto } from '../cursos/propuesta.dto.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { FiltroTraduccionesDto, TraduccionCambioDto, TraduccionDto } from './traduccion.dto.js';

const IDIOMA = 'en';
type Fila = { id: string; ruta: string; textoOrigenHash: string; estado: string };

@Injectable()
export class TraduccionesService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** Pone las filas al día con los textos del curso y las devuelve. */
  private async sincronizar(cursoId: string, textos: readonly TextoCurso[]): Promise<Fila[]> {
    return this.bd.$transaction(async (tx: Prisma.TransactionClient) => {
      const filas = await tx.traduccion.findMany({ where: { cursoId, idioma: IDIOMA }, select: { id: true, ruta: true, textoOrigenHash: true, estado: true } });
      const { crear, reiniciar, borrar } = sincronizarFilas(textos, filas.map((f) => ({ ...f, estado: f.estado as EstadoTraduccion })));
      if (!crear.length && !reiniciar.length && !borrar.length) return filas;
      if (borrar.length) await tx.traduccion.deleteMany({ where: { id: { in: borrar } } });
      if (crear.length) await tx.traduccion.createMany({ data: crear.map((c) => ({ cursoId, idioma: IDIOMA, ...c })), skipDuplicates: true });
      for (const r of reiniciar) await tx.traduccion.update({ where: { id: r.id }, data: { textoOrigenHash: r.textoOrigenHash, estado: 'PENDIENTE' } });
      return tx.traduccion.findMany({ where: { cursoId, idioma: IDIOMA }, select: { id: true, ruta: true, textoOrigenHash: true, estado: true } });
    });
  }

  async listar(u: UsuarioSesion, cursoId: string, f: FiltroTraduccionesDto): Promise<TraduccionDto[]> {
    const c = await this.cursos.buscar(u, cursoId);
    const textos = textosDe(c.documento);
    const porRuta = new Map((await this.sincronizar(c.id, textos)).map((x) => [x.ruta, x]));
    return textos
      .map((t) => ({ t, fila: porRuta.get(t.ruta)! }))
      .filter(({ fila }) => fila && (!f.estado || fila.estado === f.estado))
      .map(({ t, fila }) => ({ id: fila.id, ruta: t.ruta, pantallaId: t.pantallaId, es: t.es, en: t.en, estado: fila.estado }));
  }

  /** RN-08-2 · Encola IA-10: el worker traduce solo los Pendientes. */
  async traducir(u: UsuarioSesion, cursoId: string): Promise<Trabajo202Dto> {
    const c = await this.cursos.buscar(u, cursoId);
    await this.sincronizar(c.id, textosDe(c.documento));
    const t = await this.bd.trabajoIA.create({
      data: { organizacionId: c.organizacionId, proyectoId: c.proyectoId, tarea: TAREA_TRADUCIR, tipo: 'TEXTO', proveedor: '-', modelo: '-' },
    });
    try {
      await this.colas.encolar('ia', { trabajoId: t.id, organizacionId: c.organizacionId, tarea: TAREA_TRADUCIR, traduccion: { cursoId: c.id } });
    } catch (e) {
      // Sin Redis no queda un trabajo EN_COLA que nadie va a procesar.
      await this.bd.trabajoIA.update({ where: { id: t.id }, data: { estado: 'ERROR', error: 'No se pudo encolar' } });
      throw e;
    }
    return { id: t.id, estado: 'EN_COLA', eventos: '/api/v1/eventos' };
  }

  /** Editar el inglés crea una versión del curso y deja el texto Revisado; marcar Revisado exige que haya inglés. */
  async cambiar(u: UsuarioSesion, traduccionId: string, dto: TraduccionCambioDto): Promise<TraduccionDto> {
    if (dto.en === undefined && dto.estado === undefined) {
      throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica el inglés o el estado' });
    }
    const fila = await this.bd.traduccion.findUnique({ where: { id: traduccionId }, select: { id: true, cursoId: true, ruta: true, idioma: true } });
    if (!fila || fila.idioma !== IDIOMA) throw new NotFoundException('Traducción no encontrada');
    // buscar aplica la organización (y el cliente del revisor): una traducción de otra organización da 404.
    const c = await this.cursos.buscar(u, fila.cursoId).catch(() => { throw new NotFoundException('Traducción no encontrada'); });
    const texto = textosDe(c.documento).find((t) => t.ruta === fila.ruta);
    if (!texto) throw new NotFoundException('El texto ya no está en el curso: recarga la lista');
    let en = texto.en;
    const nuevo = dto.en;
    if (nuevo !== undefined && nuevo !== texto.en) {
      await this.cursos.guardar(u, c.id, null, 'traducción', (doc) => {
        (resolverPuntero(doc, fila.ruta) as { en?: string }).en = nuevo;
        return {};
      });
      en = nuevo;
    } else if (!en) {
      throw new UnprocessableEntityException({ codigo: 'SIN_TRADUCCION', mensaje: 'Escribe o traduce el inglés antes de marcarlo como revisado' });
    }
    // Revisado contra el español de ahora.
    await this.bd.traduccion.update({ where: { id: fila.id }, data: { estado: 'REVISADA', textoOrigenHash: huellaTexto(texto.es) } });
    return { id: fila.id, ruta: fila.ruta, pantallaId: texto.pantallaId, es: texto.es, en, estado: 'REVISADA' };
  }
}
