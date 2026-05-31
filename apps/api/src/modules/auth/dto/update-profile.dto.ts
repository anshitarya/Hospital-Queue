import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Profile edit DTO — intentionally minimal:
 *
 *   - `name`  → freely editable
 *   - `email` → NOT settable directly here. Use the email verification flow:
 *               POST /auth/email/request-verify  (sends OTP to the new addr)
 *               POST /auth/email/verify          (applies + marks verified)
 *   - `phone` → IMMUTABLE post-signup. The phone is the account identifier;
 *               changing it would let users transfer accounts and break OTP
 *               trust. Users who genuinely need a change must contact support.
 *
 * This DTO accepts only `name` to make the policy enforceable at the type
 * level. Adding new editable fields here is a deliberate decision.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name?: string;
}
