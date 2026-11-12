// HU-1001 · Matriz de alineación (M10, PNT-18, CP-083): el informe se calcula sin IA desde el documento (RN-10-3) y el
// nivel de Bloom de un objetivo, una pantalla o una pregunta se cambia con una versión nueva del curso.
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { aplicarNiveles, type CambioNivel, informeAlineacion, type NivelBloom } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import type { UsuarioSesion } from '../comun/roles.js';
import { CursosService } from '../cursos/cursos.service.js';
import type { AlineacionCambioDto, AlineacionInformeDto } from './alineacion.dto.js';

@Injectable()
export class AlineacionService {
  constructor(private readonly cursos: CursosService) {}

  async informe(u: UsuarioSesion, cursoId: string): Promise<AlineacionInformeDto> {
    const c = await this.cursos.buscar(u, cursoId);
    return { version: c.version, ...informeAlineacion(c.documento as unknown as CursoDoc) };
  }

  /** 409 VERSION_CAMBIO si otra persona guardó antes; 422 NIVEL_NO_APLICA si algo no existe (nada se guarda). */
  async cambiar(u: UsuarioSesion, cursoId: string, dto: AlineacionCambioDto): Promise<AlineacionInformeDto> {
    const cambios: CambioNivel[] = [
      ...(dto.objetivos ?? []).map((o) => ({ objetivoId: o.id, nivelBloom: o.nivelBloom as NivelBloom })),
      ...(dto.elementos ?? []).map((e) => ({ pantallaId: e.pantallaId, ...(e.preguntaId ? { preguntaId: e.preguntaId } : {}), nivelBloom: e.nivelBloom as NivelBloom })),
    ];
    if (!cambios.length) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica al menos un objetivo o un elemento' });
    const r = await this.cursos.guardar(u, cursoId, dto.version, 'alineación', (doc) => {
      const error = aplicarNiveles(doc, cambios);
      if (error) throw new UnprocessableEntityException({ codigo: 'NIVEL_NO_APLICA', mensaje: error });
      return informeAlineacion(doc);
    });
    return r;
  }
}
