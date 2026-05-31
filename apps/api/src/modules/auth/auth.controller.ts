import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuthService } from './auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Inline DTOs for the email verification flow. Kept inline because they're
 * only used here — the schemas are small and the endpoints are tightly
 * coupled to this controller.
 */
class RequestEmailVerifyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;
}

class VerifyEmailDto {
  @IsString()
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Verification code must be 6 digits' })
  code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /* ─── Public auth endpoints ────────────────────────────────────────────── */

  /**
   * Staff login is throttled hard — slow brute-force is the main attack
   * vector here. 10/min/IP from the global throttler is too loose for a
   * login endpoint.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('staff/login')
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.auth.staffLogin(dto.identifier, dto.password);
  }

  /** Registration is rate-limited to discourage invite-code enumeration. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.registerReceptionist(dto);
  }

  /**
   * Per-IP OTP request throttle. There's a separate per-phone limit
   * enforced inside OtpService (5 per 10 min) — these stack.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestPatientOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyPatientOtp(dto.phone, dto.code, dto.name);
  }

  /* ─── Authenticated routes ─────────────────────────────────────────────── */

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  /* ─── Email verification (two-step) ────────────────────────────────────── */

  @Post('email/request-verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestEmailVerify(@CurrentUser() user: AuthUser, @Body() dto: RequestEmailVerifyDto) {
    return this.auth.requestEmailVerification(user.id, dto.email);
  }

  @Post('email/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(user.id, dto.code);
  }

  @Post('email/cancel-pending')
  cancelPendingEmail(@CurrentUser() user: AuthUser) {
    return this.auth.cancelPendingEmail(user.id);
  }
}
