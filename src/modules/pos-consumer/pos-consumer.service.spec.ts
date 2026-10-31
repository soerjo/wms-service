import { Test, TestingModule } from '@nestjs/testing';
import { PosConsumerService } from './pos-consumer.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { WarehousesRepository } from '../warehouses/warehouses.repository.js';
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
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  };

  const mockInventoryService = {
    allocateStock: jest.fn(),
    recordStockMovement: jest.fn(),
  };

  const mockWarehousesRepository = {
    findByIdOrNull: jest.fn(),
    findByStoreId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWarehousesRepository.findByIdOrNull.mockReset();
    mockWarehousesRepository.findByStoreId.mockReset();
    mockWarehousesRepository.findByIdOrNull.mockResolvedValue({ id: 'wh-1' });
    mockWarehousesRepository.findByStoreId.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosConsumerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InventoryService, useValue: mockInventoryService },
        {
          provide: WarehousesRepository,
          useValue: mockWarehousesRepository,
        },
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

    it('should resolve warehouse by storeId when warehouseId is absent', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByStoreId.mockResolvedValueOnce({
        id: 'wh-store-1',
      });
      mockInventoryService.allocateStock.mockResolvedValueOnce([
        {
          binId: 'bin-store-1',
          productId: 'prod-1',
          sku: 'SKU-1',
          batchNumber: 'B1',
          expiryDate: null,
          quantityToDeduct: 1,
        },
      ]);
      mockInventoryService.recordStockMovement.mockResolvedValueOnce(9);
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-store-1',
        eventType: 'ORDER_COMPLETED',
        organizationId: 'org-1',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', sku: 'SKU-1', quantity: 1 }],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-store-1' });
      expect(mockWarehousesRepository.findByStoreId).toHaveBeenCalledWith(
        'store-1',
        'org-1',
        true,
      );
      expect(mockInventoryService.allocateStock).toHaveBeenCalledWith(
        'wh-store-1',
        'SKU-1',
        1,
        'FEFO',
      );
      expect(mockInventoryService.recordStockMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          warehouseId: 'wh-store-1',
          referenceType: 'POS_SALE',
        }),
      );
    });

    it('should fall back to storeId when the provided warehouseId does not exist', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByIdOrNull.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByStoreId.mockResolvedValueOnce({
        id: 'wh-store-2',
      });
      mockInventoryService.allocateStock.mockResolvedValueOnce([]);
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-store-2',
        eventType: 'ORDER_COMPLETED',
        warehouseId: 'wh-missing',
        storeId: 'store-2',
        items: [{ productId: 'prod-1', sku: 'SKU-1', quantity: 1 }],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-store-2' });
      expect(mockInventoryService.allocateStock).toHaveBeenCalledWith(
        'wh-store-2',
        'SKU-1',
        1,
        'FEFO',
      );
    });

    it('should route to Dead Letter Queue when no warehouse can be resolved', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByIdOrNull.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByStoreId.mockResolvedValueOnce(null);
      mockTx.deadLetterEvent.create.mockResolvedValueOnce({});
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-no-wh',
        eventType: 'ORDER_COMPLETED',
        storeId: 'store-missing',
        items: [{ productId: 'prod-1', sku: 'SKU-1', quantity: 1 }],
      });

      expect(res).toEqual({ status: 'PROCESSED', eventId: 'evt-no-wh' });
      expect(mockInventoryService.allocateStock).not.toHaveBeenCalled();
      expect(mockTx.deadLetterEvent.create).toHaveBeenCalled();
      const calls = mockTx.deadLetterEvent.create.mock.calls as unknown[][];
      const createCallArg = calls[0][0] as {
        data: { eventId: string; errorReason: string };
      };
      expect(createCallArg.data.eventId).toBe('evt-no-wh');
      expect(createCallArg.data.errorReason).toBe('WAREHOUSE_NOT_FOUND');
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

    it('should resolve warehouse by storeId for refunds', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByStoreId.mockResolvedValueOnce({
        id: 'wh-store-3',
      });
      mockTx.storageBin.findFirst.mockResolvedValueOnce({
        id: 'bin-active',
        status: 'ACTIVE',
      });
      mockInventoryService.recordStockMovement.mockResolvedValueOnce(5);
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-refund-store',
        eventType: 'ORDER_REFUNDED',
        storeId: 'store-3',
        items: [
          {
            productId: 'prod-1',
            sku: 'SKU-1',
            quantity: 1,
            condition: 'SELLABLE',
          },
        ],
      });

      expect(res).toEqual({
        status: 'PROCESSED',
        eventId: 'evt-refund-store',
      });
      expect(mockWarehousesRepository.findByStoreId).toHaveBeenCalledWith(
        'store-3',
        undefined,
        true,
      );
      expect(mockInventoryService.recordStockMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          warehouseId: 'wh-store-3',
          referenceType: 'POS_REFUND',
        }),
      );
    });

    it('should route refunds to Dead Letter Queue when no warehouse can be resolved', async () => {
      mockPrismaService.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByIdOrNull.mockResolvedValueOnce(null);
      mockWarehousesRepository.findByStoreId.mockResolvedValueOnce(null);
      mockTx.deadLetterEvent.create.mockResolvedValueOnce({});
      mockTx.processedEvent.create.mockResolvedValueOnce({});

      const res = await service.handleEvent({
        eventId: 'evt-refund-no-wh',
        eventType: 'ORDER_REFUNDED',
        storeId: 'store-missing',
        items: [
          {
            productId: 'prod-1',
            sku: 'SKU-1',
            quantity: 1,
            condition: 'SELLABLE',
          },
        ],
      });

      expect(res).toEqual({
        status: 'PROCESSED',
        eventId: 'evt-refund-no-wh',
      });
      expect(mockInventoryService.recordStockMovement).not.toHaveBeenCalled();
      expect(mockTx.deadLetterEvent.create).toHaveBeenCalled();
      const calls = mockTx.deadLetterEvent.create.mock.calls as unknown[][];
      const createCallArg = calls[0][0] as {
        data: { eventId: string; errorReason: string };
      };
      expect(createCallArg.data.eventId).toBe('evt-refund-no-wh');
      expect(createCallArg.data.errorReason).toBe('WAREHOUSE_NOT_FOUND');
    });
  });
});
