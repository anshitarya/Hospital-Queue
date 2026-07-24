import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Auth service is heavy on side effects (DB + JWT + argon2). We mock prisma
 * and JWT — argon2 stays real because that's part of the contract we want to
 * test (real hash verification).
 */
function makeService() {
  const findUnique = jest.fn();
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    user: { findUnique, findFirst: findUnique, update },
  } as unknown as PrismaService;

  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
  } as unknown as JwtService;

  const otp = { issue: jest.fn(), verify: jest.fn() } as unknown as OtpService;
  const config = { get: jest.fn() } as unknown as ConfigService;
  const googleAuth = { verifyIdToken: jest.fn() };

  return {
    svc: new AuthService(
      prisma,
      jwt,
      otp,
      config,
      { client: { get: async () => null, set: async () => {}, del: async () => {} } } as any,
      { triggerEvent: jest.fn() } as any,
      googleAuth as any,
    ),
    findUnique,
    update,
  };
}

describe('AuthService.staffLogin', () => {
  it('looks up by email when identifier contains "@"', async () => {
    const { svc, findUnique } = makeService();
    const passwordHash = await argon2.hash('hunter2');
    findUnique.mockResolvedValueOnce({
      id: 'u-1',
      role: Role.DOCTOR,
      name: 'Dr A',
      email: 'a@clinic.com',
      phone: null,
      clinicId: 'c-1',
      passwordHash,
      status: 'ACTIVE',
    });

    const out = await svc.staffLogin('a@clinic.com', 'hunter2');
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        OR: [
          { loginId: { equals: 'a@clinic.com', mode: 'insensitive' } },
          { email: { equals: 'a@clinic.com', mode: 'insensitive' } },
          { phone: 'a@clinic.com' },
        ],
      },
    });
    expect(out.token).toBe('signed-token');
    expect(out.user.role).toBe(Role.DOCTOR);
  });

  it('normalizes a 10-digit identifier to +91… and looks up by phone', async () => {
    const { svc, findUnique } = makeService();
    const passwordHash = await argon2.hash('hunter2');
    findUnique.mockResolvedValueOnce({
      id: 'u-2',
      role: Role.RECEPTIONIST,
      name: 'Rec',
      email: null,
      phone: '+919876543210',
      clinicId: 'c-1',
      passwordHash,
      status: 'ACTIVE',
    });

    await svc.staffLogin('9876543210', 'hunter2');
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        OR: [
          { loginId: { equals: '9876543210', mode: 'insensitive' } },
          { email: { equals: '+919876543210', mode: 'insensitive' } },
          { phone: '+919876543210' },
        ],
      },
    });
  });

  it('falls through with the raw string for non-Indian-mobile non-email identifiers', async () => {
    const { svc, findUnique } = makeService();
    findUnique.mockResolvedValueOnce(null);

    // Garbage identifier — should still call findUnique with the raw value
    // (server returns generic Invalid credentials).
    await expect(svc.staffLogin('garbage', 'whatever')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        OR: [
          { loginId: { equals: 'garbage', mode: 'insensitive' } },
          { email: { equals: 'garbage', mode: 'insensitive' } },
          { phone: 'garbage' },
        ],
      },
    });
  });

  it('returns generic "Invalid credentials" if user not found', async () => {
    const { svc, findUnique } = makeService();
    findUnique.mockResolvedValueOnce(null);

    await expect(svc.staffLogin('absent@x.com', 'pw')).rejects.toThrow('Invalid credentials');
  });

  it('returns generic "Invalid credentials" if user has no password hash', async () => {
    const { svc, findUnique } = makeService();
    findUnique.mockResolvedValueOnce({
      id: 'u', role: Role.DOCTOR, passwordHash: null,
    });
    await expect(svc.staffLogin('a@b.com', 'pw')).rejects.toThrow('Invalid credentials');
  });

  it('blocks PATIENT role from staff login', async () => {
    const { svc, findUnique } = makeService();
    const passwordHash = await argon2.hash('hunter2');
    findUnique.mockResolvedValueOnce({
      id: 'u',
      role: Role.PATIENT,
      passwordHash,
    });
    await expect(svc.staffLogin('p@x.com', 'hunter2')).rejects.toThrow(/customer login/i);
  });

  it('rejects wrong password (real argon2 verify)', async () => {
    const { svc, findUnique } = makeService();
    const passwordHash = await argon2.hash('correct');
    findUnique.mockResolvedValueOnce({
      id: 'u', role: Role.DOCTOR, passwordHash, name: 'X', status: 'ACTIVE',
    });

    await expect(svc.staffLogin('a@b.com', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.loginCustomer', () => {
  function makeRedis() {
    const store = new Map<string, string>();
    return {
      client: {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: string) => { store.set(k, v); },
        del: async (k: string) => { store.delete(k); },
      },
    };
  }

  function makeCustomerService() {
    const findUnique = jest.fn();
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { findUnique, update } } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('customer-token') } as unknown as JwtService;
    const otp = { issue: jest.fn(), verify: jest.fn() } as unknown as OtpService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const redis = makeRedis();
    const googleAuth = { verifyIdToken: jest.fn() };
    const svc = new AuthService(prisma, jwt, otp, config, redis as any, { triggerEvent: jest.fn() } as any, googleAuth as any);
    return { svc, findUnique, redis };
  }

  it('issues a JWT when phone and PIN match', async () => {
    const { svc, findUnique } = makeCustomerService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      name: 'Alice',
      phone: '+919876543210',
      customerPin: '4315',
    });

    const out = await svc.loginCustomer('+919876543210', '4315');
    expect(out.token).toBe('customer-token');
    expect(out.user.name).toBe('Alice');
  });

  it('rejects incorrect PIN with remaining attempts', async () => {
    const { svc, findUnique } = makeCustomerService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      customerPin: '4315',
    });

    await expect(svc.loginCustomer('+919876543210', '9999')).rejects.toThrow(
      /Incorrect PIN.*4 attempts remaining/,
    );
  });

  it('returns generic error when customer not found', async () => {
    const { svc, findUnique } = makeCustomerService();
    findUnique.mockResolvedValueOnce(null);

    await expect(svc.loginCustomer('+919876543210', '4315')).rejects.toThrow('Invalid credentials');
  });
});

