import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { WarehouseQueryDto } from './dto/warehouse-query.dto.js';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('v1/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @ApiOperation({
    summary: 'List warehouses, optionally scoped by organization or store',
  })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  @ApiQuery({ name: 'storeId', required: false, type: String })
  async findAll(@Query() query: WarehouseQueryDto) {
    return this.warehousesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a warehouse for an organization' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a warehouse by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  async findOne(
    @Param('id') id: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.warehousesService.findById(id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.warehousesService.update(id, dto, organizationId);
  }
}
