// HU-1103 · Patrones de navegación (M11, PNT-17, CP-087): el patrón y las reglas viven en `navegacion` del curso; el
// preferido del cliente, en su kit de marca. Guardar crea una versión del curso con motivo «navegación».
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { CursoDoc } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CursosService } from '../cursos/cursos.service.js';
import type { NavegacionCambioDto, NavegacionDto } from './navegacion.dto.js';

type Nav = Record<string, unknown> & { patron?: string };
type Glosario = NavegacionDto['glosario'];

@Injectable()
export class NavegacionService {
  constructor(
    private readonly cursos: CursosService,
    private readonly baseDatos: BaseDatosService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async kitDe(proyectoId: string) {
    const p = await this.bd.proyecto.findUnique({ where: { id: proyectoId }, select: { cliente: { select: { kit: { select: { id: true, patronPreferido: true } } } } } });
    return p?.cliente.kit ?? null;
  }

  private respuesta(nav: Nav, version: number, kit: { patronPreferido: string | null } | null, glosario: Glosario = []): NavegacionDto {
    const patronPreferido = kit?.patronPreferido ?? null;
    // Sin `navegacion` el reproductor usa Clásico con actividades obligatorias (RN-11-1).
    const patron = nav.patron ?? 'clasico';
    return { modo: 'condiciones', ...nav, patron, version, glosario, patronPreferido, patronPreferidoDelCliente: patronPreferido === patron, hayKit: Boolean(kit) };
  }

  async ver(u: UsuarioSesion, cursoId: string): Promise<NavegacionDto> {
    const c = await this.cursos.buscar(u, cursoId);
    const doc = c.documento as unknown as CursoDoc & { navegacion?: Nav; glosario?: Glosario };
    return this.respuesta(doc.navegacion ?? {}, c.version, await this.kitDe(c.proyectoId), doc.glosario ?? []);
  }

  /** 409 VERSION_CAMBIO con una versión vieja; 422 si el cambio deja el curso inválido o se pide preferido sin kit. */
  async guardar(u: UsuarioSesion, cursoId: string, dto: NavegacionCambioDto): Promise<NavegacionDto> {
    const { version: leida, patronPreferidoDelCliente: preferido, glosario, ...campos } = dto;
    const c = await this.cursos.buscar(u, cursoId);
    const kit = await this.kitDe(c.proyectoId);
    if (preferido && !kit) throw new UnprocessableEntityException({ codigo: 'SIN_KIT', mensaje: 'El cliente aún no tiene kit de marca para guardar su patrón preferido' });
    const r = await this.cursos.guardar(u, cursoId, leida, 'navegación', (doc) => {
      const d = doc as CursoDoc & { navegacion?: Nav; glosario?: Glosario };
      // Solo los campos que vienen (el DTO trae las propiedades ausentes como undefined).
      const nav: Nav = { ...(d.navegacion ?? {}), ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)) };
      // El patrón personalizado solo acompaña al patrón «personalizado» (HU-1104 lo edita).
      if (nav.patron !== 'personalizado') delete nav.patronPersonalizado;
      d.navegacion = nav;
      // SUP-104 · El glosario se reemplaza entero; vacío, se quita. Los ids no se repiten.
      if (glosario !== undefined) {
        if (new Set(glosario.map((x) => x.id)).size !== glosario.length) throw new UnprocessableEntityException({ codigo: 'GLOSARIO_REPETIDO', mensaje: 'Hay términos del glosario con el mismo identificador' });
        const lleno = (x: { es?: string; en?: string }) => Boolean(x.es?.trim() || x.en?.trim());
        if (glosario.some((x) => !lleno(x.termino) || !lleno(x.definicion))) throw new UnprocessableEntityException({ codigo: 'GLOSARIO_INCOMPLETO', mensaje: 'Cada término del glosario necesita su texto y su definición' });
        if (glosario.length) d.glosario = glosario.map((x) => ({ id: x.id, termino: { ...x.termino }, definicion: { ...x.definicion } }));
        else delete d.glosario;
      }
      return { nav, glosario: d.glosario ?? [] };
    });
    let kitFinal = kit;
    if (preferido && kit) {
      const patron = r.nav.patron ?? 'clasico';
      kitFinal = await this.bd.kitMarca.update({ where: { id: kit.id }, data: { patronPreferido: patron, version: { increment: 1 } }, select: { id: true, patronPreferido: true } });
    }
    return this.respuesta(r.nav, r.version, kitFinal, r.glosario);
  }
}
