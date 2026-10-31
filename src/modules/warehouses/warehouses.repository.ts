import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WarehouseType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface WarehouseFilters {
  organizationId?: string;
  storeId?: string;
  type?: WarehouseType;
  isActive?: boolean;
}

@Injectable()
export class WarehousesRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: WarehouseFilters = {}) {
    return this.prisma.warehouse.findMany({
      where: {
        organizationId: filters.organizationId,
        storeId: filters.storeId,
        type: filters.type,
        isActive: filters.isActive,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string, organizationId?: string) {
    const warehouse = await this.findByIdOrNull(id, organizationId);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with id ${id} not found`);
    }
    return warehouse;
  }

  async findByIdOrNull(id: string, organizationId?: string) {
    return this.prisma.warehouse.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  async findByCode(code: string, organizationId?: string) {
    return this.prisma.warehouse.findFirst({
      where: {
        code,
        organizationId,
      },
    });
  }

  async findByStoreId(
    storeId: string,
    organizationId?: string,
    isActive?: boolean,
  ) {
    return this.prisma.warehouse.findFirst({
      where: {
        storeId,
        organizationId,
        isActive,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: Prisma.WarehouseUncheckedCreateInput) {
    return this.prisma.warehouse.create({ data });
  }

  async update(id: string, data: Prisma.WarehouseUncheckedUpdateInput) {
    return this.prisma.warehouse.update({ where: { id }, data });
  }
}
