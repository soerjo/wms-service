import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { StorageBinsModule } from './modules/storage-bins/storage-bins.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { InboundModule } from './modules/inbound/inbound.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { AdjustmentsModule } from './modules/adjustments/adjustments.module.js';
import { PosConsumerModule } from './modules/pos-consumer/pos-consumer.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { loggerConfig } from './config/logger.config.js';
import { validate } from './config/env.validation.js';
import { InterServiceHttpClientModule } from './common/http-client/http-client.module.js';

@Module({
  imports: [
    InterServiceHttpClientModule,
    ConfigModule.forRoot({ isGlobal: true, validate }),
    WinstonModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WarehousesModule,
    StorageBinsModule,
    InventoryModule,
    InboundModule,
    TransfersModule,
    AdjustmentsModule,
    PosConsumerModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
