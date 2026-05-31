import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile } from '../../../common/utils/phone';

/**
 * OTP DTOs use strict Indian-mobile validation and auto-normalize the input
 * to canonical E.164 ("+919876543210") before reaching the service. This
 * guarantees we never persist messy formats and that lookups by phone hit
 * a single canonical row.
 */

const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeIndianMobile(value).e164 : value;

export class OtpRequestDto {
  @Transform(normalizePhone)
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class OtpVerifyDto {
  @Transform(normalizePhone)
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  code!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
