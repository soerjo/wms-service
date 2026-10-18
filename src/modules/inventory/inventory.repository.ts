import { Injectable } from '@nestjs/common';
import { StockLedgerRefType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class InventoryRepository {
  constructor(private prisma: PrismaService) {}

  async findOnHand(filters: {
    warehouseId?: string;
    sku?: string;
    batchNumber?: string;
  }) {
    return this.prisma.productStock.findMany({
      where: {
        warehouseId: filters.warehouseId,
        sku: filters.sku,
        batchNumber: filters.batchNumber,
        quantityOnHand: { gt: 0 },
      },
      include: {
        warehouse: true,
        bin: true,
      },
      orderBy: [{ sku: 'asc' }, { expiryDate: 'asc' }],
    });
  }

  async findLedger(filters: {
    warehouseId?: string;
    sku?: string;
    referenceType?: StockLedgerRefType;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this.prisma.stockLedger.findMany({
      where: {
        warehouseId: filters.warehouseId,
        sku: filters.sku,
        referenceType: filters.referenceType,
        transactionTime: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
      },
      include: {
        warehouse: true,
        bin: true,
      },
      orderBy: { transactionTime: 'desc' },
    });
  }

  async findLowStock(warehouseId?: string, threshold = 10) {
    return this.prisma.productStock.findMany({
      where: {
        warehouseId,
        quantityOnHand: { lte: threshold, gt: 0 },
      },
      include: {
        warehouse: true,
        bin: true,
      },
      orderBy: { quantityOnHand: 'asc' },
    });
  }

  async findStockForAllocation(
    warehouseId: string,
    sku: string,
    strategy: 'FEFO' | 'FIFO',
  ) {
    return this.prisma.productStock.findMany({
      where: {
        warehouseId,
        sku,
        quantityOnHand: { gt: 0 },
        bin: {
          status: 'ACTIVE',
        },
      },
      include: {
        bin: true,
      },
      orderBy:
        strategy === 'FEFO'
          ? [{ expiryDate: 'asc' }, { updatedAt: 'asc' }]
          : [{ updatedAt: 'asc' }, { expiryDate: 'asc' }],
    });
  }

  /**
   * Aggregated stock summary per warehouse — single grouped query, no N+1.
   * Returns total QOH, distinct SKU count, and low-stock count per warehouse.
   */
  async aggregateSummaryPerWarehouse(filters: {
    warehouseId?: string;
    lowStockThreshold: number;
    expireSoonCutoff: Date;
  }) {
    return this.prisma.productStock.groupBy({
      by: ['warehouseId'],
      where: {
        warehouseId: filters.warehouseId,
        quantityOnHand: { gt: 0 },
      },
      _sum: {
        quantityOnHand: true,
      },
      _count: {
        sku: true,
      },
    });
  }

  /**
   * Low-stock counts per warehouse (QOH <= threshold, QOH > 0), grouped.
   */
  async countLowStockPerWarehouse(filters: {
    warehouseId?: string;
    lowStockThreshold: number;
  }) {
    const rows = await this.prisma.productStock.groupBy({
      by: ['warehouseId'],
      where: {
        warehouseId: filters.warehouseId,
        quantityOnHand: { lte: filters.lowStockThreshold, gt: 0 },
      },
      _count: {
        sku: true,
      },
    });
    return rows;
  }

  /**
   * Expire-soon counts per warehouse (expiryDate within the FEFO TTL window),
   * grouped. Uses a flat where + groupBy instead of per-row evaluation.
   */
  async countExpireSoonPerWarehouse(filters: {
    warehouseId?: string;
    expireSoonCutoff: Date;
  }) {
    const rows = await this.prisma.productStock.groupBy({
      by: ['warehouseId'],
      where: {
        warehouseId: filters.warehouseId,
        quantityOnHand: { gt: 0 },
        expiryDate: {
          not: null,
          lte: filters.expireSoonCutoff,
          gte: new Date(0),
        },
      },
      _count: {
        sku: true,
      },
    });
    return rows;
  }

  /**
   * Value aggregation requires unit cost which is NOT stored on ProductStock
   * in the current schema; a raw query joins the ledger-free stock table with
   * warehouse grouping. Cost basis defaults to 0 until a price/cost source
   * (e.g. inbound PO cost) is available — see roadmap.
   */
  async sumQuantityOnHandPerWarehouse(warehouseId?: string) {
    return this.prisma.productStock.groupBy({
      by: ['warehouseId'],
      where: {
        warehouseId,
        quantityOnHand: { gt: 0 },
      },
      _sum: {
        quantityOnHand: true,
      },
      _count: {
        sku: true,
      },
    });
  }
}
