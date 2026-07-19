import { ConflictException } from '@nestjs/common';
import { SignupRequestStatus } from '@prisma/client';
import { SignupRequestsService } from './signup-requests.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClinicsService } from '../clinics/clinics.service';

function makeService() {
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const count = jest.fn();

  const prisma = {
    businessSignupRequest: { findFirst, findUnique, create, update, count },
    clinic: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const clinics = {
    create: jest.fn(),
  } as unknown as ClinicsService;

  return {
    svc: new SignupRequestsService(prisma, clinics),
    findFirst,
    create,
    update,
    count,
    clinics,
  };
}

describe('SignupRequestsService', () => {
  it('creates a new signup request', async () => {
    const { svc, findFirst, create } = makeService();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({
      id: 'r1',
      businessName: 'City Clinic',
      contactName: 'Ana',
      email: 'ana@clinic.com',
      phone: '+919876543210',
      status: SignupRequestStatus.PENDING,
    });

    const row = await svc.create({
      businessName: 'City Clinic',
      contactName: 'Ana',
      email: 'ana@clinic.com',
      phone: '+919876543210',
    });

    expect(row.businessName).toBe('City Clinic');
    expect(create).toHaveBeenCalled();
  });

  it('rejects duplicate pending requests for same email', async () => {
    const { svc, findFirst } = makeService();
    findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      svc.create({
        businessName: 'City Clinic',
        contactName: 'Ana',
        email: 'ana@clinic.com',
        phone: '+919876543210',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
