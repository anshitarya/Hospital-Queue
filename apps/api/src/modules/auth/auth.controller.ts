import { Body, Controller, Get, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
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

  private setSessionCookie(res: Response, token: string) {
    res.cookie('hq_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  /* ─── Public auth endpoints ────────────────────────────────────────────── */

  /**
   * Staff login is throttled hard — slow brute-force is the main attack
   * vector here. 10/min/IP from the global throttler is too loose for a
   * login endpoint.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('staff/login')
  async staffLogin(
    @Body() dto: StaffLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.staffLogin(dto.identifier, dto.password);
    this.setSessionCookie(res, result.token);
    return result;
  }

  /** Registration is rate-limited to discourage invite-code enumeration. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerReceptionist(dto);
    this.setSessionCookie(res, result.token);
    return result;
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
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyPatientOtp(dto.phone, dto.code, dto.name);
    this.setSessionCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('hq_session', { path: '/' });
    return { ok: true };
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
