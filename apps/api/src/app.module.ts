import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BaseDatosModule } from './base-datos/base-datos.module.js';
import { GuardaRoles } from './comun/guarda-roles.js';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    // Variables de la API y, como respaldo, las de packages/db (DATABASE_URL).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../packages/db/.env'] }),
    BaseDatosModule,
    SaludModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GuardaRoles }],
})
export class AppModule {}
