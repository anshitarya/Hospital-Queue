import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

enum BusinessType {
  CLINIC = 'CLINIC',
  SALON = 'SALON',
  BANK = 'BANK',
  GOVT = 'GOVT',
  GENERAL = 'GENERAL',
}

export class CreateClinicDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;
}
