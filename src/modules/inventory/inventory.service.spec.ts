import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type StockRow = Awaited<
  ReturnType<InventoryRepository['findStockForAllocation']>
>[number];

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepository: InventoryRepository;

  const mockTx = {
    productStock: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    stockLedger: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: InventoryRepository,
          useValue: {
            findOnHand: jest.fn(),
            findLedger: jest.fn(),
            findLowStock: jest.fn(),
            findStockForAllocation: jest.fn(),
            findExpiringSoon: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) =>
              cb(mockTx),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepository = module.get<InventoryRepository>(InventoryRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordStockMovement', () => {
    it('calculates balance and records ledger entry when stock is added', async () => {
      mockTx.productStock.findUnique.mockResolvedValue(null);
      mockTx.productStock.upsert.mockResolvedValue({ quantityOnHand: 50 });
      mockTx.stockLedger.create.mockResolvedValue({});

      const newBalance = await service.recordStockMovement(
        mockTx as unknown as Prisma.TransactionClient,
        {
          warehouseId: 'wh-1',
          binId: 'bin-1',
          productId: 'prod-1',
          sku: 'SKU-001',
          changeQuantity: 50,
          referenceType: 'INBOUND_PO',
          referenceId: 'PO-100',
        },
      );

      expect(newBalance.toNumber()).toBe(50);
      expect(mockTx.productStock.upsert).toHaveBeenCalled();
      expect(mockTx.stockLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changeQuantity: expect.any(Prisma.Decimal) as unknown,
            balanceAfter: expect.any(Prisma.Decimal) as unknown,
            referenceType: 'INBOUND_PO',
            referenceId: 'PO-100',
          }) as unknown,
        }),
      );
    });

    it('rejects stock movement resulting in negative balance unless allowNegative is true', async () => {
      mockTx.productStock.findUnique.mockResolvedValue({
        quantityOnHand: 10,
      });

      await expect(
        service.recordStockMovement(
          mockTx as unknown as Prisma.TransactionClient,
          {
            warehouseId: 'wh-1',
            binId: 'bin-1',
            productId: 'prod-1',
            sku: 'SKU-001',
            changeQuantity: -15,
            referenceType: 'POS_SALE',
            referenceId: 'ORDER-1',
          },
        ),
      ).rejects.toThrow(BadRequestException);

      // With allowNegative = true
      mockTx.productStock.upsert.mockResolvedValue({ quantityOnHand: -5 });
      mockTx.stockLedger.create.mockResolvedValue({});

      const newBalance = await service.recordStockMovement(
        mockTx as unknown as Prisma.TransactionClient,
        {
          warehouseId: 'wh-1',
          binId: 'bin-1',
          productId: 'prod-1',
          sku: 'SKU-001',
          changeQuantity: -15,
          referenceType: 'POS_SALE',
          referenceId: 'ORDER-1',
          allowNegative: true,
        },
      );

      expect(newBalance.toNumber()).toBe(-5);
    });
  });

  describe('allocateStock', () => {
    it('allocates stock using FEFO (earliest expiry first)', async () => {
      const mockStocks = [
        {
          binId: 'bin-1',
          productId: 'prod-1',
          sku: 'SKU-001',
          batchNumber: 'B-1',
          expiryDate: new Date('2026-06-30'),
          quantityOnHand: 30,
        },
        {
          binId: 'bin-2',
          productId: 'prod-1',
          sku: 'SKU-001',
          batchNumber: 'B-2',
          expiryDate: new Date('2026-12-31'),
          quantityOnHand: 50,
        },
      ];

      jest
        .spyOn(inventoryRepository, 'findStockForAllocation')
        .mockResolvedValue(mockStocks as unknown as StockRow[]);

      const allocations = await service.allocateStock(
        'wh-1',
        'SKU-001',
        40,
        'FEFO',
      );

      expect(allocations).toHaveLength(2);
      expect(allocations[0].binId).toBe('bin-1'); // Earlier expiry
      expect(allocations[0].quantityToDeduct.toNumber()).toBe(30);
      expect(allocations[1].binId).toBe('bin-2');
      expect(allocations[1].quantityToDeduct.toNumber()).toBe(10);
    });

    it('throws BadRequestException if requested quantity exceeds available stock', async () => {
      const mockStocks = [
        {
          binId: 'bin-1',
          productId: 'prod-1',
          sku: 'SKU-001',
          batchNumber: 'B-1',
          expiryDate: new Date('2026-06-30'),
          quantityOnHand: 10,
        },
      ];

      jest
        .spyOn(inventoryRepository, 'findStockForAllocation')
        .mockResolvedValue(mockStocks as unknown as StockRow[]);

      await expect(
        service.allocateStock('wh-1', 'SKU-001', 25, 'FIFO'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getExpiringSoon', () => {
    it('queries inventory expiring soon within cutoff window', async () => {
      const mockExpiring = [
        {
          sku: 'SKU-001',
          quantityOnHand: 20,
          expiryDate: new Date(Date.now() + 10 * 86400000),
        },
      ];

      const spy = jest
        .spyOn(inventoryRepository, 'findExpiringSoon')
        .mockResolvedValue(mockExpiring as any);

      const result = await service.getExpiringSoon({
        warehouseId: 'wh-1',
        days: 30,
      });

      expect(result).toEqual(mockExpiring);
      expect(spy).toHaveBeenCalledWith('wh-1', expect.any(Date));
    });
  });
});
