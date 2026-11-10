import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';
import { KitController } from './kit.controller.js';
import { KitService } from './kit.service.js';

@Module({
  imports: [RecursosModule],
  controllers: [ClientesController, KitController],
  providers: [ClientesService, KitService],
  exports: [ClientesService],
})
export class ClientesModule {}
