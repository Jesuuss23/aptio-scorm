import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BaseDatosModule } from './base-datos/base-datos.module.js';
import { GuardaRoles } from './comun/guarda-roles.js';
import { CorreoModule } from './correo/correo.module.js';
import { SaludModule } from './salud/salud.module.js';
import { TrabajosModule } from './trabajos/trabajos.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';

@Module({
  imports: [
    // Variables de la API y, como respaldo, las de packages/db (DATABASE_URL).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../packages/db/.env'] }),
    BaseDatosModule,
    CorreoModule,
    AuthModule,
    UsuariosModule,
    TrabajosModule,
    SaludModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GuardaRoles }],
})
export class AppModule {}
