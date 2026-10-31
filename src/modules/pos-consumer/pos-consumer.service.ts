import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { WarehousesRepository } from '../warehouses/warehouses.repository.js';
import {
  PosEventPayload,
  PosOrderCompletedPayload,
  PosOrderRefundedPayload,
} from './interfaces/pos-event.interface.js';

@Injectable()
export class PosConsumerService {
  private readonly logger = new Logger(PosConsumerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly warehousesRepository: WarehousesRepository,
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

  /**
   * Resolve the target warehouse for a POS event. Prefer an explicit
   * warehouseId (optionally scoped to an organization); otherwise fall back to
   * an active warehouse mapped to the event's storeId.
   */
  private async resolveWarehouseId(
    payload: PosEventPayload,
  ): Promise<string | null> {
    const { warehouseId, storeId, organizationId } = payload;

    if (warehouseId) {
      const warehouse = await this.warehousesRepository.findByIdOrNull(
        warehouseId,
        organizationId,
      );
      if (warehouse) {
        return warehouse.id;
      }
    }

    if (storeId) {
      const warehouse = await this.warehousesRepository.findByStoreId(
        storeId,
        organizationId,
        true,
      );
      if (warehouse) {
        return warehouse.id;
      }
    }

    return null;
  }

  private async routeToDeadLetter(payload: PosEventPayload) {
    const { eventId } = payload;
    this.logger.warn(
      `No warehouse found for event ${eventId} (warehouseId=${payload.warehouseId ?? '-'}, storeId=${payload.storeId ?? '-'}, organizationId=${payload.organizationId ?? '-'}). Routing to Dead Letter Queue.`,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.deadLetterEvent.create({
        data: {
          eventId,
          eventType: payload.eventType,
          payload: payload as unknown as Prisma.InputJsonValue,
          errorReason: 'WAREHOUSE_NOT_FOUND',
          status: 'UNRESOLVED',
        },
      });

      await tx.processedEvent.create({
        data: {
          eventId,
          sourceService: payload.sourceService || 'POS',
          eventType: payload.eventType,
        },
      });
    });

    return { status: 'PROCESSED', eventId };
  }

  private async handleOrderCompleted(payload: PosOrderCompletedPayload) {
    const { eventId, items } = payload;

    const warehouseId = await this.resolveWarehouseId(payload);
    if (!warehouseId) {
      return this.routeToDeadLetter(payload);
    }

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

  private async handleOrderRefunded(payload: PosOrderRefundedPayload) {
    const { eventId, items } = payload;

    const warehouseId = await this.resolveWarehouseId(payload);
    if (!warehouseId) {
      return this.routeToDeadLetter(payload);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        let targetBinId = item.binId;

        if (!targetBinId) {
          const condition = item.condition;
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

        const condition = item.condition;
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
