import { IsInt, IsString, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ShiftDto {
  @IsInt() dayOfWeek: number;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsBoolean() isHoliday: boolean;
}

export class SetScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftDto)
  shifts: ShiftDto[];
}
