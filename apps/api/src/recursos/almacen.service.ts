import { Injectable } from '@nestjs/common';
import { Almacen, configDesdeEnv } from '@aptio/almacen';

/** Almacenamiento S3 de la API. Se crea al primer uso, cuando ConfigModule ya cargó las variables. */
@Injectable()
export class AlmacenService {
  private instancia?: Almacen;

  get almacen(): Almacen {
    this.instancia ??= new Almacen(configDesdeEnv());
    return this.instancia;
  }
}
