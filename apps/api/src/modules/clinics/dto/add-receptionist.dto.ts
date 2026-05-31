import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile } from '../../../common/utils/phone';

/**
 * AddReceptionistDto — admin-only payload for `POST /clinics/:id/receptionists`.
 *
 * This is the "direct creation" alternative to the invite-code flow:
 *   - Invite code → receptionist picks their own password via /register.
 *   - Direct add  → admin gets a temp password shown once and shares it.
 *
 * Same email/phone normalization rules as AddDoctorDto. At-least-one identifier
 * is enforced in the service layer so the error message can be human-readable.
 */
export class AddReceptionistDto {
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
}
