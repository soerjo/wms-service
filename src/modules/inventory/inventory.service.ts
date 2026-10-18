import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockLedgerRefType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { OnHandQueryDto } from './dto/on-hand-query.dto.js';
import { LedgerQueryDto } from './dto/ledger-query.dto.js';
import { LowStockQueryDto } from './dto/low-stock-query.dto.js';
import { InventorySummaryQueryDto } from './dto/inventory-summary-query.dto.js';

export interface RecordStockMovementParams {
  warehouseId: string;
  binId: string;
  productId: string;
  sku: string;
  batchNumber?: string;
  expiryDate?: Date | null;
  changeQuantity: Prisma.Decimal | number;
  referenceType: StockLedgerRefType;
  referenceId: string;
  notes?: string;
  allowNegative?: boolean;
}

export interface StockAllocationResult {
  binId: string;
  productId: string;
  sku: string;
  batchNumber: string;
  expiryDate: Date | null;
  quantityToDeduct: Prisma.Decimal;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  async recordStockMovement(
    tx: Prisma.TransactionClient,
    params: RecordStockMovementParams,
  ): Promise<Prisma.Decimal> {
    const {
      warehouseId,
      binId,
      productId,
      sku,
      batchNumber = '-',
      expiryDate = null,
      changeQuantity,
      referenceType,
      referenceId,
      notes,
      allowNegative = false,
    } = params;

    const changeDec = new Prisma.Decimal(changeQuantity);

    // 1. Find existing product stock row (or null)
    const existing = await tx.productStock.findUnique({
      where: {
        binId_productId_batchNumber_expiryDate: {
          binId,
          productId,
          batchNumber: batchNumber || '-',
          expiryDate: (expiryDate ?? null) as unknown as Date,
        },
      },
    });

    const currentBalance = existing
      ? new Prisma.Decimal(existing.quantityOnHand)
      : new Prisma.Decimal(0);
    const newBalance = currentBalance.plus(changeDec);

    if (newBalance.lessThan(0) && !allowNegative) {
      throw new BadRequestException(
        `Insufficient stock for SKU ${sku} in bin ${binId}. Current balance: ${currentBalance.toString()}, requested change: ${changeDec.toString()}`,
      );
    }

    // 2. Upsert product stock
    await tx.productStock.upsert({
      where: {
        binId_productId_batchNumber_expiryDate: {
          binId,
          productId,
          batchNumber: batchNumber || '-',
          expiryDate: (expiryDate ?? null) as unknown as Date,
        },
      },
      create: {
        warehouseId,
        binId,
        productId,
        sku,
        batchNumber: batchNumber || '-',
        expiryDate: expiryDate ?? null,
        quantityOnHand: newBalance,
      },
      update: {
        quantityOnHand: newBalance,
      },
    });

    // 3. Append to stock ledger
    await tx.stockLedger.create({
      data: {
        warehouseId,
        binId,
        productId,
        sku,
        batchNumber: batchNumber || '-',
        changeQuantity: changeDec,
        balanceAfter: newBalance,
        referenceType,
        referenceId,
        notes,
      },
    });

    return newBalance;
  }

  async allocateStock(
    warehouseId: string,
    sku: string,
    quantity: number | Prisma.Decimal,
    strategy: 'FEFO' | 'FIFO' = 'FEFO',
  ): Promise<StockAllocationResult[]> {
    const requestedQty = new Prisma.Decimal(quantity);
    if (requestedQty.lessThanOrEqualTo(0)) {
      return [];
    }

    const availableStocks =
      await this.inventoryRepository.findStockForAllocation(
        warehouseId,
        sku,
        strategy,
      );

    let remaining = requestedQty;
    const allocations: StockAllocationResult[] = [];

    for (const stock of availableStocks) {
      if (remaining.lessThanOrEqualTo(0)) break;

      const onHand = new Prisma.Decimal(stock.quantityOnHand);
      if (onHand.lessThanOrEqualTo(0)) continue;

      const takeQty = remaining.greaterThanOrEqualTo(onHand)
        ? onHand
        : remaining;

      allocations.push({
        binId: stock.binId,
        productId: stock.productId,
        sku: stock.sku,
        batchNumber: stock.batchNumber,
        expiryDate: stock.expiryDate,
        quantityToDeduct: takeQty,
      });

      remaining = remaining.minus(takeQty);
    }

    if (remaining.greaterThan(0)) {
      throw new BadRequestException(
        `Insufficient active stock for SKU ${sku} in warehouse ${warehouseId}. Short by ${remaining.toString()}`,
      );
    }

    return allocations;
  }

  async getOnHand(query: OnHandQueryDto) {
    return this.inventoryRepository.findOnHand({
      warehouseId: query.warehouseId,
      sku: query.sku,
      batchNumber: query.batchNumber,
    });
  }

  async getLedger(query: LedgerQueryDto) {
    return this.inventoryRepository.findLedger({
      warehouseId: query.warehouseId,
      sku: query.sku,
      referenceType: query.referenceType,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  async getLowStock(query: LowStockQueryDto) {
    const threshold =
      query.threshold !== undefined ? Number(query.threshold) : 10;
    return this.inventoryRepository.findLowStock(query.warehouseId, threshold);
  }

  /**
   * Dashboard stock summary per warehouse:
   * total QOH, SKU count, low-stock count (QOH <= threshold), and
   * expire-soon count (FEFO, expiryDate within TTL window).
   * Uses grouped aggregates (no N+1).
   * Note: total value (QOH x cost) is reported as null until a unit-cost
   * source exists in the schema (cost is not stored on ProductStock).
   */
  async getInventorySummary(query: InventorySummaryQueryDto) {
    const expireSoonDays = query.expireSoonDays ?? 90;
    const lowStockThreshold = query.lowStockThreshold ?? 10;
    const expireSoonCutoff = new Date(
      Date.now() + expireSoonDays * 24 * 60 * 60 * 1000,
    );

    const [baseAgg, lowAgg, expireAgg, warehouses] = await Promise.all([
      this.inventoryRepository.aggregateSummaryPerWarehouse({
        warehouseId: query.warehouseId,
        lowStockThreshold,
        expireSoonCutoff,
      }),
      this.inventoryRepository.countLowStockPerWarehouse({
        warehouseId: query.warehouseId,
        lowStockThreshold,
      }),
      this.inventoryRepository.countExpireSoonPerWarehouse({
        warehouseId: query.warehouseId,
        expireSoonCutoff,
      }),
      this.prisma.warehouse.findMany({
        where: {
          id: query.warehouseId,
          isActive: true,
        },
        select: { id: true, code: true, name: true },
      }),
    ]);

    const baseByWarehouse = new Map(baseAgg.map((r) => [r.warehouseId, r]));
    const lowByWarehouse = new Map(lowAgg.map((r) => [r.warehouseId, r]));
    const expireByWarehouse = new Map(
      expireAgg.map((r) => [r.warehouseId, r]),
    );

    return warehouses.map((w) => {
      const base = baseByWarehouse.get(w.id);
      const low = lowByWarehouse.get(w.id);
      const expire = expireByWarehouse.get(w.id);
      const totalQoh = base?._sum?.quantityOnHand
        ? new Prisma.Decimal(base._sum.quantityOnHand)
        : new Prisma.Decimal(0);
      return {
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        totalQuantityOnHand: totalQoh.toNumber(),
        totalValue: null as number | null,
        skuCount: base?._count?.sku ?? 0,
        lowStockCount: low?._count?.sku ?? 0,
        expireSoonCount: expire?._count?.sku ?? 0,
        lowStockThreshold,
        expireSoonDays,
      };
    });
  }
}
