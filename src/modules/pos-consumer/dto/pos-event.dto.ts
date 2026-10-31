import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PosOrderItemDto {
  @ApiProperty({ example: 'prod-uuid-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'SKU-TEST-1' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional({ example: 'BATCH-001' })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z' })
  @IsOptional()
  expiryDate?: string | Date;
}

export class PosOrderRefundedItemDto {
  @ApiProperty({ example: 'prod-uuid-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'SKU-TEST-1' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  quantity!: number;

  @ApiProperty({ example: 'SELLABLE', enum: ['SELLABLE', 'DAMAGED'] })
  @IsEnum(['SELLABLE', 'DAMAGED'])
  condition!: 'SELLABLE' | 'DAMAGED';

  @ApiPropertyOptional({ example: 'BATCH-001' })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z' })
  @IsOptional()
  expiryDate?: string | Date;

  @ApiPropertyOptional({ example: 'bin-uuid-1' })
  @IsString()
  @IsOptional()
  binId?: string;
}

export class PosEventDto {
  @ApiProperty({ example: 'evt-uuid-1234' })
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @ApiPropertyOptional({ example: 'pos-service' })
  @IsString()
  @IsOptional()
  sourceService?: string;

  @ApiProperty({
    example: 'ORDER_COMPLETED',
    enum: ['ORDER_COMPLETED', 'ORDER_REFUNDED'],
  })
  @IsEnum(['ORDER_COMPLETED', 'ORDER_REFUNDED'])
  eventType!: 'ORDER_COMPLETED' | 'ORDER_REFUNDED';

  @ApiPropertyOptional({ example: 'wh-uuid-1' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'org-uuid-1' })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ example: 'store-uuid-1' })
  @IsString()
  @IsOptional()
  storeId?: string;

  @ApiProperty({ type: [PosOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosOrderItemDto)
  items!: (PosOrderItemDto | PosOrderRefundedItemDto)[];
}
