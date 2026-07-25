import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RazorpayService } from './razorpay.service';
import { VerifySubscriptionPaymentDto } from './dto/subscription.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
  ) { }

  /**
   * Creates a new billing plan with pricing rules.
   */
  async createPlan(dto: {
    name: string;
    description?: string;
    billingCycle?: string;
    rules: { eventType: string; price: number; ruleType?: string }[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.billingPlan.create({
        data: {
          name: dto.name,
          description: dto.description || '',
          billingCycle: dto.billingCycle || 'MONTHLY',
          status: 'ACTIVE',
        },
      });

      if (dto.rules && dto.rules.length > 0) {
        await tx.billingRule.createMany({
          data: dto.rules.map((r) => ({
            planId: plan.id,
            eventType: r.eventType,
            price: new Prisma.Decimal(r.price),
            ruleType: r.ruleType || 'PER_EVENT',
          })),
        });
      }

      return tx.billingPlan.findUnique({
        where: { id: plan.id },
        include: { rules: true },
      });
    });
  }

  /**
   * Retrieves all active billing plans.
   */
  async getPlans() {
    return this.prisma.billingPlan.findMany({
      where: { status: 'ACTIVE' },
      include: { rules: true },
    });
  }

  /**
   * Links a clinic (business) to a billing plan.
   */
  async assignPlanToBusiness(
    businessId: string,
    planId: string,
    customPricing?: Record<string, number>,
  ) {
    const business = await this.prisma.clinic.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Clinic not found');

    const plan = await this.prisma.billingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Billing plan not found');

    const now = new Date();
    const cycleEnd = new Date();
    if (plan.billingCycle === 'ANNUALLY') {
      cycleEnd.setFullYear(now.getFullYear() + 1);
    } else {
      cycleEnd.setMonth(now.getMonth() + 1);
    }

    return this.prisma.businessBilling.upsert({
      where: { businessId },
      update: {
        planId,
        customPricing: customPricing ? JSON.parse(JSON.stringify(customPricing)) : undefined,
        billingCycleStart: now,
        billingCycleEnd: cycleEnd,
        status: 'ACTIVE',
      },
      create: {
        businessId,
        planId,
        customPricing: customPricing ? JSON.parse(JSON.stringify(customPricing)) : {},
        billingCycleStart: now,
        billingCycleEnd: cycleEnd,
        status: 'ACTIVE',
        outstandingAmount: new Prisma.Decimal(0.00),
      },
      include: { plan: true },
    });
  }

  /**
   * Fetches the dashboard overview aggregates for the Super Admin.
   */
  async getSuperAdminDashboard() {
    const activeBusinesses = await this.prisma.clinic.count();
    const activePlans = await this.prisma.billingPlan.count({ where: { status: 'ACTIVE' } });

    // Sum outstanding bills from BusinessBilling
    const billings = await this.prisma.businessBilling.findMany({
      select: { outstandingAmount: true },
    });
    const totalOutstanding = billings.reduce(
      (sum, b) => sum + Number(b.outstandingAmount),
      0,
    );

    // Sum paid invoices in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: 'COMPLETED',
      },
      select: { amount: true },
    });
    const monthlyRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Get count of usage summaries for the last 30 days
    const summaries = await this.prisma.usageSummary.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      select: { count: true },
    });
    const totalEvents30Days = summaries.reduce((sum, s) => sum + s.count, 0);

    // Get plan distributions
    const businessPlans = await this.prisma.businessBilling.findMany({
      include: { plan: { select: { name: true } } },
    });
    const planDistribution: Record<string, number> = {};
    businessPlans.forEach((bp) => {
      const name = bp.plan.name;
      planDistribution[name] = (planDistribution[name] || 0) + 1;
    });

    return {
      totals: {
        activeBusinesses,
        activePlans,
        totalOutstanding,
        monthlyRevenue,
        totalEvents30Days,
      },
      planDistribution,
    };
  }

  /**
   * Fetches billing profile and usage aggregates for all businesses.
   */
  async getBusinessesBillingList() {
    const clinics = await this.prisma.clinic.findMany({
      include: {
        locations: {
          select: {
            id: true,
            _count: {
              select: { doctors: true, users: true },
            },
          },
        },
      },
    });

    const results = [];
    for (const c of clinics) {
      const billing = await this.prisma.businessBilling.findUnique({
        where: { businessId: c.id },
        include: { plan: { include: { rules: true } } },
      });

      // Sum active locations & professionals
      const locationCount = c.locations.length;
      const professionalCount = c.locations.reduce(
        (sum, loc) => sum + (loc._count?.doctors || 0),
        0,
      );

      // Aggregated events from UsageSummary
      const summaries = await this.prisma.usageSummary.findMany({
        where: { businessId: c.id },
      });

      const totalEvents = summaries.reduce((sum, s) => sum + s.count, 0);
      const tokenCompleted = summaries
        .filter((s) => s.eventType === 'TOKEN_COMPLETED')
        .reduce((sum, s) => sum + s.count, 0);
      const appointmentsBooked = summaries
        .filter((s) => s.eventType === 'APPOINTMENT_BOOKED')
        .reduce((sum, s) => sum + s.count, 0);
      const noShows = summaries
        .filter((s) => s.eventType === 'NO_SHOW')
        .reduce((sum, s) => sum + s.count, 0);
      const cancelled = summaries
        .filter((s) => s.eventType === 'APPOINTMENT_CANCELLED')
        .reduce((sum, s) => sum + s.count, 0);
      const transfers = summaries
        .filter((s) => s.eventType === 'CUSTOMER_TRANSFERRED')
        .reduce((sum, s) => sum + s.count, 0);

      // Current bill calculation (Uninvoiced items in the active billing cycle)
      let currentBill = 0;
      let billableEventsCount = 0;
      if (billing && billing.billingCycleStart && billing.billingCycleEnd) {
        const cycleSummaries = await this.prisma.usageSummary.findMany({
          where: {
            businessId: c.id,
            date: {
              gte: billing.billingCycleStart,
              lte: billing.billingCycleEnd,
            },
          },
        });

        for (const s of cycleSummaries) {
          const price = this.getEventPrice(s.eventType, billing);
          if (price > 0) {
            currentBill += s.count * price;
            billableEventsCount += s.count;
          }
        }

        // Add FLAT_RATE rules to accrued uninvoiced current bill
        const rules = billing.plan?.rules || [];
        for (const rule of rules) {
          if (rule.ruleType === 'FLAT_RATE') {
            const price = this.getEventPrice(rule.eventType, billing);
            currentBill += price;
          }
        }
      }

      results.push({
        id: c.id,
        name: c.name,
        address: c.address,
        businessType: c.businessType,
        locationCount,
        professionalCount,
        planName: billing?.plan.name || 'No Active Plan',
        billingCycle: billing?.plan.billingCycle || 'MONTHLY',
        pricePerToken: billing ? this.getEventPrice('TOKEN_COMPLETED', billing) : 5,
        totalEvents,
        billableEvents: billableEventsCount,
        tokenCompleted,
        appointments: appointmentsBooked,
        noShows,
        cancelled,
        transfers,
        currentBill,
        outstandingAmount: billing ? Number(billing.outstandingAmount) : 0,
        status: billing?.status || 'INACTIVE',
      });
    }

    return results;
  }

  /**
   * Fetches drilldown details of a single clinic's billing profiles.
   */
  async getBusinessBillingDetails(businessId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: businessId },
      include: {
        locations: {
          select: {
            id: true,
            name: true,
            city: true,
            _count: { select: { doctors: true, users: true } },
          },
        },
      },
    });
    if (!clinic) throw new NotFoundException('Business not found');

    const billing = await this.prisma.businessBilling.findUnique({
      where: { businessId },
      include: { plan: { include: { rules: true } } },
    });

    const activeLocationsCount = clinic.locations.length;
    let doctorsCount = 0;
    let receptionistsCount = 0;
    clinic.locations.forEach((l) => {
      doctorsCount += l._count?.doctors || 0;
      receptionistsCount += l._count?.users || 0;
    });

    // Recent 50 events timeline
    const recentEvents = await this.prisma.usageEvent.findMany({
      where: { businessId },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Invoices list
    const invoices = await this.prisma.invoice.findMany({
      where: { businessId },
      orderBy: { generatedDate: 'desc' },
    });

    // Calculate current accumulated bill
    let currentBill = 0;
    const itemsAccrued: { eventType: string; count: number; price: number; total: number }[] = [];
    if (billing && billing.billingCycleStart && billing.billingCycleEnd) {
      const cycleSummaries = await this.prisma.usageSummary.findMany({
        where: {
          businessId,
          date: {
            gte: billing.billingCycleStart,
            lte: billing.billingCycleEnd,
          },
        },
      });

      // Group by event type
      const groupings: Record<string, number> = {};
      cycleSummaries.forEach((s) => {
        groupings[s.eventType] = (groupings[s.eventType] || 0) + s.count;
      });

      for (const [eventType, count] of Object.entries(groupings)) {
        const price = this.getEventPrice(eventType, billing);
        if (price > 0) {
          const total = count * price;
          currentBill += total;
          itemsAccrued.push({ eventType, count, price, total });
        }
      }

      // Add FLAT_RATE rules to accrued uninvoiced details items
      const rules = billing.plan?.rules || [];
      for (const rule of rules) {
        if (rule.ruleType === 'FLAT_RATE') {
          const price = this.getEventPrice(rule.eventType, billing);
          if (price > 0) {
            currentBill += price;
            itemsAccrued.push({
              eventType: rule.eventType || 'FIXED_COST',
              count: 1,
              price,
              total: price,
            });
          }
        }
      }
    }

    // Monthly usage stats trend (last 6 months)
    const usageTrend = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthSummaries = await this.prisma.usageSummary.findMany({
        where: {
          businessId,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      const eventsCount = monthSummaries.reduce((sum, s) => sum + s.count, 0);
      const completedTokens = monthSummaries
        .filter((s) => s.eventType === 'TOKEN_COMPLETED')
        .reduce((sum, s) => sum + s.count, 0);

      usageTrend.push({
        monthName: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        eventsCount,
        completedTokens,
      });
    }

    return {
      profile: {
        id: clinic.id,
        name: clinic.name,
        address: clinic.address,
        businessType: clinic.businessType,
        createdAt: clinic.createdAt,
        activeLocationsCount,
        doctorsCount,
        receptionistsCount,
      },
      billing: billing
        ? {
          id: billing.id,
          planName: billing.plan.name,
          billingCycle: billing.plan.billingCycle,
          billingCycleStart: billing.billingCycleStart,
          billingCycleEnd: billing.billingCycleEnd,
          customPricing: billing.customPricing,
          outstandingAmount: Number(billing.outstandingAmount),
          status: billing.status,
          currentBill,
          itemsAccrued,
        }
        : null,
      recentEvents,
      invoices,
      usageTrend,
    };
  }

  /**
   * Fetches raw UsageEvent list with filtering capabilities.
   */
  async getEventsTimeline(filters: {
    businessId?: string;
    locationId?: string;
    professionalId?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.UsageEventWhereInput = {};
    if (filters.businessId) where.businessId = filters.businessId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.professionalId) where.professionalId = filters.professionalId;
    if (filters.eventType) where.eventType = filters.eventType;

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = new Date(filters.startDate);
      if (filters.endDate) where.timestamp.lte = new Date(filters.endDate);
    }

    const [events, total] = await Promise.all([
      this.prisma.usageEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.usageEvent.count({ where }),
    ]);

    return { events, total, page, limit };
  }

  /**
   * Generates a monthly/cycle invoice from usage event summaries.
   */
  async generateInvoice(businessId: string, startDate: Date, endDate: Date, discountValue = 0) {
    // 1. Validate billing link
    const billing = await this.prisma.businessBilling.findUnique({
      where: { businessId },
      include: { plan: { include: { rules: true } } },
    });
    if (!billing) throw new BadRequestException('Business does not have a linked billing plan.');

    // 2. Resolve overlapping invoices (void old unpaid, raise error if paid)
    const overlappingInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { not: 'VOID' },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
    });

    const paidOverlap = overlappingInvoices.find((inv) => inv.status === 'PAID');
    if (paidOverlap) {
      throw new BadRequestException(
        `Cannot regenerate invoice: Billing period overlaps with a settled/paid invoice (${paidOverlap.invoiceNumber}).`,
      );
    }

    // 3. Aggregate usage summaries for dates
    const summaries = await this.prisma.usageSummary.findMany({
      where: {
        businessId,
        date: { gte: startDate, lte: endDate },
      },
    });

    // Group counts by eventType
    const itemMap: Record<string, number> = {};
    summaries.forEach((s) => {
      itemMap[s.eventType] = (itemMap[s.eventType] || 0) + s.count;
    });

    const itemsToCreate: any[] = [];
    let subtotal = 0;

    // A. Process PER_EVENT rules
    for (const [eventType, count] of Object.entries(itemMap)) {
      const price = this.getEventPrice(eventType, billing);
      if (price > 0) {
        const itemTotal = count * price;
        subtotal += itemTotal;
        itemsToCreate.push({
          eventType,
          eventCount: count,
          unitPrice: new Prisma.Decimal(price),
          totalPrice: new Prisma.Decimal(itemTotal),
        });
      }
    }

    // B. Process FLAT_RATE rules
    const rules = billing.plan?.rules || [];
    for (const rule of rules) {
      if (rule.ruleType === 'FLAT_RATE') {
        const price = this.getEventPrice(rule.eventType, billing);
        if (price > 0) {
          subtotal += price;
          itemsToCreate.push({
            eventType: rule.eventType || 'FIXED_COST',
            eventCount: 1,
            unitPrice: new Prisma.Decimal(price),
            totalPrice: new Prisma.Decimal(price),
          });
        }
      }
    }

    if (itemsToCreate.length === 0) {
      throw new BadRequestException('No billable events or flat fees found in this date range.');
    }

    const discount = new Prisma.Decimal(discountValue);
    const tax = new Prisma.Decimal(0.00); // placeholder for future tax
    const total = new Prisma.Decimal(Math.max(0, subtotal - discountValue));

    // Generate Invoice Number
    const yearMonth = startDate.toISOString().slice(0, 7).replace('-', '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${yearMonth}-${businessId.slice(0, 4).toUpperCase()}-${rand}`;

    // 4. Save Invoice in database
    return this.prisma.$transaction(async (tx) => {
      // Void old overlapping invoices and deduct their amounts from outstandingAmount
      for (const oldInv of overlappingInvoices) {
        await tx.invoice.update({
          where: { id: oldInv.id },
          data: { status: 'VOID' },
        });

        await tx.businessBilling.update({
          where: { businessId },
          data: {
            outstandingAmount: { decrement: oldInv.total },
          },
        });
      }

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          businessId,
          startDate,
          endDate,
          subtotal: new Prisma.Decimal(subtotal),
          discount,
          tax,
          total,
          status: 'UNPAID',
        },
      });

      await tx.invoiceItem.createMany({
        data: itemsToCreate.map((item) => ({
          ...item,
          invoiceId: invoice.id,
        })),
      });

      // Update business outstanding amount
      // Advancing billingCycleStart and billingCycleEnd is only done if regenerating the current active cycle
      const shouldAdvanceCycle = !billing.billingCycleStart || endDate.getTime() > billing.billingCycleStart.getTime();

      await tx.businessBilling.update({
        where: { businessId },
        data: {
          outstandingAmount: { increment: total },
          ...(shouldAdvanceCycle ? {
            billingCycleStart: endDate,
            billingCycleEnd: this.addCyclePeriod(endDate, billing.plan.billingCycle),
          } : {}),
        },
      });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: true },
      });
    });
  }

  /**
   * Settle payments for outstanding invoices.
   */
  async payInvoice(invoiceId: string, amount: number, paymentMethod = 'CASH', referenceId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already settled');

    const paymentAmount = new Prisma.Decimal(amount);

    return this.prisma.$transaction(async (tx) => {
      // 1. Record the payment
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: paymentAmount,
          status: 'COMPLETED',
          paymentMethod,
          referenceId,
        },
      });

      // 2. Settle status (assuming full payment)
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID' },
      });

      // 3. Deduct outstanding balance on Business
      await tx.businessBilling.update({
        where: { businessId: invoice.businessId },
        data: {
          outstandingAmount: { decrement: paymentAmount },
        },
      });

      return payment;
    });
  }

  /**
   * Void an unpaid invoice and deduct its total from the business outstanding amount.
   */
  async voidInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') throw new BadRequestException('Invoice is already void.');
    if (invoice.status === 'PAID') throw new BadRequestException('Settled invoices cannot be voided.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'VOID' },
      });

      await tx.businessBilling.update({
        where: { businessId: invoice.businessId },
        data: {
          outstandingAmount: { decrement: invoice.total },
        },
      });

      return updated;
    });
  }

  /**
   * Delete a billing plan (only if no active business is subscribed)
   */
  async deletePlan(planId: string) {
    const linked = await this.prisma.businessBilling.findFirst({
      where: { planId, status: 'ACTIVE' },
    });
    if (linked) {
      throw new BadRequestException('Cannot delete plan: Some clinics are currently active on this plan.');
    }
    return this.prisma.billingPlan.delete({
      where: { id: planId },
    });
  }

  /**
   * Fetch all invoices across all clinics (Super Admin only)
   */
  async getAllInvoices() {
    const invoices = await this.prisma.invoice.findMany({
      orderBy: {
        startDate: 'desc',
      },
    });

    const clinicIds = Array.from(new Set(invoices.map((inv) => inv.businessId)));
    const clinics = await this.prisma.clinic.findMany({
      where: { id: { in: clinicIds } },
      select: { id: true, name: true },
    });
    const clinicMap = new Map(clinics.map((c) => [c.id, c.name]));

    return invoices.map((inv) => ({
      ...inv,
      businessName: clinicMap.get(inv.businessId) || 'Unknown Clinic',
    }));
  }

  /* ─── Private Helpers ──────────────────────────────────────────────────── */

  private getEventPrice(eventType: string, billing: any): number {
    // Check overrides
    if (billing.customPricing) {
      const pricing = billing.customPricing as Record<string, number>;
      if (pricing[eventType] !== undefined) {
        return pricing[eventType];
      }
    }
    // Check rules
    const rule = billing.plan.rules.find((r: any) => r.eventType === eventType);
    return rule ? Number(rule.price) : 0;
  }

  private addCyclePeriod(date: Date, billingCycle: string): Date {
    const next = new Date(date);
    if (billingCycle === 'ANNUALLY') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  /**
   * Creates a Razorpay subscription order for a clinic to upgrade/downgrade to a plan.
   */
  async createSubscriptionOrder(clinicId: string, planId: string) {
    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: planId },
      include: { rules: true },
    });
    if (!plan) throw new NotFoundException('Billing plan not found');

    // Find if there is a flat rate monthly cost rule (e.g. eventType: 'SYSTEM_ACCESS')
    const flatRateRule = plan.rules.find((r) => r.ruleType === 'FLAT_RATE');
    const cost = flatRateRule ? Number(flatRateRule.price) : 0;

    if (cost <= 0) {
      // Direct free migration
      await this.assignPlanToBusiness(clinicId, planId);
      
      const now = new Date();
      const nextMonth = this.addCyclePeriod(now, plan.billingCycle);

      const subscription = await this.prisma.subscription.create({
        data: {
          clinicId,
          planId,
          status: 'ACTIVE',
          amount: new Prisma.Decimal(0.00),
          startDate: now,
          endDate: nextMonth,
        },
      });

      return { requiresPayment: false, subscription };
    }

    // Cost > 0, requires Razorpay Payment
    const amountInPaise = Math.round(cost * 100);
    const order = await this.razorpayService.createOrder(amountInPaise, clinicId, {
      clinicId,
      planId,
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        clinicId,
        planId,
        status: 'PENDING',
        razorpayOrderId: order.id,
        amount: new Prisma.Decimal(cost),
      },
    });

    return {
      requiresPayment: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      subscription,
    };
  }

  /**
   * Verifies Razorpay payment signature and activates the subscription.
   */
  async verifySubscriptionPayment(clinicId: string, dto: VerifySubscriptionPaymentDto) {
    const isValid = this.razorpayService.verifyPaymentSignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    return this.activateSubscription(dto.razorpay_order_id, dto.razorpay_payment_id, dto.razorpay_signature);
  }

  /**
   * Private helper to activate a subscription on verification or webhook trigger.
   */
  private async activateSubscription(orderId: string, paymentId: string, signature: string) {
    const pendingSub = await this.prisma.subscription.findUnique({
      where: { razorpayOrderId: orderId },
      include: { plan: true },
    });

    if (!pendingSub) {
      throw new NotFoundException('Subscription order not found');
    }

    if (pendingSub.status === 'ACTIVE') {
      return pendingSub;
    }

    const now = new Date();
    const nextMonth = this.addCyclePeriod(now, pendingSub.plan.billingCycle);

    return this.prisma.$transaction(async (tx) => {
      // 1. Update subscription status
      const updatedSub = await tx.subscription.update({
        where: { id: pendingSub.id },
        data: {
          status: 'ACTIVE',
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          startDate: now,
          endDate: nextMonth,
        },
      });

      // 2. Assign plan to business
      await tx.businessBilling.upsert({
        where: { businessId: pendingSub.clinicId },
        update: {
          planId: pendingSub.planId,
          billingCycleStart: now,
          billingCycleEnd: nextMonth,
          status: 'ACTIVE',
        },
        create: {
          businessId: pendingSub.clinicId,
          planId: pendingSub.planId,
          billingCycleStart: now,
          billingCycleEnd: nextMonth,
          status: 'ACTIVE',
          outstandingAmount: new Prisma.Decimal(0.00),
        },
      });

      // 3. Create a paid Invoice
      const invoiceNumber = `INV-SUB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${pendingSub.clinicId.slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          businessId: pendingSub.clinicId,
          startDate: now,
          endDate: nextMonth,
          subtotal: pendingSub.amount,
          discount: new Prisma.Decimal(0.00),
          tax: new Prisma.Decimal(0.00),
          total: pendingSub.amount,
          status: 'PAID',
        },
      });

      // 4. Create InvoiceItem
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          eventType: 'SYSTEM_ACCESS',
          eventCount: 1,
          unitPrice: pendingSub.amount,
          totalPrice: pendingSub.amount,
          slabDetails: 'Subscription activation',
        },
      });

      // 5. Create Payment record
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          subscriptionId: updatedSub.id,
          amount: pendingSub.amount,
          status: 'COMPLETED',
          paymentMethod: 'RAZORPAY',
          referenceId: paymentId,
        },
      });

      return updatedSub;
    });
  }

  /**
   * Handle incoming Razorpay Webhooks.
   */
  async handleRazorpayWebhook(rawBody: string, signature: string, body: any) {
    const isValid = this.razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = body.event;
    this.logger.log(`Received Razorpay webhook event: ${event}`);

    if (event === 'order.paid' || event === 'payment.captured') {
      const orderId = body.payload?.payment?.entity?.order_id || body.payload?.order?.entity?.id;
      const paymentId = body.payload?.payment?.entity?.id;
      const signatureVal = signature; // signature header itself acts as verification or dummy placeholder

      if (orderId && paymentId) {
        try {
          await this.activateSubscription(orderId, paymentId, signatureVal);
          this.logger.log(`Webhook successfully processed order.paid for Order ID: ${orderId}`);
        } catch (error) {
          this.logger.error(`Error processing webhook subscription activation: ${error.message}`);
        }
      }
    } else if (event === 'payment.failed') {
      const orderId = body.payload?.payment?.entity?.order_id;
      if (orderId) {
        await this.prisma.subscription.updateMany({
          where: { razorpayOrderId: orderId, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        this.logger.warn(`Subscription payment failed webhook registered for Order ID: ${orderId}`);
      }
    } else if (event === 'refund.processed') {
      const paymentId = body.payload?.payment?.entity?.id;
      if (paymentId) {
        const payment = await this.prisma.payment.findFirst({
          where: { referenceId: paymentId },
        });

        if (payment) {
          await this.prisma.$transaction(async (tx) => {
            // Update Payment to REFUNDED
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: 'REFUNDED' },
            });

            // Update associated invoice to unpaid/refunded
            if (payment.invoiceId) {
              await tx.invoice.update({
                where: { id: payment.invoiceId },
                data: { status: 'VOID' }, // Or VOID / REFUNDED
              });
            }

            // Cancel subscription
            if (payment.subscriptionId) {
              await tx.subscription.update({
                where: { id: payment.subscriptionId },
                data: { status: 'CANCELLED' },
              });

              // Suspend billing status
              const sub = await tx.subscription.findUnique({ where: { id: payment.subscriptionId } });
              if (sub) {
                await tx.businessBilling.update({
                  where: { businessId: sub.clinicId },
                  data: { status: 'SUSPENDED' },
                });
              }
            }
          });
          this.logger.log(`Refund processed and logged for payment ID: ${paymentId}`);
        }
      }
    }

    return { received: true };
  }
}
