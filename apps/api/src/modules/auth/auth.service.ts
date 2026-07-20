import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
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

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; name: string; phone?: string | null; email?: string | null; clinicId?: string | null };
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60; // 15 min

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly usageEvents: UsageEventService,
  ) {}

  async staffLogin(identifier: string, password: string): Promise<AuthResult> {
    const isEmail = identifier.includes('@');
    const lookupKey = isEmail
      ? identifier.toLowerCase()
      : isValidIndianMobile(identifier)
        ? normalizeIndianMobile(identifier).e164
        : identifier;

    const user = isEmail
      ? await this.prisma.user.findUnique({ where: { email: lookupKey } })
      : await this.prisma.user.findUnique({ where: { phone: lookupKey } });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (user.role === Role.PATIENT) throw new UnauthorizedException('Use customer login');

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const result = await this.sign(user);
    void this.triggerLoginEvents(user);
    return result;
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
   * Customer login with mobile number + permanent 4-digit Customer PIN.
   * Rate-limited: 5 failures → 15-min lockout per customer.
   */
  async loginCustomer(phone: string, pin: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { phone } });

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
      data: { passwordHash: newHash },
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
