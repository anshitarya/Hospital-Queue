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
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isValidIndianMobile, normalizeIndianMobile } from '../../common/utils/phone';

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; name: string; phone?: string | null; email?: string | null; clinicId?: string | null };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
  ) {}

  async staffLogin(identifier: string, password: string): Promise<AuthResult> {
    // Identifier can be an email OR a mobile number. Normalize before lookup
    // so the user can type "9876543210" and still match the canonical
    // "+919876543210" stored in the DB.
    const isEmail = identifier.includes('@');
    const lookupKey = isEmail
      ? identifier.toLowerCase()
      : isValidIndianMobile(identifier)
        ? normalizeIndianMobile(identifier).e164
        : identifier;

    const user = isEmail
      ? await this.prisma.user.findUnique({ where: { email: lookupKey } })
      : await this.prisma.user.findUnique({ where: { phone: lookupKey } });

    // Generic message — never reveal whether the identifier or password was
    // the wrong half. This is intentional to prevent account enumeration.
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (user.role === Role.PATIENT) throw new UnauthorizedException('Use patient login');

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.sign(user);
  }

  async registerReceptionist(dto: RegisterDto): Promise<AuthResult> {
    const code = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } });
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
          clinicId: code.clinicId,
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

  async requestPatientOtp(phone: string) {
    return this.otp.issue('phone', phone);
  }

  async verifyPatientOtp(phone: string, code: string, name?: string): Promise<AuthResult> {
    await this.otp.verify('phone', phone, code);

    const user = await this.prisma.user.upsert({
      where: { phone },
      // Patient OTP verification implicitly verifies the phone every time.
      update: { phoneVerified: true, ...(name ? { name } : {}) },
      create: { phone, name: name ?? `Patient ${phone.slice(-4)}`, role: Role.PATIENT, phoneVerified: true },
    });

    return this.sign(user);
  }

  /* ─── Profile management (authenticated user) ───────────────────────────── */

  /**
   * Returns a self-profile payload safe to send to the client.
   * Used by GET /auth/profile.
   */
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
      // PATIENT accounts use OTP only and have no password — the change-password
      // form is hidden when this is false.
      hasPassword: !!user.passwordHash,
    };
  }

  /**
   * Update the *non-sensitive* profile fields. Currently only `name`.
   *
   * Email changes go through requestEmailVerification → verifyEmail (two-step,
   * OTP-confirmed). Phone is immutable post-signup — see UpdateProfileDto for
   * the reasoning.
   */
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

  /**
   * Step 1 of email change: validate, check uniqueness, store as `pendingEmail`,
   * and send an OTP to the new address.
   *
   * Behaviour notes:
   *   - We do NOT clear the existing verified email — the user keeps that
   *     until they confirm the new one.
   *   - Same-email-as-current short-circuits (no point sending an OTP) but is
   *     still considered success so the UI doesn't have to special-case it.
   *   - Uniqueness check covers BOTH the canonical email and other users'
   *     pendingEmail to prevent two accounts racing to claim one address.
   */
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

  /**
   * Step 2 of email change: verify the OTP, promote `pendingEmail` → `email`,
   * set `emailVerified=true`, and clear the pending slot.
   */
  async verifyEmail(userId: string, code: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException('User not found');
    if (!me.pendingEmail) {
      throw new BadRequestException('No email change is pending. Request a new code first.');
    }

    await this.otp.verify('email', me.pendingEmail, code);

    // Race protection: another user might have taken this address while we
    // were mid-verify. Check one more time inside the transaction.
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

  /**
   * Cancels any pending email change. Used by the UI when the user backs out
   * of the verification step.
   */
  async cancelPendingEmail(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: null },
    });
    return this.getProfile(userId);
  }

  /**
   * Verifies the current password and replaces the hash with a new one.
   * Patients without a password (OTP-only accounts) cannot use this endpoint —
   * they get a 400.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      throw new BadRequestException('This account uses OTP login and has no password to change');
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
}
