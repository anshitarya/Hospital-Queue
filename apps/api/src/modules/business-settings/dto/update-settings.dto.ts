import { IsString, IsArray, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() queueMode?: string;
  @IsOptional() @IsString() appointmentMode?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) workingDays?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) businessHolidays?: string[];
  @IsOptional() @IsString() queueStarts?: string;
  @IsOptional() @IsString() queueEnds?: string;
  @IsOptional() @IsString() walkinJoinRule?: string;
  @IsOptional() @IsInt() @Min(0) walkinJoinRuleParam?: number;
  @IsOptional() @IsString() followupJoinRule?: string;
  @IsOptional() @IsInt() @Min(0) followupJoinRuleParam?: number;
  @IsOptional() @IsString() emergencyJoinRule?: string;
  @IsOptional() @IsString() vipJoinRule?: string;
  @IsOptional() @IsBoolean() allowWalkins?: boolean;
  @IsOptional() @IsBoolean() allowOnlineBooking?: boolean;
  @IsOptional() @IsBoolean() allowFollowups?: boolean;
  @IsOptional() @IsInt() @Min(0) maxDailyBookings?: number;
  @IsOptional() @IsBoolean() emergencyQueueEnabled?: boolean;
  @IsOptional() @IsBoolean() vipQueueEnabled?: boolean;
  @IsOptional() @IsString() tokenPrefix?: string;
  @IsOptional() @IsString() queueNumberFormat?: string;
  @IsOptional() @IsString() etaCalculationMethod?: string;
  @IsOptional() @IsInt() @Min(0) bufferTime?: number;
  @IsOptional() @IsInt() @Min(0) gracePeriod?: number;
  @IsOptional() @IsInt() @Min(0) noShowTimeout?: number;
  @IsOptional() @IsBoolean() autoQueueAssignment?: boolean;
  @IsOptional() @IsString() bookingControl?: string;
  @IsOptional() @IsInt() @Min(1) appointmentInterval?: number;
  @IsOptional() @IsInt() @Min(1) maxCustomersPerSlot?: number;
}