describe('AuthService.customerOtpLoginFlow', () => {
  function makeCustomerOtpService() {
    const findUnique = jest.fn();
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { findUnique, update } } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('customer-token') } as unknown as JwtService;
    const otp = {
      issue: jest.fn().mockResolvedValue({ devCode: '123456' }),
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as OtpService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const googleAuth = { verifyIdToken: jest.fn() };
    const svc = new AuthService(
      prisma,
      jwt,
      otp,
      config,
      null as any,
      { triggerEvent: jest.fn() } as any,
      googleAuth as any,
    );
    return { svc, findUnique, update, otp };
  }

  it('requests customer OTP if user exists and is a patient', async () => {
    const { svc, findUnique, otp } = makeCustomerOtpService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      phone: '+919876543210',
    });

    const res = await svc.requestCustomerOtp('+919876543210');
    expect(res.sent).toBe(true);
    expect(otp.issue).toHaveBeenCalledWith('phone', '+919876543210');
  });

  it('verifies OTP and logs in the customer', async () => {
    const { svc, findUnique, otp } = makeCustomerOtpService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      phone: '+919876543210',
    });

    const res = await svc.verifyCustomerOtp('+919876543210', '123456');
    expect(res.token).toBe('customer-token');
    expect(otp.verify).toHaveBeenCalledWith('phone', '+919876543210', '123456');
  });

  it('sets customer PIN', async () => {
    const { svc, findUnique, update } = makeCustomerOtpService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
    });

    const res = await svc.setCustomerPin('c-1', '5678');
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { customerPin: '5678' },
    });
  });
});
