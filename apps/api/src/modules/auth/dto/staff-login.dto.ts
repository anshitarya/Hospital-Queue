import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Staff login accepts either an email or a phone in the same field.
 * We don't strict-validate the identifier here — that's a UX choice (one
 * box, "enter email or phone"). The auth service detects which is which
 * by presence of "@" and runs the strict lookup downstream.
 *
 * Trimming + lowercasing avoids most "I logged in differently than I
 * signed up" reports.
 */
export class StaffLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3, { message: 'Enter your email or phone number' })
  identifier!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
