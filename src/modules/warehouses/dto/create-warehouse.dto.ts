import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-JKT-01' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Jakarta Central DC' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: WarehouseType, example: 'CENTRAL_DC' })
  @IsEnum(WarehouseType)
  type: WarehouseType;

  @ApiPropertyOptional({ example: 'Jl. Raya Industri No. 1, Jakarta' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ example: 'org-uuid-1' })
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiPropertyOptional({ example: 'store-uuid-1' })
  @IsString()
  @IsOptional()
  storeId?: string;
}
