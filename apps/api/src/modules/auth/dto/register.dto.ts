import { IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile } from '../../../common/utils/phone';

export class RegisterDto {
  @IsString()
  @MinLength(6, { message: 'Invite code is required' })
  inviteCode!: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeIndianMobile(value).e164 : value))
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone!: string;

  // Stronger production policy: 8+ chars, must contain at least one letter
  // and one digit. Special chars are encouraged but not required.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'Password must contain at least one letter' })
  @Matches(/\d/, { message: 'Password must contain at least one digit' })
  password!: string;
}
