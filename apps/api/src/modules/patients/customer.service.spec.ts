import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CustomerService } from './customer.service';
import { PrismaService } from '../../common/prisma/prisma.service';

function makeService() {
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();

  const prisma = {
    user: { findFirst, findUnique, create, update },
  } as unknown as PrismaService;

  return {
    svc: new CustomerService(prisma),
    findFirst,
    findUnique,
    create,
    update,
  };
}

describe('CustomerService', () => {
  describe('generateUniquePin', () => {
    it('returns a 4-digit PIN in range 1000–9999', async () => {
      const { svc, findFirst } = makeService();
      findFirst.mockResolvedValue(null);

      const pin = await svc.generateUniquePin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(parseInt(pin, 10)).toBeGreaterThanOrEqual(1000);
      expect(parseInt(pin, 10)).toBeLessThanOrEqual(9999);
    });

    it('retries on collision', async () => {
      const { svc, findFirst } = makeService();
      findFirst
        .mockResolvedValueOnce({ id: 'taken' })
        .mockResolvedValueOnce(null);

      const pin = await svc.generateUniquePin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('upsertByPhone', () => {
    it('creates a new customer with a generated PIN', async () => {
      const { svc, findUnique, findFirst, create } = makeService();
      findUnique.mockResolvedValueOnce(null);
      findFirst.mockResolvedValue(null);
      create.mockResolvedValueOnce({
        id: 'c-1',
        role: Role.PATIENT,
        phone: '+919876543210',
        name: 'Alice',
        customerPin: '4315',
      });

      const user = await svc.upsertByPhone('+919876543210', 'Alice');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: Role.PATIENT,
            phone: '+919876543210',
            name: 'Alice',
            customerPin: expect.stringMatching(/^\d{4}$/),
          }),
        }),
      );
      expect(user.customerPin).toBe('4315');
    });

    it('reuses existing customer and does not change PIN', async () => {
    const { svc, findUnique, update, create } = makeService();
    findUnique.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      phone: '+919876543210',
      name: 'Old Name',
      customerPin: '9999',
    });
    update.mockResolvedValueOnce({
      id: 'c-1',
      role: Role.PATIENT,
      phone: '+919876543210',
      name: 'New Name',
      customerPin: '9999',
    });

    const user = await svc.upsertByPhone('+919876543210', 'New Name');
    expect(update).toHaveBeenCalledWith({
      where: { phone: '+919876543210' },
      data: { name: 'New Name' },
    });
    expect(create).not.toHaveBeenCalled();
    expect(user.customerPin).toBe('9999');
  });

  it('assigns a PIN to legacy customers missing one', async () => {
    const { svc, findUnique, update, findFirst, create } = makeService();
    findUnique.mockResolvedValueOnce({
      id: 'c-2',
      role: Role.PATIENT,
      phone: '+919111111111',
      name: 'Legacy',
      customerPin: null,
    });
    update
      .mockResolvedValueOnce({
        id: 'c-2',
        role: Role.PATIENT,
        phone: '+919111111111',
        name: 'Legacy',
        customerPin: null,
      })
      .mockResolvedValueOnce({
        id: 'c-2',
        customerPin: '4321',
      });
    findFirst.mockResolvedValue(null);

    const user = await svc.upsertByPhone('+919111111111', 'Legacy');
    expect(user.customerPin).toMatch(/^\d{4}$/);
    expect(update).toHaveBeenCalledTimes(2);
  });

    it('rejects staff phone numbers', async () => {
      const { svc, findUnique } = makeService();
      findUnique.mockResolvedValueOnce({
        id: 's-1',
        role: Role.RECEPTIONIST,
        phone: '+919876543210',
      });

      await expect(svc.upsertByPhone('+919876543210', 'Bob')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
