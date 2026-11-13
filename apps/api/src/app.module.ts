import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BaseDatosModule } from './base-datos/base-datos.module.js';
import { GuardaRoles } from './comun/guarda-roles.js';
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

@Module({
  imports: [
    // Variables de la API y, como respaldo, las de packages/db (DATABASE_URL).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../packages/db/.env'] }),
    BaseDatosModule,
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
  ],
  providers: [{ provide: APP_GUARD, useClass: GuardaRoles }],
})
export class AppModule {}
