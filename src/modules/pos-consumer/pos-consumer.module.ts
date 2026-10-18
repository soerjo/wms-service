import { Module } from '@nestjs/common';
import { PosConsumerService } from './pos-consumer.service.js';
import { PosDevController } from './pos-dev.controller.js';
import { PosKafkaConsumer } from './pos-kafka.consumer.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [PosDevController],
  providers: [PosConsumerService, PosKafkaConsumer],
  exports: [PosConsumerService],
})
export class PosConsumerModule {}
