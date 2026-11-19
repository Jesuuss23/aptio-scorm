import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BaseDatosModule } from './base-datos/base-datos.module.js';
import { GuardaRoles } from './comun/guarda-roles.js';
import { GuardaSuspension } from './comun/guarda-suspension.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { CorreoModule } from './correo/correo.module.js';
import { ExportacionesModule } from './exportaciones/exportaciones.module.js';
import { GeneracionesModule } from './generaciones/generaciones.module.js';
import { CursosModule } from './cursos/cursos.module.js';
import { ProyectosModule } from './proyectos/proyectos.module.js';
import { RecursosModule } from './recursos/recursos.module.js';
import { SaludModule } from './salud/salud.module.js';
import { TrabajosModule } from './trabajos/trabajos.module.js';
import { TraduccionesModule } from './traducciones/traducciones.module.js';
import { AlineacionModule } from './alineacion/alineacion.module.js';
import { NavegacionModule } from './navegacion/navegacion.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { VozModule } from './voz/voz.module.js';
import { CostosModule } from './costos/costos.module.js';
import { NegocioModule } from './negocio/negocio.module.js';
import { ConexionesModule } from './conexiones/conexiones.module.js';
import { OperacionModule } from './operacion/operacion.module.js';
import { ComentariosModule } from './comentarios/comentarios.module.js';
import { LimitadorModule } from './comun/limitador.js';
import { SitioModule } from './sitio/sitio.module.js';
import { CaptacionModule } from './captacion/captacion.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    // Variables de la API y, como respaldo, las de packages/db (DATABASE_URL).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../packages/db/.env'] }),
    BaseDatosModule,
    LimitadorModule,
    CorreoModule,
    AuthModule,
    UsuariosModule,
    TrabajosModule,
    ClientesModule,
    ProyectosModule,
    CursosModule,
    TraduccionesModule,
    AlineacionModule,
    NavegacionModule,
    GeneracionesModule,
    ExportacionesModule,
    RecursosModule,
    SaludModule,
    VozModule,
    CostosModule,
    NegocioModule,
    ConexionesModule,
    OperacionModule,
    ComentariosModule,
    // HU-1603 · Antes que el sitio: `GET /s/_popups.json` no debe caer en la ruta comodín `GET /s/*`.
    CaptacionModule,
    VentasModule,
    SitioModule,
  ],
  // HU-1708 · Después de los roles: la cuenta suspendida queda en solo lectura.
  providers: [{ provide: APP_GUARD, useClass: GuardaRoles }, { provide: APP_GUARD, useClass: GuardaSuspension }],
})
export class AppModule {}
