import { Body, Controller, Get, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuthService } from './auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { ChangePinDto, CustomerSetPinDto } from './dto/change-pin.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { FEATURES } from '../../common/features';

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

class StaffGoogleLoginDto {
  @IsString({ message: 'idToken must be a string' })
  idToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setSessionCookie(res: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('hq_session', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  /* ─── Public auth endpoints ────────────────────────────────────────────── */

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

  /**
   * Google OAuth login for staff.
   * Accepts a Google ID token from the frontend (obtained via Google Sign-In),
   * verifies it server-side, and issues our own JWT session cookie.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('staff/google')
  async staffGoogleLogin(
    @Body() dto: StaffGoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.staffGoogleLogin(dto.idToken);
    this.setSessionCookie(res, result.token);
    return result;
  }

  /**
   * Returns which auth modes are currently active.
   * The frontend calls this on mount to conditionally render the Google button
   * or the email/password form.
   */
  @Public()
  @Get('staff/status')
  authStatus() {
    return {
      googleAuthEnabled: FEATURES.ENABLE_GOOGLE_AUTH,
      devAuthEnabled: FEATURES.ENABLE_DEV_AUTH_BYPASS,
      authMode: FEATURES.AUTH_MODE,
      customerOtpLoginEnabled: FEATURES.CUSTOMER_OTP_LOGIN,
    };
  }

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

  /** Customer login with mobile number + permanent 4-digit Customer PIN. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('customer/login')
  async customerLogin(
    @Body() dto: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginCustomer(dto.phone, dto.pin);
    this.setSessionCookie(res, result.token);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('customer/register')
  async customerRegister(
    @Body() dto: CustomerRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerCustomer(dto);
    this.setSessionCookie(res, result.token);
    return result;
  }

  /** @deprecated Use POST /auth/customer/login — kept for backward compatibility. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('patient/pin/login')
  async legacyPinLogin(
    @Body() dto: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginCustomer(dto.phone, dto.pin);
    this.setSessionCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('hq_session', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
    });
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

  @Post('customer/change-pin')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePin(@CurrentUser() user: AuthUser, @Body() dto: ChangePinDto) {
    return this.auth.changePin(user.id, dto.currentPin, dto.newPin);
  }

  @Public()
  @Post('customer/otp/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestCustomerOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestCustomerOtp(dto.phone);
  }

  @Public()
  @Post('customer/otp/login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async customerOtpLogin(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyCustomerOtp(dto.phone, dto.code);
    this.setSessionCookie(res, result.token);
    return result;
  }

  @Post('customer/set-pin')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async setCustomerPin(@CurrentUser() user: AuthUser, @Body() dto: CustomerSetPinDto) {
    return this.auth.setCustomerPin(user.id, dto.pin);
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
