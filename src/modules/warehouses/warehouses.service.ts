import { BadRequestException, Injectable } from '@nestjs/common';
import {
  WarehousesRepository,
  WarehouseFilters,
} from './warehouses.repository.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';

@Injectable()
export class WarehousesService {
  constructor(private warehousesRepository: WarehousesRepository) {}

  async findAll(filters: WarehouseFilters = {}) {
    return this.warehousesRepository.findAll(filters);
  }

  async findById(id: string, organizationId?: string) {
    return this.warehousesRepository.findById(id, organizationId);
  }

  async create(dto: CreateWarehouseDto) {
    const existing = await this.warehousesRepository.findByCode(
      dto.code,
      dto.organizationId,
    );
    if (existing) {
      throw new BadRequestException(
        `Warehouse with code ${dto.code} already exists in organization ${dto.organizationId}`,
      );
    }
    return this.warehousesRepository.create(dto);
  }

  async update(id: string, dto: UpdateWarehouseDto, organizationId?: string) {
    await this.warehousesRepository.findById(id, organizationId);
    return this.warehousesRepository.update(id, dto);
  }
}
