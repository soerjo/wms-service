import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PosEventPayload } from './interfaces/pos-event.interface.js';

@Injectable()
export class PosConsumerService {
  private readonly logger = new Logger(PosConsumerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async handleEvent(payload: PosEventPayload) {
    const { eventId, eventType } = payload;

    // 1. Idempotency check
    const existing = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });
    if (existing) {
      this.logger.log(
        `Event ${eventId} (${eventType}) already processed. Skipping.`,
      );
      return { status: 'SKIPPED_DUPLICATE', eventId };
    }

    if (eventType === 'ORDER_COMPLETED') {
      return this.handleOrderCompleted(payload);
    } else if (eventType === 'ORDER_REFUNDED') {
      return this.handleOrderRefunded(payload);
    } else {
      throw new BadRequestException(`Unknown event type: ${String(eventType)}`);
    }
  }

  private async resolveWarehouseId(rawId?: string): Promise<string> {
    if (!rawId) {
      const defaultWh = await this.prisma.warehouse.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return defaultWh?.id || 'default-warehouse';
    }
    const wh = await this.prisma.warehouse.findFirst({
      where: {
        OR: [{ id: rawId }, { code: rawId }],
      },
    });
    return wh ? wh.id : rawId;
  }

  private async handleOrderCompleted(payload: PosEventPayload) {
    const rawWhId =
      payload.warehouseId ||
      (payload as unknown as { storeId?: string }).storeId;
    const warehouseId = await this.resolveWarehouseId(rawWhId);
    const { eventId, items } = payload;

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        try {
          // Attempt allocation (FEFO default)
          const allocations = await this.inventoryService.allocateStock(
            warehouseId,
            item.sku,
            item.quantity,
            'FEFO',
          );

          for (const alloc of allocations) {
            await this.inventoryService.recordStockMovement(tx, {
              warehouseId,
              binId: alloc.binId,
              productId: alloc.productId,
              sku: alloc.sku,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              changeQuantity: new Prisma.Decimal(
                alloc.quantityToDeduct,
              ).negated(),
              referenceType: 'POS_SALE',
              referenceId: eventId,
              notes: `POS Order Completed: ${eventId}`,
            });
          }
        } catch (err: unknown) {
          const errObj = err as { message?: string };
          const errorMessage = errObj?.message || String(err);
          this.logger.warn(
            `Insufficient stock for event ${eventId}, SKU ${item.sku}: ${errorMessage}. Routing to Dead Letter Queue.`,
          );

          await tx.deadLetterEvent.create({
            data: {
              eventId,
              eventType: 'ORDER_COMPLETED',
              payload: payload as unknown as Prisma.InputJsonValue,
              errorReason: `INSUFFICIENT_STOCK: ${errorMessage}`,
              status: 'UNRESOLVED',
            },
          });
        }
      }

      // Record processed event
      await tx.processedEvent.create({
        data: {
          eventId,
          sourceService: payload.sourceService || 'POS',
          eventType: 'ORDER_COMPLETED',
        },
      });
    });

    return { status: 'PROCESSED', eventId };
  }

  private async handleOrderRefunded(payload: PosEventPayload) {
    const rawWhId =
      payload.warehouseId ||
      (payload as unknown as { storeId?: string }).storeId;
    const warehouseId = await this.resolveWarehouseId(rawWhId);
    const { eventId, items } = payload;

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        let targetBinId = 'binId' in item ? item.binId : undefined;

        if (!targetBinId) {
          const condition = 'condition' in item ? item.condition : 'SELLABLE';
          const targetStatus =
            condition === 'DAMAGED' ? 'QUARANTINE' : 'ACTIVE';

          const bin = await tx.storageBin.findFirst({
            where: {
              warehouseId,
              status: targetStatus,
            },
          });

          if (!bin) {
            // Fallback to any active bin in warehouse
            const fallbackBin = await tx.storageBin.findFirst({
              where: {
                warehouseId,
                status: 'ACTIVE',
              },
            });
            if (!fallbackBin) {
              throw new BadRequestException(
                `No suitable storage bin found in warehouse ${warehouseId} for refund item ${item.sku}`,
              );
            }
            targetBinId = fallbackBin.id;
          } else {
            targetBinId = bin.id;
          }
        }

        const condition = 'condition' in item ? item.condition : 'SELLABLE';
        const notes = `POS Order Refund (${condition}): ${eventId}`;

        await this.inventoryService.recordStockMovement(tx, {
          warehouseId,
          binId: targetBinId,
          productId: item.productId,
          sku: item.sku,
          batchNumber: item.batchNumber || '-',
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          changeQuantity: item.quantity,
          referenceType: 'POS_REFUND',
          referenceId: eventId,
          notes,
        });
      }

      await tx.processedEvent.create({
        data: {
          eventId,
          sourceService: payload.sourceService || 'POS',
          eventType: 'ORDER_REFUNDED',
        },
      });
    });

    return { status: 'PROCESSED', eventId };
  }
}
