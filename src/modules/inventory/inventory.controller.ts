import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
}
