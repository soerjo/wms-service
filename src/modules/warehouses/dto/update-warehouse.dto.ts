import { ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Jakarta Central DC' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: WarehouseType, example: 'CENTRAL_DC' })
  @IsEnum(WarehouseType)
  @IsOptional()
  type?: WarehouseType;

  @ApiPropertyOptional({ example: 'Jl. Raya Industri No. 1, Jakarta' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'store-uuid-1' })
  @IsString()
  @IsOptional()
  storeId?: string;
}
