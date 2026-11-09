import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ConfigSesion } from './config-sesion.js';
import { SesionMiddleware } from './sesion.middleware.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, ConfigSesion, TokensService, SesionMiddleware],
  exports: [AuthService, TokensService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SesionMiddleware).forRoutes('*');
  }
}
