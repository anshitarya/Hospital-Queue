import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DoctorStatus } from '@prisma/client';

export class UpdateDoctorDto {
  @IsOptional()
  @IsEnum(DoctorStatus)
  status?: DoctorStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  avgConsultMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  delayMinutes?: number;

  @IsOptional()
  prescriptionEnabled?: boolean;

  @IsOptional()
  prescriptionAllowed?: boolean;
}
