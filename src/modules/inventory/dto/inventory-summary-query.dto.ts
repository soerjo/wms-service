import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InventorySummaryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse id' })
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({
    description: 'Expire-soon window in days (FEFO TTL)',
    default: 90,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  expireSoonDays?: number = 90;

  @ApiPropertyOptional({
    description: 'Low-stock threshold (QOH <= threshold)',
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number = 10;
}
