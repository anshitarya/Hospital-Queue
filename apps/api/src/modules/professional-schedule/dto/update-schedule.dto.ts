import { IsInt, IsString, IsBoolean, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ShiftDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsInt() dayOfWeek: number;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsBoolean() isHoliday: boolean;

  @IsOptional()
  @IsInt()
  maxCapacity?: number | null;

  @IsOptional()
  @IsString()
  createdAt?: string | Date;

  @IsOptional()
  @IsString()
  updatedAt?: string | Date;
}

export class SetScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftDto)
  shifts: ShiftDto[];
}
