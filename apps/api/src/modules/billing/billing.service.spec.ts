import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RazorpayService } from './razorpay.service';

describe('BillingService', () => {
  let service: BillingService;

  const mockPrisma = {
    $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    billingPlan: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    billingRule: {
      createMany: jest.fn(),
    },
    clinic: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
    },
    businessBilling: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    usageSummary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoice: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    invoiceItem: {
      createMany: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
  };

  const mockRazorpayService = {
    createOrder: jest.fn(),
    verifyPaymentSignature: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RazorpayService, useValue: mockRazorpayService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
  });

  describe('createPlan', () => {
    it('creates a billing plan and its rules successfully', async () => {
      mockPrisma.billingPlan.create.mockResolvedValue({ id: 'plan-1', name: 'Standard' });
      mockPrisma.billingPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Standard',
        rules: [{ id: 'rule-1', eventType: 'TOKEN_COMPLETED', price: new Prisma.Decimal(5.0) }],
      });

      const res = await service.createPlan({
        name: 'Standard',
        description: 'Standard plan',
        rules: [{ eventType: 'TOKEN_COMPLETED', price: 5.0 }],
      });

      expect(mockPrisma.billingPlan.create).toHaveBeenCalledWith({
        data: { name: 'Standard', description: 'Standard plan', billingCycle: 'MONTHLY', status: 'ACTIVE' },
      });
      expect(mockPrisma.billingRule.createMany).toHaveBeenCalled();
      expect(res?.name).toBe('Standard');
    });
  });

  describe('assignPlanToBusiness', () => {
    it('throws error if business (clinic) not found', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(null);
      await expect(service.assignPlanToBusiness('c-1', 'plan-1')).rejects.toThrow('Clinic not found');
    });

    it('throws error if billing plan not found', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue({ id: 'c-1', name: 'Clinic A' });
      mockPrisma.billingPlan.findUnique.mockResolvedValue(null);
      await expect(service.assignPlanToBusiness('c-1', 'plan-1')).rejects.toThrow('Billing plan not found');
    });

    it('upserts business billing link on success', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue({ id: 'c-1', name: 'Clinic A' });
      mockPrisma.billingPlan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Standard', billingCycle: 'MONTHLY' });
      mockPrisma.businessBilling.upsert.mockResolvedValue({ businessId: 'c-1', planId: 'plan-1' });

      const res = await service.assignPlanToBusiness('c-1', 'plan-1');

      expect(mockPrisma.businessBilling.upsert).toHaveBeenCalled();
      expect(res?.planId).toBe('plan-1');
    });
  });

  describe('payInvoice', () => {
    it('throws NotFound if invoice doesn\'t exist', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);
      await expect(service.payInvoice('inv-1', 500)).rejects.toThrow('Invoice not found');
    });

    it('throws BadRequest if invoice is already paid', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'PAID' });
      await expect(service.payInvoice('inv-1', 500)).rejects.toThrow('Invoice is already settled');
    });

    it('processes transaction on unpaid invoice successfully', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'UNPAID', total: new Prisma.Decimal(500) });
      mockPrisma.payment.create.mockResolvedValue({ id: 'p-1', amount: new Prisma.Decimal(500) });

      const payment = await service.payInvoice('inv-1', 500, 'CARD', 'txn_123');

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: {
          invoiceId: 'inv-1',
          amount: new Prisma.Decimal(500),
          status: 'COMPLETED',
          paymentMethod: 'CARD',
          referenceId: 'txn_123',
        },
      });
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'PAID' },
      });
      expect(mockPrisma.businessBilling.update).toHaveBeenCalled();
      expect(Number(payment.amount)).toBe(500);
    });
  });

  describe('generateInvoice', () => {
    it('throws error if billing period overlaps with settled/paid invoice', async () => {
      mockPrisma.businessBilling.findUnique.mockResolvedValue({
        id: 'bb-1',
        businessId: 'c-1',
        plan: {
          id: 'plan-1',
          name: 'Standard',
          rules: [{ id: 'r-1', eventType: 'TOKEN_COMPLETED', price: new Prisma.Decimal(5.0), ruleType: 'PER_EVENT' }],
        },
      });

      mockPrisma.invoice.findMany = jest.fn().mockResolvedValue([
        { id: 'inv-old', invoiceNumber: 'INV-123', status: 'PAID', total: new Prisma.Decimal(100) },
      ]);

      await expect(service.generateInvoice('c-1', new Date(), new Date())).rejects.toThrow(
        'Cannot regenerate invoice: Billing period overlaps with a settled/paid invoice',
      );
    });

    it('voids old unpaid overlapping invoices and decrements outstanding balance', async () => {
      mockPrisma.businessBilling.findUnique.mockResolvedValue({
        id: 'bb-1',
        businessId: 'c-1',
        billingCycleStart: new Date(),
        plan: {
          id: 'plan-1',
          name: 'Standard',
          billingCycle: 'MONTHLY',
          rules: [{ id: 'r-1', eventType: 'TOKEN_COMPLETED', price: new Prisma.Decimal(5.0), ruleType: 'PER_EVENT' }],
        },
      });

      mockPrisma.invoice.findMany = jest.fn().mockResolvedValue([
        { id: 'inv-old', invoiceNumber: 'INV-123', status: 'UNPAID', total: new Prisma.Decimal(100) },
      ]);

      mockPrisma.usageSummary.findMany.mockResolvedValue([
        { eventType: 'TOKEN_COMPLETED', count: 10 },
      ]);

      const mockNewInvoice = { id: 'inv-new', invoiceNumber: 'INV-NEW-99', total: new Prisma.Decimal(50) };
      mockPrisma.invoice.create.mockResolvedValue(mockNewInvoice);
      mockPrisma.invoice.findUnique.mockResolvedValue({ ...mockNewInvoice, items: [] });

      const res = await service.generateInvoice('c-1', new Date(), new Date());

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-old' },
        data: { status: 'VOID' },
      });
      expect(mockPrisma.businessBilling.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { businessId: 'c-1' },
      }));
      expect(res?.id).toBe('inv-new');
    });
  });

  describe('deletePlan', () => {
    it('throws BadRequest if clinics are active on the plan', async () => {
      mockPrisma.businessBilling.findFirst.mockResolvedValue({ id: 'bb-1', planId: 'plan-1', status: 'ACTIVE' });
      await expect(service.deletePlan('plan-1')).rejects.toThrow('Cannot delete plan: Some clinics are currently active on this plan.');
    });

    it('deletes plan successfully if no active links exist', async () => {
      mockPrisma.businessBilling.findFirst.mockResolvedValue(null);
      mockPrisma.billingPlan.delete.mockResolvedValue({ id: 'plan-1' });

      const res = await service.deletePlan('plan-1');

      expect(mockPrisma.billingPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
      expect(res.id).toBe('plan-1');
    });
  });
});
