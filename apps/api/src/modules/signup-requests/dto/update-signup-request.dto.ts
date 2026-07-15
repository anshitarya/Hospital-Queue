import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SignupRequestStatus } from '@prisma/client';

export class UpdateSignupRequestDto {
  @IsOptional()
  @IsEnum(SignupRequestStatus)
  status?: SignupRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
