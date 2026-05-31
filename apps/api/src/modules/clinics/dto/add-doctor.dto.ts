import { IsEmail, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile } from '../../../common/utils/phone';

/**
 * AddDoctorDto — used by both reception (`POST /clinics/my/doctors`) and
 * admin (`POST /clinics/:id/doctors`). The doctor will log in with email or
 * phone + the temporary password returned in the response, so AT LEAST ONE
 * of email/phone is required. The controller checks that combination
 * (class-validator can't easily express "either-or" without a custom
 * validator).
 *
 * Phone is normalized to canonical "+91XXXXXXXXXX" at the DTO boundary, the
 * same way OtpRequestDto and RegisterDto do it.
 */
export class AddDoctorDto {
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value ? normalizeIndianMobile(value).e164 : value,
  )
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone?: string;

  @IsString()
  departmentId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  avgConsultMinutes?: number;
}
