import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseType } from '@prisma/client';
import { WarehousesRepository } from './warehouses.repository.js';
import { WarehousesService } from './warehouses.service.js';

describe('WarehousesService', () => {
  let service: WarehousesService;

  const mockRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehousesService,
        { provide: WarehousesRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<WarehousesService>(WarehousesService);
  });

  it('should pass organization and store filters through to the repository', async () => {
    mockRepository.findAll.mockResolvedValueOnce([]);

    await service.findAll({
      organizationId: 'org-1',
      storeId: 'store-1',
      type: WarehouseType.STORE_OUTLET,
      isActive: true,
    });

    expect(mockRepository.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      storeId: 'store-1',
      type: WarehouseType.STORE_OUTLET,
      isActive: true,
    });
  });

  it('should scope findById by organizationId', async () => {
    mockRepository.findById.mockResolvedValueOnce({ id: 'wh-1' });

    await service.findById('wh-1', 'org-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('wh-1', 'org-1');
  });

  it('should validate warehouse code within the organization scope', async () => {
    mockRepository.findByCode.mockResolvedValueOnce({ id: 'wh-existing' });

    await expect(
      service.create({
        code: 'WH-1',
        name: 'Warehouse 1',
        type: WarehouseType.CENTRAL_DC,
        organizationId: 'org-1',
        storeId: 'store-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockRepository.findByCode).toHaveBeenCalledWith('WH-1', 'org-1');
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('should create a warehouse with organizationId and storeId', async () => {
    const dto = {
      code: 'WH-1',
      name: 'Warehouse 1',
      type: WarehouseType.CENTRAL_DC,
      organizationId: 'org-1',
      storeId: 'store-1',
    };
    mockRepository.findByCode.mockResolvedValueOnce(null);
    mockRepository.create.mockResolvedValueOnce({ id: 'wh-1', ...dto });

    const result = await service.create(dto);

    expect(mockRepository.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'wh-1', ...dto });
  });

  it('should scope updates by organizationId and allow storeId changes', async () => {
    mockRepository.findById.mockResolvedValueOnce({ id: 'wh-1' });
    mockRepository.update.mockResolvedValueOnce({
      id: 'wh-1',
      storeId: 'store-2',
    });

    const result = await service.update(
      'wh-1',
      { storeId: 'store-2', name: 'Renamed' },
      'org-1',
    );

    expect(mockRepository.findById).toHaveBeenCalledWith('wh-1', 'org-1');
    expect(mockRepository.update).toHaveBeenCalledWith('wh-1', {
      storeId: 'store-2',
      name: 'Renamed',
    });
    expect(result).toEqual({ id: 'wh-1', storeId: 'store-2' });
  });
});
