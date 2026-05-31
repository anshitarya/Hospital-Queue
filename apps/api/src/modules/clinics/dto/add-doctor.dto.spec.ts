import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddDoctorDto } from './add-doctor.dto';

/**
 * DTO-level tests — verify the validation pipeline before the request even
 * reaches the controller. Specifically:
 *   - phone is normalized to canonical +91... form
 *   - email is lowercased + trimmed
 *   - bad phone throws via the @Transform (this is intentional — it gives
 *     the user a clearer error than a regex mismatch)
 *   - email is validated by @IsEmail
 *   - name min-length is enforced
 */

async function runValidate(payload: unknown) {
  let instance: AddDoctorDto | undefined;
  let transformError: Error | undefined;
  try {
    instance = plainToInstance(AddDoctorDto, payload);
  } catch (e) {
    transformError = e as Error;
  }
  const errors = instance ? await validate(instance) : [];
  return { instance, errors, transformError };
}

describe('AddDoctorDto', () => {
  it('accepts a valid payload (email only)', async () => {
    const { instance, errors, transformError } = await runValidate({
      name: 'Dr A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    });
    expect(transformError).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(instance!.email).toBe('a@x.com');
  });

  it('accepts a valid payload (phone only) and normalizes', async () => {
    const { instance, errors, transformError } = await runValidate({
      name: 'Dr A',
      phone: '9876543210',
      departmentId: 'dept-1',
    });
    expect(transformError).toBeUndefined();
    expect(errors).toHaveLength(0);
    expect(instance!.phone).toBe('+919876543210');
  });

  it('lower-cases and trims emails', async () => {
    const { instance } = await runValidate({
      name: 'Dr A',
      email: '   FOO@BAR.COM ',
      departmentId: 'dept-1',
    });
    expect(instance!.email).toBe('foo@bar.com');
  });

  it('rejects invalid email format', async () => {
    const { errors } = await runValidate({
      name: 'Dr A',
      email: 'not-an-email',
      departmentId: 'dept-1',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects bad phone via @Transform throw', async () => {
    const { transformError } = await runValidate({
      name: 'Dr A',
      phone: '12345',
      departmentId: 'dept-1',
    });
    expect(transformError).toBeDefined();
  });

  it('rejects name shorter than 2 chars', async () => {
    const { errors } = await runValidate({
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  // NOTE: the "email OR phone required" rule is enforced by the SERVICE
  // (see clinics.service.spec.ts) — keeping it out of the DTO lets us return
  // a clearer message: "Provide either an email or a mobile number…".
});
