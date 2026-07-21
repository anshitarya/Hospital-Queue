import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { StaffStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthUser } from '../../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('jwt.secret');
    if (!secret) throw new Error('JWT_SECRET env var is required — set it before starting the server');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req as any)?.cookies?.hq_session ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User no longer exists');

    // Reject immediately if the staff account has been disabled
    if (user.status === StaffStatus.DISABLED) {
      throw new UnauthorizedException('This account has been disabled. Contact your administrator.');
    }

    // Reject tokens issued BEFORE the last password change / reset
    if (user.passwordChangedAt && payload.iat) {
      const tokenIssuedAtMs = payload.iat * 1000;
      const pwdChangedAtMs = user.passwordChangedAt.getTime();
      if (tokenIssuedAtMs < pwdChangedAtMs - 2000) {
        throw new UnauthorizedException('Password was changed. Please log in again.');
      }
    }

    return { id: user.id, role: user.role, name: user.name, clinicId: user.clinicId };
  }
}

