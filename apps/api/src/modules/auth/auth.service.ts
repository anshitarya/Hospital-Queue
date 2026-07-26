import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, StaffStatus, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { pinsEqual } from '../../common/utils/pin';
import { isValidIndianMobile, normalizeIndianMobile } from '../../common/utils/phone';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsageEventService } from '../billing/usage-event.service';
import { GoogleAuthService } from './google-auth.service';
import { FEATURES } from '../../common/features';

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; name: string; phone?: string | null; email?: string | null; clinicId?: string | null };
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60; // 15 min

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly usageEvents: UsageEventService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  async staffLogin(identifier: string, password: string): Promise<AuthResult> {
    if (!FEATURES.ENABLE_DEV_AUTH_BYPASS) {
      throw new BadRequestException(
        'Password login is disabled in production. Please sign in with Google.',
      );
    }

    const lookupKey = identifier.trim();
    const isEmail = lookupKey.includes('@');
    const normalizedLookup = isEmail
      ? lookupKey.toLowerCase()
      : isValidIndianMobile(lookupKey)
        ? normalizeIndianMobile(lookupKey).e164
        : lookupKey;

    // Search by loginId, email, or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { loginId: { equals: lookupKey, mode: 'insensitive' } },
          { email: { equals: normalizedLookup, mode: 'insensitive' } },
          { phone: normalizedLookup },
        ],
      },
    });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (user.role === Role.PATIENT) throw new UnauthorizedException('Use customer login');
    if (user.status === StaffStatus.DISABLED) {
      throw new UnauthorizedException('This account has been disabled. Contact your administrator.');
    }

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const result = await this.sign(user);
    void this.triggerLoginEvents(user);
    return result;
  }

  /**
   * Google OAuth login for staff users (CLINIC_ADMIN, MANAGER, RECEPTIONIST, DOCTOR).
   *
   * Flow:
   * 1. Verify Google ID token server-side (never trust frontend).
   * 2. Look up staff by the verified email — if not found, deny access.
   * 3. Reject DISABLED accounts.
   * 4. If PENDING (first login): activate the account, link googleId.
   * 5. If ACTIVE: verify googleId matches (or link on first Google use).
   * 6. Update lastLoginAt and issue our own JWT.
   */
  async staffGoogleLogin(idToken: string): Promise<AuthResult> {
    if (!FEATURES.ENABLE_GOOGLE_AUTH) {
      throw new BadRequestException(
        'Google authentication is not enabled. Contact your administrator.',
      );
    }

    // Step 1: Verify the Google ID token
    const googlePayload = await this.googleAuth.verifyIdToken(idToken);
    const { sub: googleId, email, name } = googlePayload;

    // Step 2: Find staff by email
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.warn(`Google login attempt for unregistered email: ${email}`);
      throw new UnauthorizedException(
        'Your Google account is not registered on this platform. Please contact your administrator.',
      );
    }

    if (user.role === Role.PATIENT) {
      throw new UnauthorizedException('Patients cannot use Google Sign-In for staff portal.');
    }
    if (user.role === Role.ADMIN) {
      // Super admin uses password login; keep Google separate for security
      throw new UnauthorizedException('Super admin must use password login.');
    }

    // Step 3: Reject disabled accounts
    if (user.status === StaffStatus.DISABLED) {
      this.logger.warn(`Disabled account Google login attempt: ${email}`);
      throw new UnauthorizedException(
        'Your account has been disabled. Please contact your administrator.',
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { lastLoginAt: now };

    // Step 4 & 5: Handle PENDING activation or googleId verification
    if (user.status === StaffStatus.PENDING) {
      // First-ever login — activate the account
      updateData.status = StaffStatus.ACTIVE;
      updateData.activatedAt = now;
      updateData.googleId = googleId;
      updateData.authProvider = user.googleId ? 'multi' : 'google';
      updateData.emailVerified = true;
      this.logger.log(`Staff account activated via Google: ${email} (${user.role})`);
    } else {
      // Account is ACTIVE — verify or link googleId
      if (!user.googleId) {
        // First time using Google for an already-active account — link it
        updateData.googleId = googleId;
        updateData.authProvider = user.passwordHash ? 'multi' : 'google';
        updateData.emailVerified = true;
        this.logger.log(`Google account linked to existing staff: ${email}`);
      } else if (user.googleId !== googleId) {
        // googleId mismatch — someone else's Google account
        this.logger.warn(`Google sub mismatch for ${email}: expected ${user.googleId}, got ${googleId}`);
        throw new UnauthorizedException('Google account does not match the registered identity.');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Emit login event for analytics
    void this.triggerLoginEvents(user);

    return this.sign(user);
  }

  async registerReceptionist(dto: RegisterDto): Promise<AuthResult> {
    const code = await this.prisma.inviteCode.findUnique({
      where: { code: dto.inviteCode },
      include: { location: { select: { clinicId: true } } },
    });
    if (!code) throw new BadRequestException('Invalid invite code');
    if (code.usedById) throw new BadRequestException('Invite code already used');
    if (code.expiresAt < new Date()) throw new BadRequestException('Invite code has expired');

    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Phone number already registered');

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone: dto.phone,
          name: dto.name,
          role: Role.RECEPTIONIST,
          passwordHash,
          clinicId: code.location.clinicId,
        },
      });
      await tx.userLocation.create({
        data: {
          userId: created.id,
          locationId: code.locationId,
        },
      });
      await tx.inviteCode.update({
        where: { id: code.id },
        data: { usedById: created.id },
      });
      return created;
    });

    return this.sign(user);
  }

  /**
   * Robust phone lookup helper — matches exact raw phone, E.164 ("+919876543210"),
   * or local 10-digit ("9876543210") formats. Self-heals existing DB rows to
   * canonical E.164 so legacy user registrations continue working seamlessly.
   */
  private async findUserByPhone(phone: string): Promise<User | null> {
    const raw = phone.trim();
    if (!raw) return null;

    let user = await this.prisma.user.findFirst({ where: { phone: raw } });
    if (user) return user;

    if (isValidIndianMobile(raw)) {
      const { e164, local } = normalizeIndianMobile(raw);
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phone: e164 },
            { phone: local },
            { phone: `+91 ${local.slice(0, 5)} ${local.slice(5)}` },
            { phone: `+91-${local.slice(0, 5)}-${local.slice(5)}` },
          ],
        },
      });

      if (user && user.phone !== e164) {
        try {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { phone: e164 },
          });
          user.phone = e164;
        } catch {
          // ignore unique constraint collisions if duplicate exists
        }
      }
    }
    return user;
  }

  /**
   * Customer login with mobile number + permanent 4-digit Customer PIN.
   * Rate-limited: 5 failures → 15-min lockout per customer.
   */
  async loginCustomer(phone: string, pin: string): Promise<AuthResult> {
    const user = await this.findUserByPhone(phone);

    if (!user || user.role !== Role.PATIENT || !user.customerPin) {
      await new Promise((r) => setTimeout(r, 300));
      throw new UnauthorizedException('Invalid credentials');
    }

    const lockKey = `pin_lock:${user.id}`;
    const attempts = parseInt((await this.redis.client.get(lockKey)) ?? '0', 10);
    if (attempts >= PIN_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many failed attempts. Please try again in 15 minutes.',
      );
    }

    if (!pinsEqual(user.customerPin, pin)) {
      const next = attempts + 1;
      await this.redis.client.set(lockKey, String(next), 'EX', PIN_LOCKOUT_SECONDS);
      const remaining = PIN_MAX_ATTEMPTS - next;
      throw new UnauthorizedException(
        remaining > 0
          ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many failed attempts. Please try again in 15 minutes.',
      );
    }

    await this.redis.client.del(lockKey);
    return this.sign(user);
  }

  /* ─── Profile management (authenticated user) ───────────────────────────── */

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clinic: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      pendingEmail: user.pendingEmail,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      clinicId: user.clinicId,
      clinic: user.clinic,
      createdAt: user.createdAt,
      hasPassword: !!user.passwordHash,
      // Customers can view their permanent PIN from their profile.
      customerPin: user.role === Role.PATIENT ? user.customerPin : undefined,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
    return this.getProfile(userId);
  }

  /* ─── Email verification ────────────────────────────────────────────────── */

  async requestEmailVerification(userId: string, newEmail: string) {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }

    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException('User not found');

    if (me.email === email && me.emailVerified) {
      return { alreadyVerified: true };
    }

    const clash = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { pendingEmail: email }],
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('That email is already in use');

    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: email },
    });

    const { devCode } = await this.otp.issue('email', email);
    return { sent: true, devCode };
  }

  async verifyEmail(userId: string, code: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException('User not found');
    if (!me.pendingEmail) {
      throw new BadRequestException('No email change is pending. Request a new code first.');
    }

    await this.otp.verify('email', me.pendingEmail, code);

    await this.prisma.$transaction(async (tx) => {
      const stillFree = await tx.user.findFirst({
        where: { email: me.pendingEmail!, NOT: { id: userId } },
        select: { id: true },
      });
      if (stillFree) throw new ConflictException('That email was just claimed by another user');

      await tx.user.update({
        where: { id: userId },
        data: {
          email: me.pendingEmail!,
          pendingEmail: null,
          emailVerified: true,
        },
      });
    });

    return this.getProfile(userId);
  }

  async cancelPendingEmail(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: null },
    });
    return this.getProfile(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      throw new BadRequestException('This account uses PIN login and has no password to change');
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });
    return { ok: true };
  }

  async registerCustomer(dto: { phone: string; name: string }): Promise<AuthResult & { pin: string }> {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Please enter a valid Indian mobile number');
    }
    const phone = normalizeIndianMobile(dto.phone).e164;
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('This mobile number is already registered. Please log in instead.');
    }

    // Generate unique 4-digit PIN
    let pin = '';
    for (let r = 0; r < 50; r++) {
      const candidate = String(Math.floor(Math.random() * 9000) + 1000);
      const clash = await this.prisma.user.findFirst({
        where: { customerPin: candidate },
        select: { id: true },
      });
      if (!clash) {
        pin = candidate;
        break;
      }
    }
    if (!pin) {
      throw new ConflictException('Unable to assign a Customer PIN — please try again');
    }

    const user = await this.prisma.user.create({
      data: {
        role: Role.PATIENT,
        name: dto.name,
        phone,
        customerPin: pin,
        phoneVerified: true,
      },
    });

    void this.usageEvents.triggerEvent('CUSTOMER_REGISTERED', {
      businessId: 'PLATFORM',
      locationId: 'PLATFORM',
      customerId: user.id,
      referenceId: `${user.id}_REGISTERED`,
      metadata: { name: user.name, phone: user.phone },
    });

    const authResult = await this.sign(user);
    return {
      ...authResult,
      pin,
    };
  }

  async changePin(userId: string, currentPin: string, newPin: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.PATIENT || !user.customerPin) {
      throw new BadRequestException('This account does not use a PIN');
    }

    if (!pinsEqual(user.customerPin, currentPin)) {
      throw new UnauthorizedException('Current PIN is incorrect');
    }

    if (currentPin === newPin) {
      throw new BadRequestException('New PIN must be different from current PIN');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { customerPin: newPin },
    });

    return { ok: true };
  }

  async requestCustomerOtp(phone: string): Promise<{ sent: boolean; devCode?: string }> {
    if (!FEATURES.CUSTOMER_OTP_LOGIN) {
      throw new BadRequestException('OTP login is disabled');
    }

    const normalized = isValidIndianMobile(phone) ? normalizeIndianMobile(phone).e164 : phone.trim();
    const user = await this.findUserByPhone(phone);
    if (user && user.role !== Role.PATIENT) {
      throw new BadRequestException('This phone number is registered to a staff account');
    }

    const res = await this.otp.issue('phone', normalized);
    return { sent: true, devCode: res.devCode };
  }

  async verifyCustomerOtp(phone: string, code: string): Promise<AuthResult> {
    if (!FEATURES.CUSTOMER_OTP_LOGIN) {
      throw new BadRequestException('OTP login is disabled');
    }

    const normalized = isValidIndianMobile(phone) ? normalizeIndianMobile(phone).e164 : phone.trim();
    let user = await this.findUserByPhone(phone);
    if (user && user.role !== Role.PATIENT) {
      throw new BadRequestException('This phone number is registered to a staff account');
    }

    await this.otp.verify('phone', normalized, code);

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          role: Role.PATIENT,
          phone: normalized,
          name: 'Patient',
          phoneVerified: true,
          lastLoginAt: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return this.sign(user);
  }

  async setCustomerPin(userId: string, pin: string): Promise<{ ok: boolean }> {
    if (!FEATURES.CUSTOMER_OTP_LOGIN) {
      throw new BadRequestException('OTP login is disabled');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.PATIENT) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { customerPin: pin },
    });

    return { ok: true };
  }

  private async sign(user: User): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        email: user.email,
        clinicId: user.clinicId,
      },
    };
  }

  private async triggerLoginEvents(user: User) {
    try {
      if (user.role === Role.RECEPTIONIST) {
        if (user.clinicId) {
          const location = await this.prisma.location.findFirst({
            where: { clinicId: user.clinicId, status: 'ACTIVE' },
            select: { id: true },
          });
          const locationId = location?.id || 'SYSTEM';
          void this.usageEvents.triggerEvent('RECEPTIONIST_LOGIN', {
            businessId: user.clinicId,
            locationId,
            receptionistId: user.id,
            metadata: { name: user.name, email: user.email, phone: user.phone },
          });
        }
      } else if (user.role === Role.DOCTOR) {
        const doctor = await this.prisma.doctor.findUnique({
          where: { userId: user.id },
          include: { locations: { select: { locationId: true } } },
        });
        if (doctor && doctor.clinicId) {
          void this.usageEvents.triggerEvent('PROFESSIONAL_LOGIN', {
            businessId: doctor.clinicId,
            locationId: doctor.locations[0]?.locationId || 'SYSTEM',
            professionalId: doctor.id,
            metadata: { name: user.name, email: user.email, phone: user.phone },
          });
        }
      }
    } catch (e) {
      // safe logger fallback
    }
  }
}
