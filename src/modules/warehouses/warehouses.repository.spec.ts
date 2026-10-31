import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WarehousesRepository } from './warehouses.repository.js';

describe('WarehousesRepository', () => {
  let repository: WarehousesRepository;

  const mockPrisma = {
    warehouse: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new WarehousesRepository(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('should filter findAll by organizationId, storeId, type and isActive', async () => {
    mockPrisma.warehouse.findMany.mockResolvedValueOnce([]);

    await repository.findAll({
      organizationId: 'org-1',
      storeId: 'store-1',
      type: 'STORE_OUTLET',
      isActive: true,
    });

    expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        storeId: 'store-1',
        type: 'STORE_OUTLET',
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('should scope findById by organizationId', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce({ id: 'wh-1' });

    const result = await repository.findById('wh-1', 'org-1');

    expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: 'wh-1', organizationId: 'org-1' },
    });
    expect(result).toEqual({ id: 'wh-1' });
  });

  it('should throw NotFoundException when findById finds no warehouse', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

    await expect(repository.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should scope findByCode by organizationId', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

    await repository.findByCode('WH-1', 'org-1');

    expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { code: 'WH-1', organizationId: 'org-1' },
    });
  });

  it('should find an active warehouse by storeId scoped to organizationId', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce({ id: 'wh-store' });

    const result = await repository.findByStoreId('store-1', 'org-1', true);

    expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        organizationId: 'org-1',
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual({ id: 'wh-store' });
  });

  it('should create a warehouse scoped to an organization', async () => {
    const data = {
      code: 'WH-1',
      name: 'Warehouse 1',
      type: 'CENTRAL_DC' as const,
      organizationId: 'org-1',
      storeId: 'store-1',
    };
    mockPrisma.warehouse.create.mockResolvedValueOnce({ id: 'wh-1', ...data });

    const result = await repository.create(data);

    expect(mockPrisma.warehouse.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'wh-1', ...data });
  });
});
