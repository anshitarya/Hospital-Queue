import { ConflictException, Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const PIN_MIN = 1000;
const PIN_MAX = 9999;
const MAX_PIN_COLLISION_RETRIES = 50;

/** Fields safe to expose on queue snapshots and reception views. */
export const CUSTOMER_PUBLIC_SELECT = {
  id: true,
  name: true,
  phone: true,
  customerPin: true,
} as const;

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a unique 4-digit Customer PIN (1000–9999).
   * Retries on collision up to MAX_PIN_COLLISION_RETRIES times.
   */
  async generateUniquePin(): Promise<string> {
    for (let attempt = 0; attempt < MAX_PIN_COLLISION_RETRIES; attempt++) {
      const pin = String(Math.floor(Math.random() * (PIN_MAX - PIN_MIN + 1)) + PIN_MIN);
      const clash = await this.prisma.user.findFirst({
        where: { customerPin: pin },
        select: { id: true },
      });
      if (!clash) return pin;
    }
    throw new ConflictException('Unable to assign a Customer PIN — please try again');
  }

  /**
   * Find or create a global customer record by phone.
   * Reuses the existing Customer PIN when the phone is already registered.
   * Never overwrites an existing PIN.
   */
  async upsertByPhone(phone: string, name: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    if (existing) {
      if (existing.role !== Role.PATIENT) {
        throw new ConflictException('This phone number is registered to a staff account');
      }
      const updated = await this.prisma.user.update({
        where: { phone },
        data: { name },
      });
      if (!updated.customerPin) {
        const customerPin = await this.ensurePin(updated);
        return { ...updated, customerPin };
      }
      return updated;
    }

    const customerPin = await this.generateUniquePin();
    return this.prisma.user.create({
      data: {
        role: Role.PATIENT,
        name,
        phone,
        customerPin,
        phoneVerified: true,
      },
    });
  }

  /** Backfill a PIN for legacy customers that somehow lack one (should not happen post-migration). */
  async ensurePin(user: Pick<User, 'id' | 'customerPin'>): Promise<string> {
    if (user.customerPin) return user.customerPin;
    const customerPin = await this.generateUniquePin();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { customerPin },
    });
    return customerPin;
  }
}
