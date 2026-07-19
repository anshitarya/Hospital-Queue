import { IsString, IsDateString, IsOptional } from 'class-validator';

export class RequestLeaveDto {
  /** Reception/admin may request leave on behalf of another staff member. */
  @IsOptional() @IsString() userId?: string;
  @IsString() type: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() reason?: string;
}
