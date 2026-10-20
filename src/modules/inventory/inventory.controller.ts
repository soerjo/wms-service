import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service.js';
import { OnHandQueryDto } from './dto/on-hand-query.dto.js';
import { LedgerQueryDto } from './dto/ledger-query.dto.js';
import { LowStockQueryDto } from './dto/low-stock-query.dto.js';
import { InventorySummaryQueryDto } from './dto/inventory-summary-query.dto.js';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('v1/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('on-hand')
  async getOnHand(@Query() query: OnHandQueryDto) {
    return this.inventoryService.getOnHand(query);
  }

  @Get('ledger')
  async getLedger(@Query() query: LedgerQueryDto) {
    return this.inventoryService.getLedger(query);
  }

  @Get('low-stock')
  async getLowStock(@Query() query: LowStockQueryDto) {
    return this.inventoryService.getLowStock(query);
  }

  @Get('summary')
  async getInventorySummary(@Query() query: InventorySummaryQueryDto) {
    return this.inventoryService.getInventorySummary(query);
  }

  @Get('expiring-soon')
  @ApiOperation({ summary: 'List batches expiring soon ordered by FEFO' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getExpiringSoon(
    @Query('warehouseId') warehouseId?: string,
    @Query('days') days?: string,
  ) {
    return this.inventoryService.getExpiringSoon({
      warehouseId,
      days: days ? Number(days) : undefined,
    });
  }
}
