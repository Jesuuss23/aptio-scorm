import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Forma de error de docs/api/openapi.yaml (components.schemas.Error). */
export interface CuerpoError {
  codigo: string;
  mensaje: string;
  detalles?: Record<string, unknown>[];
}

const CODIGOS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'NO_VALIDO',
  [HttpStatus.UNAUTHORIZED]: 'NO_AUTENTICADO',
  [HttpStatus.FORBIDDEN]: 'SIN_PERMISO',
  [HttpStatus.NOT_FOUND]: 'NO_ENCONTRADO',
  [HttpStatus.CONFLICT]: 'CONFLICTO',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'DEMASIADO_GRANDE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'NO_VALIDO',
  [HttpStatus.TOO_MANY_REQUESTS]: 'DEMASIADAS_SOLICITUDES',
};

/** Convierte cualquier error en { codigo, mensaje, detalles } sin filtrar detalles internos. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const estado = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpo: CuerpoError = { codigo: CODIGOS[estado] ?? 'ERROR_INTERNO', mensaje: 'Error interno' };

    if (error instanceof HttpException) {
      const r = error.getResponse();
      const original = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
      if (typeof original.codigo === 'string') cuerpo.codigo = original.codigo;
      const mensaje = original.message ?? original.mensaje ?? error.message;
      if (Array.isArray(mensaje)) {
        // ValidationPipe devuelve una lista de mensajes, uno por campo inválido.
        cuerpo.mensaje = 'Datos no válidos';
        cuerpo.detalles = mensaje.map((m) => ({ mensaje: String(m) }));
      } else {
        cuerpo.mensaje = String(mensaje);
      }
      if (Array.isArray(original.detalles)) cuerpo.detalles = original.detalles as Record<string, unknown>[];
    } else {
      this.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    res.status(estado).json(cuerpo);
  }
}
