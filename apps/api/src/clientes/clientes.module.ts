import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module.js';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';
import { FichasController } from './fichas.controller.js';
import { FichasService } from './fichas.service.js';
import { GlosarioController } from './glosario.controller.js';
import { GlosarioService } from './glosario.service.js';
import { KitController } from './kit.controller.js';
import { KitService } from './kit.service.js';
import { PantallasModeloController } from './pantallas-modelo.controller.js';
import { PantallasModeloService } from './pantallas-modelo.service.js';

@Module({
  imports: [RecursosModule],
  controllers: [ClientesController, KitController, PantallasModeloController, GlosarioController, FichasController],
  providers: [ClientesService, KitService, PantallasModeloService, GlosarioService, FichasService],
  exports: [ClientesService, PantallasModeloService, GlosarioService],
})
export class ClientesModule {}
