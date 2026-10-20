import { Test, TestingModule } from '@nestjs/testing';
import { PosConsumerService } from './pos-consumer.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { BadRequestException } from '@nestjs/common';

describe('PosConsumerService', () => {
  let service: PosConsumerService;

  const mockTx = {
    processedEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    deadLetterEvent: {
      create: jest.fn(),
    },
    storageBin: {
      findFirst: jest.fn(),
    },
  };

  const mockPrismaService = {
    processedEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    deadLetterEvent: {
      create: jest.fn(),
    },
    storageBin: {
      findFirst: jest.fn(),
    },
    warehouse: {
      findFirst: jest
        .fn()
        .mockImplementation(
          (args?: {
            where?: { OR?: Array<{ id?: string; code?: string }> };
          }) => {
            const id = args?.where?.OR?.[0]?.id || 'wh-1';
            return Promise.resolve({ id, code: 'WH-001' });
          },
        ),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  };

  const mockInventoryService = {
    allocateStock: jest.fn(),
    recordStockMovement: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosConsumerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    service = module.get<PosConsumerService>(PosConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('idempotency', () => {
    it('should skip processing if eventId already exists in processed_events', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce({
        eventId: 'evt-dup',
        eventType: 'ORDER_COMPLETED',
      });

      const res = await service.handleEvent({
        eventId: 'evt-dup',
        eventType: 'ORDER_COMPLETED',
        warehouseId: 'wh-1',
        items: [],
      });

      expect(res).toEqual({ status: 'SKIPPED_DUPLICATE', eventId: 'evt-dup' });
      expect(mockInventoryService.allocateStock).not.toHaveBeenCalled();
    });
  });

  describe('ORDER_COMPLETED', () => {
    it('should allocate and deduct stock successfully', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockInventoryService.allocateStock.mockResolvedValueOnce([
        {
          binId: 'bin-1',
          productId: 'prod-1',
          sku: 'SKU-1',
          batchNumber: 'B1',
          expiryDate: null,
          quantityToDeduct: 2,
        },
      ]);
      mockInventoryService.recordStockMovement.mockResolvedValueOnce(8);
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-1',
        eventType: 'ORDER_COMPLETED',
        warehouseId: 'wh-1',
        items: [{ productId: 'prod-1', sku: 'SKU-1', quantity: 2 }],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-1' });
      expect(mockInventoryService.recordStockMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ referenceType: 'POS_SALE' }),
      );
    });

    it('should route to Dead Letter Queue on insufficient stock without failing transaction', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockInventoryService.allocateStock.mockRejectedValueOnce(
        new BadRequestException('Insufficient stock'),
      );
      mockTx.deadLetterEvent.create.mockResolvedValueOnce({});
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-2',
        eventType: 'ORDER_COMPLETED',
        warehouseId: 'wh-1',
        items: [{ productId: 'prod-1', sku: 'SKU-1', quantity: 100 }],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-2' });
      expect(mockTx.deadLetterEvent.create).toHaveBeenCalled();
      const calls = mockTx.deadLetterEvent.create.mock.calls as unknown[][];
      const createCallArg = calls[0][0] as {
        data: { eventId: string; errorReason: string };
      };
      expect(createCallArg.data.eventId).toBe('evt-2');
      expect(createCallArg.data.errorReason).toContain('INSUFFICIENT_STOCK');
    });
  });

  describe('ORDER_REFUNDED', () => {
    it('should restock to quarantine bin for DAMAGED condition', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockTx.storageBin.findFirst.mockResolvedValueOnce({
        id: 'bin-quarantine',
        status: 'QUARANTINE',
      });
      mockInventoryService.recordStockMovement.mockResolvedValueOnce(5);
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-3',
        eventType: 'ORDER_REFUNDED',
        warehouseId: 'wh-1',
        items: [
          {
            productId: 'prod-1',
            sku: 'SKU-1',
            quantity: 1,
            condition: 'DAMAGED',
          },
        ],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-3' });
      expect(mockTx.storageBin.findFirst).toHaveBeenCalledWith({
        where: { warehouseId: 'wh-1', status: 'QUARANTINE' },
      });
      expect(mockInventoryService.recordStockMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          binId: 'bin-quarantine',
          referenceType: 'POS_REFUND',
        }),
      );
    });
  });
});
