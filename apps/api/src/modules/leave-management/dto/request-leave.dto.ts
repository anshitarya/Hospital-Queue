import { IsString, IsDateString, IsOptional } from 'class-validator';

export class RequestLeaveDto {
  @IsString() type: string; 
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() reason?: string;
}
