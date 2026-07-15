import { IsEnum, IsOptional, IsString } from 'class-validator';

enum BusinessType {
  CLINIC = 'CLINIC',
  SALON = 'SALON',
  BANK = 'BANK',
  GOVT = 'GOVT',
  GENERAL = 'GENERAL',
}

export class ApproveSignupRequestDto {
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsOptional()
  @IsString()
  address?: string;
}
