import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { StaffLoginDto } from './staff-login.dto';
import { OtpRequestDto, OtpVerifyDto } from './otp.dto';
import { ChangePasswordDto } from './change-password.dto';

/**
 * Helper that runs the full pipeline: plainToInstance → validate.
 * Returns the (possibly transformed) instance + the list of constraint errors.
 *
 * NOTE: `@Transform` in `register.dto.ts` and `otp.dto.ts` calls
 * `normalizeIndianMobile` which THROWS on bad input — that throw bubbles up
 * through plainToInstance. Tests for bad phones therefore use try/catch.
 */
async function runValidate<T extends object>(cls: new () => T, payload: unknown) {
  let instance: T | undefined;
  let transformError: Error | undefined;
  try {
    instance = plainToInstance(cls, payload) as T;
  } catch (e) {
    transformError = e as Error;
  }
  const errors = instance ? await validate(instance) : [];
  return { instance, errors, transformError };
}

describe('RegisterDto', () => {
  it('accepts a fully valid payload and normalizes phone to +91…', async () => {
    const { instance, errors, transformError } = await runValidate(RegisterDto, {
      inviteCode: 'ABCD-EFGH',
      name: 'Alice',
      phone: '9876543210',
      password: 'goodpass1',
    });
    expect(transformError).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(instance!.phone).toBe('+919876543210');
  });

  it('accepts already-canonical phone unchanged', async () => {
    const { instance } = await runValidate(RegisterDto, {
      inviteCode: 'ABCD-EFGH',
      name: 'Alice',
      phone: '+919876543210',
      password: 'goodpass1',
    });
    expect(instance!.phone).toBe('+919876543210');
  });

  it('rejects invalid phone via the @Transform throw', async () => {
    const { transformError } = await runValidate(RegisterDto, {
      inviteCode: 'ABCD-EFGH',
      name: 'Alice',
      phone: '12345',
      password: 'goodpass1',
    });
    expect(transformError).toBeDefined();
  });

  it('rejects short invite codes (<6)', async () => {
    const { errors } = await runValidate(RegisterDto, {
      inviteCode: 'ABC',
      name: 'Alice',
      phone: '9876543210',
      password: 'goodpass1',
    });
    expect(errors.some((e) => e.property === 'inviteCode')).toBe(true);
  });

  it('rejects names shorter than 2 chars', async () => {
    const { errors } = await runValidate(RegisterDto, {
      inviteCode: 'ABCD-EFGH',
      name: 'A',
      phone: '9876543210',
      password: 'goodpass1',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it.each([
    ['short', 'too short'],
    ['allletters', 'no digit'],
    ['12345678', 'no letter'],
  ])('rejects weak password (%j — %s)', async (password) => {
    const { errors } = await runValidate(RegisterDto, {
      inviteCode: 'ABCD-EFGH',
      name: 'Alice',
      phone: '9876543210',
      password,
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});

describe('StaffLoginDto', () => {
  it('trims and lowercases the identifier', async () => {
    const { instance, errors } = await runValidate(StaffLoginDto, {
      identifier: '  Doctor@Clinic.COM  ',
      password: 'whatever',
    });
    expect(errors).toHaveLength(0);
    expect(instance!.identifier).toBe('doctor@clinic.com');
  });

  it('rejects identifier <3 chars', async () => {
    const { errors } = await runValidate(StaffLoginDto, {
      identifier: 'ab',
      password: 'whatever',
    });
    expect(errors.some((e) => e.property === 'identifier')).toBe(true);
  });

  it('rejects empty password', async () => {
    const { errors } = await runValidate(StaffLoginDto, {
      identifier: 'doctor@clinic.com',
      password: '',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});

describe('OtpRequestDto', () => {
  it('normalizes the phone and accepts optional name', async () => {
    const { instance, errors } = await runValidate(OtpRequestDto, {
      phone: '9876543210',
      name: 'Bob',
    });
    expect(errors).toHaveLength(0);
    expect(instance!.phone).toBe('+919876543210');
    expect(instance!.name).toBe('Bob');
  });

  it('rejects bad phone via transform', async () => {
    const { transformError } = await runValidate(OtpRequestDto, { phone: 'xx' });
    expect(transformError).toBeDefined();
  });
});

describe('OtpVerifyDto', () => {
  it('accepts a valid 4-digit code', async () => {
    const { errors } = await runValidate(OtpVerifyDto, {
      phone: '9876543210',
      code: '1234',
    });
    expect(errors).toHaveLength(0);
  });

  it.each(['123', '12345', 'abcd', '12 3', ''])(
    'rejects code %j',
    async (code) => {
      const { errors } = await runValidate(OtpVerifyDto, {
        phone: '9876543210',
        code,
      });
      expect(errors.some((e) => e.property === 'code')).toBe(true);
    },
  );
});

describe('ChangePasswordDto', () => {
  it('accepts strong new password', async () => {
    const { errors } = await runValidate(ChangePasswordDto, {
      currentPassword: 'anything',
      newPassword: 'newpass123',
    });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['short1', 'min length'],
    ['12345678', 'no letter'],
    ['allletters', 'no digit'],
  ])('rejects weak new password %j (%s)', async (newPassword) => {
    const { errors } = await runValidate(ChangePasswordDto, {
      currentPassword: 'whatever',
      newPassword,
    });
    expect(errors.some((e) => e.property === 'newPassword')).toBe(true);
  });

  it('rejects empty current password', async () => {
    const { errors } = await runValidate(ChangePasswordDto, {
      currentPassword: '',
      newPassword: 'goodpass1',
    });
    expect(errors.some((e) => e.property === 'currentPassword')).toBe(true);
  });
});
